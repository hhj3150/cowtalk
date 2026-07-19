// 조치 기록률 — "알림을 보냈는데 실제로 행동했는가" (파일럿 성패 지표)
//
// 정직성 원칙:
// - 분모가 있는 것만 비율로 말한다: 알림 확인율(alerts), smaXtec 알람 확인율.
// - 결정 카드는 매일 합성되는 임시 목록이라 분모가 없다 → 완료 '건수'만 보고한다.
// - 표본이 없으면 0%가 아니라 null(집계 불가)로 반환한다.

import { and, gte, inArray, sql } from 'drizzle-orm';
import { getDb } from '../../config/database.js';
import { alerts, smaxtecEvents } from '../../db/schema.js';
import { countCompletedActions } from './decision-action.service.js';

export interface RatePair {
  readonly total: number;
  readonly acked: number;
  /** 확인율(%) — total 0이면 null (0%로 오독 방지) */
  readonly ratePct: number | null;
}

export interface ActionRateReport {
  readonly periodDays: number;
  /** CowTalk 알림(알림함) 확인율 */
  readonly alerts: RatePair;
  /** smaXtec 알람 확인율 */
  readonly smaxtec: RatePair;
  /** 결정 카드 완료 건수 (분모 없음 — 건수만) */
  readonly decisionsCompleted: number;
  /** 두 확인율 표본이 모두 0이면 data_insufficient */
  readonly status: 'ok' | 'data_insufficient';
}

/** 비율 계산 (순수) — 분모 0이면 null */
export function computeRatePair(total: number, acked: number): RatePair {
  return {
    total,
    acked,
    ratePct: total > 0 ? Math.round((acked / total) * 1000) / 10 : null,
  };
}

/** 보고서 조립 (순수) */
export function assembleActionRate(
  periodDays: number,
  alertsPair: RatePair,
  smaxtecPair: RatePair,
  decisionsCompleted: number,
): ActionRateReport {
  return {
    periodDays,
    alerts: alertsPair,
    smaxtec: smaxtecPair,
    decisionsCompleted,
    status: alertsPair.total === 0 && smaxtecPair.total === 0 ? 'data_insufficient' : 'ok',
  };
}

export async function getActionRate(
  farmIdsScope: readonly string[] | null,
  days = 7,
): Promise<ActionRateReport> {
  const db = getDb();
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const farmFilter = farmIdsScope && farmIdsScope.length > 0 ? farmIdsScope : null;

  const [alertRows, smxRows, decisionsCompleted] = await Promise.all([
    db
      .select({
        total: sql<number>`count(*)::int`,
        acked: sql<number>`count(*) filter (where ${alerts.status} <> 'new')::int`,
      })
      .from(alerts)
      .where(and(
        gte(alerts.createdAt, since),
        ...(farmFilter ? [inArray(alerts.farmId, [...farmFilter])] : []),
      )),
    db
      .select({
        total: sql<number>`count(*)::int`,
        acked: sql<number>`count(*) filter (where ${smaxtecEvents.acknowledged} = true)::int`,
      })
      .from(smaxtecEvents)
      .where(and(
        gte(smaxtecEvents.detectedAt, since),
        ...(farmFilter ? [inArray(smaxtecEvents.farmId, [...farmFilter])] : []),
      )),
    countCompletedActions(farmFilter, days),
  ]);

  return assembleActionRate(
    days,
    computeRatePair(Number(alertRows[0]?.total ?? 0), Number(alertRows[0]?.acked ?? 0)),
    computeRatePair(Number(smxRows[0]?.total ?? 0), Number(smxRows[0]?.acked ?? 0)),
    decisionsCompleted,
  );
}
