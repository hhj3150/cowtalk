// Animal MDM 서비스 — 개체 생성·수정·삭제·상태변경·센서매핑
//
// 권한 모델:
// - farmer, veterinarian 역할만 CUD 가능 (RBAC 매트릭스에서 차단)
// - 그 위에 농장 단위 접근 — userFarmAccess.permissionLevel === 'write'
//   또는 JWT farmIds에 해당 farmId 포함되어야 함
// - admin 역할은 전체 접근
//
// 불변 규칙:
// - 동일 농장 내 earTag 중복 금지
// - traceId (이력제번호) 전체 시스템 내 유일
// - 상태변경은 반드시 animal_status_history에 이력 남김
// - 소프트 삭제 (deletedAt 설정)
//
// 보안:
// - 모든 쓰기 작업 전에 농장 접근 권한 검증
// - 에러 시 구체 사유 로그 (사용자에겐 일반 메시지만)

import { and, eq, isNull, ne } from 'drizzle-orm';
import { getDb } from '../../config/database.js';
import { animals, userFarmAccess, animalStatusHistory, farms } from '../../db/schema.js';
import { logger } from '../../lib/logger.js';
import { ForbiddenError, NotFoundError, ConflictError, BadRequestError } from '../../lib/errors.js';
import type { Role } from '@cowtalk/shared';

// === 타입 ===

export interface CreateAnimalInput {
  readonly farmId: string;
  readonly earTag: string;
  readonly traceId?: string;
  readonly name?: string;
  readonly breed: 'holstein' | 'jersey' | 'hanwoo' | 'brown_swiss' | 'simmental' | 'mixed' | 'other';
  readonly breedType?: 'dairy' | 'beef';
  readonly sex: 'female' | 'male';
  readonly birthDate?: Date;
  readonly parity?: number;
  readonly currentDeviceId?: string;
}

export interface UpdateAnimalInput {
  readonly earTag?: string;
  readonly traceId?: string | null;
  readonly name?: string | null;
  readonly breed?: 'holstein' | 'jersey' | 'hanwoo' | 'brown_swiss' | 'simmental' | 'mixed' | 'other';
  readonly breedType?: 'dairy' | 'beef';
  readonly sex?: 'female' | 'male';
  readonly birthDate?: Date | null;
  readonly parity?: number;
  readonly currentDeviceId?: string | null;
}

export interface ChangeStatusInput {
  readonly status: 'active' | 'sold' | 'dead' | 'culled' | 'transferred';
  readonly reason?: string;
  readonly occurredAt?: Date;
  readonly destinationFarmId?: string; // transferred 경우만
}

// === 헬퍼 ===

const BEEF_BREEDS: ReadonlySet<string> = new Set(['hanwoo', 'simmental']);

function deriveBreedType(breed: string): 'dairy' | 'beef' {
  return BEEF_BREEDS.has(breed) ? 'beef' : 'dairy';
}

/**
 * 사용자가 특정 농장에 쓰기 권한이 있는지 검증.
 * admin 역할은 항상 허용. 그 외는 userFarmAccess 또는 JWT farmIds 필요.
 */
async function assertFarmWriteAccess(
  userId: string,
  userRole: Role,
  userFarmIds: readonly string[],
  farmId: string,
): Promise<void> {
  // admin은 전체 접근
  if (userRole === 'government_admin') return;

  // JWT farmIds에 포함되면 허용
  if (userFarmIds.includes(farmId)) return;

  // userFarmAccess에 write 권한 확인
  const db = getDb();
  const [access] = await db
    .select({ permissionLevel: userFarmAccess.permissionLevel })
    .from(userFarmAccess)
    .where(and(eq(userFarmAccess.userId, userId), eq(userFarmAccess.farmId, farmId)))
    .limit(1);

  if (!access) {
    throw new ForbiddenError('이 농장에 접근 권한이 없습니다');
  }
  if (access.permissionLevel !== 'write' && access.permissionLevel !== 'admin') {
    throw new ForbiddenError('이 농장에 쓰기 권한이 없습니다');
  }
}

/**
 * 농장 내 귀표번호 중복 검사 (삭제된 개체는 제외).
 * excludeAnimalId는 수정 시 자기 자신 제외용.
 */
async function assertEarTagUniqueInFarm(
  farmId: string,
  earTag: string,
  excludeAnimalId?: string,
): Promise<void> {
  const db = getDb();
  const conditions = [
    eq(animals.farmId, farmId),
    eq(animals.earTag, earTag),
    isNull(animals.deletedAt),
  ];
  if (excludeAnimalId) {
    conditions.push(ne(animals.animalId, excludeAnimalId));
  }
  const [existing] = await db
    .select({ animalId: animals.animalId })
    .from(animals)
    .where(and(...conditions))
    .limit(1);

  if (existing) {
    throw new ConflictError(`귀표번호 ${earTag}는 이 농장에 이미 등록되어 있습니다`);
  }
}

/**
 * 이력제번호 전역 유일성 검사.
 */
async function assertTraceIdUnique(
  traceId: string,
  excludeAnimalId?: string,
): Promise<void> {
  const db = getDb();
  const conditions = [eq(animals.traceId, traceId), isNull(animals.deletedAt)];
  if (excludeAnimalId) {
    conditions.push(ne(animals.animalId, excludeAnimalId));
  }
  const [existing] = await db
    .select({ animalId: animals.animalId, farmId: animals.farmId })
    .from(animals)
    .where(and(...conditions))
    .limit(1);

  if (existing) {
    throw new ConflictError(`이력제번호 ${traceId}는 이미 다른 개체에 등록되어 있습니다`);
  }
}

/**
 * 농장 존재 확인 (삭제되지 않은 활성 농장).
 */
async function assertFarmExists(farmId: string): Promise<void> {
  const db = getDb();
  const [farm] = await db
    .select({ farmId: farms.farmId })
    .from(farms)
    .where(and(eq(farms.farmId, farmId), isNull(farms.deletedAt)))
    .limit(1);
  if (!farm) {
    throw new NotFoundError(`농장 ${farmId}을 찾을 수 없습니다`);
  }
}

// === 메인 ===

/**
 * 동물 생성.
 */
export async function createAnimal(
  input: CreateAnimalInput,
  userId: string,
  userRole: Role,
  userFarmIds: readonly string[],
): Promise<typeof animals.$inferSelect> {
  // 1. 권한 검증
  await assertFarmWriteAccess(userId, userRole, userFarmIds, input.farmId);

  // 2. 농장 존재 확인
  await assertFarmExists(input.farmId);

  // 3. 귀표번호 중복 검사
  await assertEarTagUniqueInFarm(input.farmId, input.earTag);

  // 4. 이력제번호 유일성 검사 (있는 경우만)
  if (input.traceId) {
    await assertTraceIdUnique(input.traceId);
  }

  // 5. breedType 자동 도출 (미지정 시)
  const breedType = input.breedType ?? deriveBreedType(input.breed);

  // 6. DB 삽입
  const db = getDb();
  const [created] = await db
    .insert(animals)
    .values({
      farmId: input.farmId,
      earTag: input.earTag,
      traceId: input.traceId ?? null,
      name: input.name ?? null,
      breed: input.breed,
      breedType,
      sex: input.sex,
      birthDate: input.birthDate ? input.birthDate.toISOString().slice(0, 10) : null,
      parity: input.parity ?? 0,
      currentDeviceId: input.currentDeviceId ?? null,
      status: 'active',
    })
    .returning();

  if (!created) {
    throw new Error('동물 생성 실패 — DB가 결과를 반환하지 않음');
  }

  logger.info(
    { animalId: created.animalId, farmId: input.farmId, earTag: input.earTag, userId },
    '[animal-mdm] created',
  );

  return created;
}

/**
 * 동물 수정 (부분 업데이트).
 */
export async function updateAnimal(
  animalId: string,
  input: UpdateAnimalInput,
  userId: string,
  userRole: Role,
  userFarmIds: readonly string[],
): Promise<typeof animals.$inferSelect> {
  const db = getDb();

  // 1. 기존 개체 조회
  const [existing] = await db
    .select()
    .from(animals)
    .where(and(eq(animals.animalId, animalId), isNull(animals.deletedAt)))
    .limit(1);

  if (!existing) {
    throw new NotFoundError(`동물 ${animalId}을 찾을 수 없습니다`);
  }

  // 2. 권한 검증
  await assertFarmWriteAccess(userId, userRole, userFarmIds, existing.farmId);

  // 3. 귀표번호 변경 시 중복 검사
  if (input.earTag !== undefined && input.earTag !== existing.earTag) {
    await assertEarTagUniqueInFarm(existing.farmId, input.earTag, animalId);
  }

  // 4. 이력제번호 변경 시 유일성 검사
  if (input.traceId !== undefined && input.traceId !== null && input.traceId !== existing.traceId) {
    await assertTraceIdUnique(input.traceId, animalId);
  }

  // 5. breedType 자동 재도출 (breed 변경 시, 명시값 없으면)
  let breedType = input.breedType;
  if (input.breed && !input.breedType) {
    breedType = deriveBreedType(input.breed);
  }

  // 6. 업데이트 (undefined 필드는 제외 — 실제 변경된 필드만)
  const updates: Partial<typeof animals.$inferInsert> = {
    updatedAt: new Date(),
  };
  if (input.earTag !== undefined) updates.earTag = input.earTag;
  if (input.traceId !== undefined) updates.traceId = input.traceId;
  if (input.name !== undefined) updates.name = input.name;
  if (input.breed !== undefined) updates.breed = input.breed;
  if (breedType !== undefined) updates.breedType = breedType;
  if (input.sex !== undefined) updates.sex = input.sex;
  if (input.birthDate !== undefined) {
    updates.birthDate = input.birthDate ? input.birthDate.toISOString().slice(0, 10) : null;
  }
  if (input.parity !== undefined) updates.parity = input.parity;
  if (input.currentDeviceId !== undefined) updates.currentDeviceId = input.currentDeviceId;

  const [updated] = await db
    .update(animals)
    .set(updates)
    .where(eq(animals.animalId, animalId))
    .returning();

  if (!updated) {
    throw new Error('동물 수정 실패');
  }

  logger.info({ animalId, userId, fields: Object.keys(updates) }, '[animal-mdm] updated');

  return updated;
}

/**
 * 동물 상태 변경 (active/sold/dead/culled/transferred).
 * animal_status_history에 이력 남김.
 */
export async function changeAnimalStatus(
  animalId: string,
  input: ChangeStatusInput,
  userId: string,
  userRole: Role,
  userFarmIds: readonly string[],
): Promise<typeof animals.$inferSelect> {
  const db = getDb();

  // 1. 기존 개체 조회
  const [existing] = await db
    .select()
    .from(animals)
    .where(and(eq(animals.animalId, animalId), isNull(animals.deletedAt)))
    .limit(1);

  if (!existing) {
    throw new NotFoundError(`동물 ${animalId}을 찾을 수 없습니다`);
  }

  // 2. 권한 검증 (현재 농장)
  await assertFarmWriteAccess(userId, userRole, userFarmIds, existing.farmId);

  // 3. transferred 경우 추가 검증
  if (input.status === 'transferred') {
    if (!input.destinationFarmId) {
      throw new BadRequestError('이동 상태는 목적지 농장(destinationFarmId)이 필요합니다');
    }
    if (input.destinationFarmId === existing.farmId) {
      throw new BadRequestError('목적지 농장이 현재 농장과 동일합니다');
    }
    // 목적지 농장에도 쓰기 권한 필요
    await assertFarmWriteAccess(userId, userRole, userFarmIds, input.destinationFarmId);
    await assertFarmExists(input.destinationFarmId);
  }

  // 4. 같은 상태로 변경 시도 차단
  if (existing.status === input.status) {
    throw new ConflictError(`이미 ${input.status} 상태입니다`);
  }

  // 5. 트랜잭션 — 상태 변경 + 히스토리 기록 + (transferred는 farmId 변경)
  type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
  const result = await db.transaction(async (tx: Tx) => {
    // 5-1. 이력 기록
    await tx.insert(animalStatusHistory).values({
      animalId,
      previousStatus: existing.status,
      newStatus: input.status,
      changedAt: input.occurredAt ?? new Date(),
      changedBy: userId,
      reason: input.reason ?? null,
    });

    // 5-2. 동물 테이블 업데이트
    const updates: Partial<typeof animals.$inferInsert> = {
      status: input.status,
      updatedAt: new Date(),
    };
    if (input.status === 'transferred' && input.destinationFarmId) {
      updates.farmId = input.destinationFarmId;
      // 전송 후에는 active 상태로 복원 (목적지에서 정상 사육)
      updates.status = 'active';
    }
    if (input.status === 'dead' || input.status === 'culled' || input.status === 'sold') {
      // 센서 자동 해제 (처분 시)
      updates.currentDeviceId = null;
    }

    const [updated] = await tx
      .update(animals)
      .set(updates)
      .where(eq(animals.animalId, animalId))
      .returning();

    if (!updated) {
      throw new Error('상태 변경 실패');
    }
    return updated;
  });

  logger.info(
    {
      animalId,
      userId,
      previousStatus: existing.status,
      newStatus: input.status,
      reason: input.reason,
    },
    '[animal-mdm] status changed',
  );

  return result;
}

/**
 * 센서 매핑 변경 (동물 ↔ smaXtec serial).
 * null을 전달하면 센서 해제.
 */
export async function assignSensor(
  animalId: string,
  deviceId: string | null,
  userId: string,
  userRole: Role,
  userFarmIds: readonly string[],
): Promise<typeof animals.$inferSelect> {
  const db = getDb();

  const [existing] = await db
    .select()
    .from(animals)
    .where(and(eq(animals.animalId, animalId), isNull(animals.deletedAt)))
    .limit(1);

  if (!existing) {
    throw new NotFoundError(`동물 ${animalId}을 찾을 수 없습니다`);
  }

  await assertFarmWriteAccess(userId, userRole, userFarmIds, existing.farmId);

  // 센서 deviceId가 지정된 경우 — 같은 농장 내 다른 개체가 쓰고 있는지 확인
  if (deviceId !== null) {
    const [conflicting] = await db
      .select({ animalId: animals.animalId, earTag: animals.earTag })
      .from(animals)
      .where(
        and(
          eq(animals.farmId, existing.farmId),
          eq(animals.currentDeviceId, deviceId),
          ne(animals.animalId, animalId),
          isNull(animals.deletedAt),
        ),
      )
      .limit(1);

    if (conflicting) {
      throw new ConflictError(
        `센서 ${deviceId}는 이미 ${conflicting.earTag}번 개체에 장착되어 있습니다. 먼저 해당 개체에서 해제하세요.`,
      );
    }
  }

  const [updated] = await db
    .update(animals)
    .set({ currentDeviceId: deviceId, updatedAt: new Date() })
    .where(eq(animals.animalId, animalId))
    .returning();

  if (!updated) {
    throw new Error('센서 매핑 변경 실패');
  }

  logger.info(
    { animalId, userId, previousDevice: existing.currentDeviceId, newDevice: deviceId },
    '[animal-mdm] sensor assignment changed',
  );

  return updated;
}

/**
 * 동물 소프트 삭제 (실수 대비 복구 가능).
 * 실제 처분(죽음·도태 등)은 changeAnimalStatus를 쓰고,
 * 이 함수는 "등록이 잘못된 경우의 취소"용.
 */
export async function deleteAnimal(
  animalId: string,
  userId: string,
  userRole: Role,
  userFarmIds: readonly string[],
): Promise<void> {
  const db = getDb();

  const [existing] = await db
    .select()
    .from(animals)
    .where(and(eq(animals.animalId, animalId), isNull(animals.deletedAt)))
    .limit(1);

  if (!existing) {
    throw new NotFoundError(`동물 ${animalId}을 찾을 수 없습니다`);
  }

  await assertFarmWriteAccess(userId, userRole, userFarmIds, existing.farmId);

  await db
    .update(animals)
    .set({ deletedAt: new Date(), updatedAt: new Date() })
    .where(eq(animals.animalId, animalId));

  logger.info({ animalId, userId, farmId: existing.farmId }, '[animal-mdm] soft-deleted');
}
