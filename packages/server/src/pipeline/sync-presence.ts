// smaXtec 응답에서 빠진 개체(도태·판매) 처리 — docs/plans/2026-11-smaxtec-removed-animals.md
//
// smaXtec 은 도태·판매 개체를 계정 개체 목록에서 뺀다. 동기화가 응답에 있는 개체만 갱신하면
// 빠진 개체가 active 로 남아 두수가 부풀고(송영신목장 smaXtec 37두 vs CowTalk 48두),
// 센서 수집이 그 개체에 요청해 403 이 난다.
//
// 안전장치 (멀쩡한 개체를 비활성하지 않는 것이 최우선):
// - 개체 목록 조회가 성공한 목장만 판정한다 (조회 실패 목장은 이번 사이클 판정 제외)
// - 연속 미응답 N회(기본 3) 그리고 미응답 시작 후 M시간(기본 6) 둘 다 충족해야 비활성
// - 한 목장의 active 개체 중 절반 넘게 빠지면 그 목장은 보류 + 경고 (응답 이상 의심)
// - 최근 72시간 안에 센서 데이터가 들어온 개체는 비활성하지 않는다. 도태·판매 개체는 smaXtec
//   데이터 조회가 403 이라 데이터가 없다 — 응답이 페이지 단위로 잘려 빠진 '살아 있는' 소를 지킨다
// - 다시 응답에 나타나면 즉시 재활성 (smaxtec_removed 로 비활성된 개체만)
// - 행·이벤트·센서 기록은 지우지 않는다. 상태 변경은 animal_status_history 에 남긴다
// - SMAXTEC_PRESENCE_ENABLED=false 로 배포 없이 끈다

import { getDb } from '../config/database.js';
import { animals, animalStatusHistory, sensorMeasurements } from '../db/schema.js';
import { and, eq, gt, inArray, isNotNull, isNull, sql } from 'drizzle-orm';
import { logger } from '../lib/logger.js';

export const SMAXTEC_REMOVED = 'smaxtec_removed';

export interface PresencePolicy {
  readonly minCycles: number;
  readonly minHours: number;
  /** 한 사이클에 이 비율을 넘게 빠지면 목장 보류 */
  readonly maxMissingRatio: number;
  /** 이 시간 안에 센서 데이터가 있으면 비활성 금지 */
  readonly sensedWithinHours: number;
}

export interface PresenceRow {
  readonly animalId: string;
  readonly externalId: string;
  readonly status: string;
  readonly inactiveReason: string | null;
  readonly syncMissingCount: number;
  readonly syncMissingSince: Date | null;
}

export interface FarmPresencePlan {
  /** 응답에 있음 → 미응답 카운트 초기화 */
  readonly seen: readonly string[];
  /** 응답에 없음 (아직 유예 중) → 카운트 +1 */
  readonly missing: readonly string[];
  /** 유예 끝 → inactive */
  readonly deactivate: readonly string[];
  /** 유예는 끝났지만 최근 센서 데이터가 있어 비활성 보류 (응답 누락 의심) */
  readonly protectedBySensor: readonly string[];
  /** smaxtec_removed 로 비활성됐다가 다시 나타남 → 사유 해제 + 이력 */
  readonly reappeared: readonly string[];
  /** 서킷브레이커로 판정 보류 */
  readonly held: boolean;
  readonly activeCount: number;
  readonly missingActiveCount: number;
}

export function readPresencePolicy(env: NodeJS.ProcessEnv = process.env): PresencePolicy {
  const num = (v: string | undefined, d: number): number => {
    const n = Number(v);
    return Number.isFinite(n) && n > 0 ? n : d;
  };
  return {
    minCycles: num(env.SMAXTEC_MISSING_CYCLES, 3),
    minHours: num(env.SMAXTEC_MISSING_MIN_HOURS, 6),
    maxMissingRatio: 0.5,
    sensedWithinHours: 72,
  };
}

/** 한 목장의 판정 (순수 함수) */
export function planFarmPresence(
  rows: readonly PresenceRow[],
  presentExternalIds: ReadonlySet<string>,
  now: Date,
  policy: PresencePolicy,
  recentlySensed: ReadonlySet<string> = new Set(),
): FarmPresencePlan {
  const seen: string[] = [];
  const reappeared: string[] = [];
  const missingActive: PresenceRow[] = [];
  let activeCount = 0;

  for (const r of rows) {
    if (r.status === 'active') activeCount += 1;
    if (presentExternalIds.has(r.externalId)) {
      seen.push(r.animalId);
      if (r.inactiveReason === SMAXTEC_REMOVED) reappeared.push(r.animalId);
    } else if (r.status === 'active') {
      missingActive.push(r);
    }
  }

  const held = activeCount > 0 && missingActive.length / activeCount > policy.maxMissingRatio;
  if (held) {
    return { seen, missing: [], deactivate: [], protectedBySensor: [], reappeared, held, activeCount, missingActiveCount: missingActive.length };
  }

  const missing: string[] = [];
  const deactivate: string[] = [];
  const protectedBySensor: string[] = [];
  const minMs = policy.minHours * 3_600_000;
  for (const r of missingActive) {
    const count = r.syncMissingCount + 1;
    const since = r.syncMissingSince ?? now;
    if (count >= policy.minCycles && now.getTime() - since.getTime() >= minMs) {
      if (recentlySensed.has(r.animalId)) {
        protectedBySensor.push(r.animalId);
        missing.push(r.animalId);
      } else {
        deactivate.push(r.animalId);
      }
    } else {
      missing.push(r.animalId);
    }
  }
  return { seen, missing, deactivate, protectedBySensor, reappeared, held, activeCount, missingActiveCount: missingActive.length };
}

/** 같은 목장 경고를 사이클(5분)마다 반복하지 않는다 — 6시간에 한 번 */
const lastWarnAt = new Map<string, number>();
function shouldWarn(key: string, now: Date): boolean {
  const prev = lastWarnAt.get(key) ?? 0;
  if (now.getTime() - prev < 6 * 3_600_000) return false;
  lastWarnAt.set(key, now.getTime());
  return true;
}

/** 후보 개체 중 최근 센서 데이터가 있는 개체 */
async function findRecentlySensed(animalIds: readonly string[], since: Date): Promise<Set<string>> {
  if (animalIds.length === 0) return new Set();
  const db = getDb();
  const rows = await db
    .selectDistinct({ animalId: sensorMeasurements.animalId })
    .from(sensorMeasurements)
    .where(and(inArray(sensorMeasurements.animalId, [...animalIds]), gt(sensorMeasurements.timestamp, since)));
  return new Set(rows.map((r) => r.animalId));
}

export interface PresenceSummary {
  readonly farms: number;
  readonly deactivated: number;
  readonly reappeared: number;
  readonly heldFarms: number;
  readonly skipped: boolean;
}

/**
 * 동기화 사이클 끝에서 호출. farmPresence = (농장 ID → 이번 응답의 개체 external_id 집합).
 * 개체 목록 조회가 성공한 목장만 넘겨야 한다.
 */
export async function applySyncPresence(
  farmPresence: ReadonlyMap<string, ReadonlySet<string>>,
  now: Date = new Date(),
  policy: PresencePolicy = readPresencePolicy(),
): Promise<PresenceSummary> {
  if (process.env.SMAXTEC_PRESENCE_ENABLED === 'false') {
    return { farms: 0, deactivated: 0, reappeared: 0, heldFarms: 0, skipped: true };
  }
  const db = getDb();
  let deactivated = 0;
  let reappearedTotal = 0;
  let heldFarms = 0;

  for (const [farmId, present] of farmPresence) {
    try {
      const rows = await db
        .select({
          animalId: animals.animalId,
          externalId: animals.externalId,
          status: animals.status,
          inactiveReason: animals.inactiveReason,
          syncMissingCount: animals.syncMissingCount,
          syncMissingSince: animals.syncMissingSince,
        })
        .from(animals)
        .where(and(eq(animals.farmId, farmId), isNotNull(animals.externalId), isNull(animals.deletedAt)));

      const presenceRows = rows.map((r) => ({ ...r, externalId: r.externalId ?? '' }));
      // 센서 조회는 유예가 끝날 개체만 (매 사이클 전체 조회 방지)
      const draft = planFarmPresence(presenceRows, present, now, policy);
      const recentlySensed = await findRecentlySensed(
        draft.deactivate,
        new Date(now.getTime() - policy.sensedWithinHours * 3_600_000),
      );
      const plan = recentlySensed.size > 0
        ? planFarmPresence(presenceRows, present, now, policy, recentlySensed)
        : draft;
      if (plan.protectedBySensor.length > 0 && shouldWarn(`sensed:${farmId}`, now)) {
        logger.warn({ farmId, count: plan.protectedBySensor.length },
          '[SyncPresence] smaXtec 개체 목록엔 없는데 최근 센서 데이터가 들어오는 개체 — 비활성 보류 (응답 누락 의심, 확인 필요)');
      }

      if (plan.seen.length > 0) {
        await db.update(animals)
          .set({ lastSeenInSyncAt: now, syncMissingCount: 0, syncMissingSince: null })
          .where(inArray(animals.animalId, [...plan.seen]));
      }

      if (plan.reappeared.length > 0) {
        await db.update(animals)
          .set({ status: 'active', inactiveReason: null })
          .where(and(inArray(animals.animalId, [...plan.reappeared]), eq(animals.inactiveReason, SMAXTEC_REMOVED)));
        await db.insert(animalStatusHistory).values(plan.reappeared.map((animalId) => ({
          animalId,
          previousStatus: 'inactive',
          newStatus: 'active',
          reason: 'smaxtec_reappeared: 동기화 응답에 다시 포함',
        })));
        reappearedTotal += plan.reappeared.length;
      }

      if (plan.held) {
        heldFarms += 1;
        if (shouldWarn(`held:${farmId}`, now)) logger.warn({
          farmId,
          activeCount: plan.activeCount,
          missingActiveCount: plan.missingActiveCount,
        }, '[SyncPresence] 목장 active 개체 절반 이상이 응답에 없음 — 판정 보류 (응답 이상 또는 대량 도태, 관리자 확인 필요)');
        continue;
      }

      if (plan.missing.length > 0) {
        await db.update(animals)
          .set({
            syncMissingCount: sql`${animals.syncMissingCount} + 1`,
            syncMissingSince: sql`COALESCE(${animals.syncMissingSince}, ${now.toISOString()}::timestamptz)`,
          })
          .where(inArray(animals.animalId, [...plan.missing]));
      }

      if (plan.deactivate.length > 0) {
        await db.transaction(async (tx) => {
          await tx.update(animals)
            .set({
              status: 'inactive',
              inactiveReason: SMAXTEC_REMOVED,
              syncMissingCount: sql`${animals.syncMissingCount} + 1`,
            })
            .where(and(inArray(animals.animalId, [...plan.deactivate]), eq(animals.status, 'active')));
          await tx.insert(animalStatusHistory).values(plan.deactivate.map((animalId) => ({
            animalId,
            previousStatus: 'active',
            newStatus: 'inactive',
            reason: `${SMAXTEC_REMOVED}: smaXtec 개체 목록에서 ${String(policy.minCycles)}회·${String(policy.minHours)}시간 이상 연속 미포함 (도태·판매 추정)`,
          })));
        });
        deactivated += plan.deactivate.length;
        logger.info({ farmId, count: plan.deactivate.length }, '[SyncPresence] smaXtec 목록에서 빠진 개체 비활성 처리');
      }
    } catch (err) {
      logger.warn({ err, farmId }, '[SyncPresence] 목장 판정 실패 — 다음 사이클에 재시도');
    }
  }

  return { farms: farmPresence.size, deactivated, reappeared: reappearedTotal, heldFarms, skipped: false };
}
