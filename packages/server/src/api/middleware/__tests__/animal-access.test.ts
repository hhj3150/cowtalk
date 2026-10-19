// requireAnimalAccess 동작 검증 — 누가 어떤 개체를 볼 수 있는가
//
// 검증하려는 위협: 수의사 A가 담당하지 않는 목장의 animalId를 알아내 데이터를 읽는 것.
// rbac의 역할 검사("수의사는 센서를 읽을 수 있다")만으로는 이걸 막지 못한다.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response, NextFunction } from 'express';

const FARM_A = '11111111-1111-1111-1111-111111111111';
const FARM_B = '22222222-2222-2222-2222-222222222222';
const ANIMAL_IN_A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const ANIMAL_IN_B = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const ANIMAL_MISSING = 'cccccccc-cccc-cccc-cccc-cccccccccccc';

/** animalId → farmId 매핑을 흉내내는 DB 스텁 */
const ANIMAL_FARM: Readonly<Record<string, string>> = {
  [ANIMAL_IN_A]: FARM_A,
  [ANIMAL_IN_B]: FARM_B,
};

vi.mock('../../../config/database.js', () => ({
  getDb: () => ({
    select: () => ({
      from: () => ({
        where: (cond: { __animalId?: string }) => ({
          limit: () => {
            const id = cond.__animalId ?? '';
            const farmId = ANIMAL_FARM[id];
            return Promise.resolve(farmId ? [{ farmId }] : []);
          },
        }),
      }),
    }),
  }),
}));

// drizzle eq()가 무엇을 비교하는지 스텁이 알 수 있도록 값을 실어 보낸다
vi.mock('drizzle-orm', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('drizzle-orm');
  return { ...actual, eq: (_col: unknown, val: string) => ({ __animalId: val }) };
});

const { requireAnimalAccess, __testing } = await import('../animal-access.js');

interface RunResult {
  readonly passed: boolean;
  readonly error?: Error;
  readonly animalFarmId?: string;
}

async function run(
  user: Record<string, unknown> | undefined,
  animalId: string,
): Promise<RunResult> {
  const req = { user, params: { animalId } } as unknown as Request;
  let error: Error | undefined;
  let passed = false;
  const next: NextFunction = (err?: unknown) => {
    if (err) error = err as Error;
    else passed = true;
  };
  await requireAnimalAccess()(req, {} as Response, next);
  return { passed, error, animalFarmId: (req as Request).animalFarmId };
}

describe('requireAnimalAccess', () => {
  beforeEach(() => { __testing.clearCache(); });

  it('배정된 목장의 개체는 통과하고 farmId를 실어 준다', async () => {
    const r = await run({ userId: 'u1', role: 'veterinarian', farmIds: [FARM_A] }, ANIMAL_IN_A);
    expect(r.passed).toBe(true);
    expect(r.animalFarmId).toBe(FARM_A);
  });

  // 이 테스트가 실제 취약점을 재현한다 — 수정 전에는 통과했다.
  it('배정되지 않은 목장의 개체는 차단한다', async () => {
    const r = await run({ userId: 'u1', role: 'veterinarian', farmIds: [FARM_A] }, ANIMAL_IN_B);
    expect(r.passed).toBe(false);
    expect(r.error?.name).toBe('ForbiddenError');
  });

  it('농장주도 동일하게 차단된다', async () => {
    const r = await run({ userId: 'u2', role: 'farmer', farmIds: [FARM_A] }, ANIMAL_IN_B);
    expect(r.passed).toBe(false);
    expect(r.error?.name).toBe('ForbiddenError');
  });

  it('마스터는 전체 개체에 접근한다', async () => {
    const r = await run({ userId: 'm', role: 'government_admin', isMaster: true, farmIds: [] }, ANIMAL_IN_B);
    expect(r.passed).toBe(true);
  });

  it('미배정 관리역할(행정관)은 전체 접근 — 전국 방역 업무', async () => {
    const r = await run({ userId: 'g', role: 'government_admin', farmIds: [] }, ANIMAL_IN_B);
    expect(r.passed).toBe(true);
  });

  it('배정된 관리역할은 배정 목장으로 제한된다 — 배정 우선 규칙', async () => {
    const r = await run({ userId: 'g2', role: 'quarantine_officer', farmIds: [FARM_A] }, ANIMAL_IN_B);
    expect(r.passed).toBe(false);
    expect(r.error?.name).toBe('ForbiddenError');
  });

  it('미배정 농장주는 아무 개체도 못 본다', async () => {
    const r = await run({ userId: 'u3', role: 'farmer', farmIds: [] }, ANIMAL_IN_A);
    expect(r.passed).toBe(false);
    expect(r.error?.name).toBe('ForbiddenError');
  });

  it('존재하지 않는 개체는 404', async () => {
    const r = await run({ userId: 'm', role: 'government_admin', isMaster: true }, ANIMAL_MISSING);
    expect(r.passed).toBe(false);
    expect(r.error?.name).toBe('NotFoundError');
  });

  it('UUID가 아닌 파라미터는 DB를 때리지 않고 404', async () => {
    const r = await run({ userId: 'm', role: 'government_admin', isMaster: true }, "' OR 1=1--");
    expect(r.passed).toBe(false);
    expect(r.error?.name).toBe('NotFoundError');
  });

  it('인증 없으면 401', async () => {
    const r = await run(undefined, ANIMAL_IN_A);
    expect(r.passed).toBe(false);
    expect(r.error?.name).toBe('UnauthorizedError');
  });

  it('같은 개체를 반복 조회하면 캐시를 쓴다', async () => {
    await run({ userId: 'u1', role: 'veterinarian', farmIds: [FARM_A] }, ANIMAL_IN_A);
    expect(__testing.cacheSize()).toBe(1);
    await run({ userId: 'u1', role: 'veterinarian', farmIds: [FARM_A] }, ANIMAL_IN_A);
    expect(__testing.cacheSize()).toBe(1);
  });
});
