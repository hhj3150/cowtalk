// 추천 정확도 추적 — 정액 추천을 영속화해 "추천 vs 실제 사용 vs 임신 결과"를
// 사후 측정할 수 있게 한다. (CLAUDE.md 4층 Intelligence Loop: 정확도 추적 → 프롬프트 개선)
//
// 1차 슬라이스: 데이터 캡처. 집계 쿼리(채택률/lift)는 이 위에 올린다.

import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { getDb } from '../../config/database.js';
import { semenRecommendations } from '../../db/schema.js';
import { logger } from '../../lib/logger.js';
import type { SemenRecommendation } from './breeding-advisor.service.js';

const round1 = (n: number): number => Math.round(n * 10) / 10;

export interface SemenRecommendationRow {
  readonly batchId: string;
  readonly animalId: string;
  readonly farmId: string;
  readonly semenId: string;
  readonly rank: number;
  readonly score: number;
  readonly estimatedInbreeding: number;
  readonly inbreedingRisk: string;
  readonly pastConceptionRate: number | null;
  readonly pastSampleSize: number;
  readonly learningBonus: number;
  readonly heatDetectedAt: Date | null;
  readonly recommendedAt: Date;
}

export interface BuildRowsInput {
  readonly animalId: string;
  readonly farmId: string;
  readonly heatDetectedAt: Date | null;
  readonly recommendedAt: Date;
  readonly batchId: string;
  readonly recommendations: readonly SemenRecommendation[];
}

/**
 * 추천 목록 → 삽입행 매핑 (순수 함수, DB 비의존 — 단위테스트 대상).
 * 개체별 점수 인자(근교계수/학습보너스/과거 수태율)를 보존해 사후 분석에 쓴다.
 */
export function buildRecommendationRows(input: BuildRowsInput): readonly SemenRecommendationRow[] {
  return input.recommendations.map((r) => ({
    batchId: input.batchId,
    animalId: input.animalId,
    farmId: input.farmId,
    semenId: r.semenId,
    rank: r.rank,
    score: r.score,
    estimatedInbreeding: r.estimatedInbreeding,
    inbreedingRisk: r.inbreedingRisk,
    pastConceptionRate: r.pastConceptionRate,
    pastSampleSize: r.pastSampleSize,
    learningBonus: r.learningBonus,
    heatDetectedAt: input.heatDetectedAt,
    recommendedAt: input.recommendedAt,
  }));
}

export interface RecordRecommendationsParams {
  readonly animalId: string;
  readonly farmId: string;
  readonly heatDetectedAt: Date | null;
  readonly recommendations: readonly SemenRecommendation[];
}

/**
 * 추천을 DB에 기록한다 (fire-and-forget).
 * 실패해도 호출자(추천 응답)를 막지 않는다 — 로깅만 하고 삼킨다.
 * 반환: 기록한 batchId (추천이 없으면 null).
 */
export async function recordSemenRecommendations(
  params: RecordRecommendationsParams,
): Promise<string | null> {
  if (params.recommendations.length === 0) return null;

  const batchId = randomUUID();
  const rows = buildRecommendationRows({
    animalId: params.animalId,
    farmId: params.farmId,
    heatDetectedAt: params.heatDetectedAt,
    recommendedAt: new Date(),
    batchId,
    recommendations: params.recommendations,
  });

  try {
    const db = getDb();
    await db.insert(semenRecommendations).values(
      rows.map((r) => ({
        batchId: r.batchId,
        animalId: r.animalId,
        farmId: r.farmId,
        semenId: r.semenId,
        rank: r.rank,
        score: r.score,
        estimatedInbreeding: r.estimatedInbreeding,
        inbreedingRisk: r.inbreedingRisk,
        pastConceptionRate: r.pastConceptionRate,
        pastSampleSize: r.pastSampleSize,
        learningBonus: r.learningBonus,
        heatDetectedAt: r.heatDetectedAt,
        recommendedAt: r.recommendedAt,
      })),
    );
    return batchId;
  } catch (err) {
    logger.warn({ err, animalId: params.animalId }, '[RecommendationTracking] 추천 기록 실패 (무시)');
    return null;
  }
}

// ===========================
// 추천 정확도 집계
// ===========================

// 추천 배치 1건의 사후 결과 (집계 입력 단위, DB 비의존)
export interface AccuracyRecord {
  readonly actioned: boolean;                       // 추천 후 실제 수정으로 이어졌나
  readonly usedRecommended: boolean;                // 사용된 정액이 추천 목록에 있었나
  readonly outcome: 'pregnant' | 'open' | null;     // 임신감정 결과 (null = 미판정)
}

export interface RecommendationAccuracy {
  readonly totalBatches: number;
  readonly actionedBatches: number;
  readonly adherenceRate: number | null;            // 0~100, actioned 중 추천정액 사용 비율
  readonly adherenceStatus: 'ok' | 'data_insufficient';
  readonly recommendedConceptionRate: number | null; // 추천-사용 그룹 수태율 (0~100)
  readonly recommendedDecided: number;
  readonly nonRecommendedConceptionRate: number | null; // 비추천-사용 그룹 수태율
  readonly nonRecommendedDecided: number;
  readonly lift: number | null;                     // 추천CR − 비추천CR (퍼센트 포인트)
}

const isDecided = (r: AccuracyRecord): boolean => r.outcome === 'pregnant' || r.outcome === 'open';

const conceptionRate = (group: readonly AccuracyRecord[]): number | null =>
  group.length === 0 ? null : round1((group.filter((r) => r.outcome === 'pregnant').length / group.length) * 100);

/**
 * 추천 정확도 집계 (순수 함수, DB 비의존 — 단위테스트 대상).
 * - 채택률: 추천이 실제 수정으로 이어진 건 중 추천 정액을 쓴 비율.
 * - lift: 추천-사용 vs 비추천-사용 수태율 차이 (A/B 프록시).
 */
export function computeRecommendationAccuracy(
  records: readonly AccuracyRecord[],
): RecommendationAccuracy {
  const actioned = records.filter((r) => r.actioned);
  const recGroup = actioned.filter((r) => r.usedRecommended && isDecided(r));
  const nonRecGroup = actioned.filter((r) => !r.usedRecommended && isDecided(r));

  const recommendedConceptionRate = conceptionRate(recGroup);
  const nonRecommendedConceptionRate = conceptionRate(nonRecGroup);
  const lift =
    recommendedConceptionRate === null || nonRecommendedConceptionRate === null
      ? null
      : round1(recommendedConceptionRate - nonRecommendedConceptionRate);

  return {
    totalBatches: records.length,
    actionedBatches: actioned.length,
    adherenceRate:
      actioned.length === 0
        ? null
        : round1((actioned.filter((r) => r.usedRecommended).length / actioned.length) * 100),
    adherenceStatus: actioned.length === 0 ? 'data_insufficient' : 'ok',
    recommendedConceptionRate,
    recommendedDecided: recGroup.length,
    nonRecommendedConceptionRate,
    nonRecommendedDecided: nonRecGroup.length,
    lift,
  };
}

/**
 * 목장(또는 전체)의 추천 정확도를 DB에서 집계.
 * semen_recommendations ⋈ breeding_events(추천 후 7일 내 첫 수정) ⋈ pregnancy_checks(120일 내 결과).
 * 실패 시 빈 집계로 graceful degradation.
 */
export async function getRecommendationAccuracy(farmId?: string): Promise<RecommendationAccuracy> {
  const db = getDb();
  try {
    const rows = await db.execute(sql`
      WITH batch AS (
        SELECT sr.batch_id,
               sr.animal_id,
               MIN(sr.recommended_at) AS recommended_at,
               array_agg(DISTINCT sr.semen_id) AS rec_semen_ids
        FROM semen_recommendations sr
        ${farmId ? sql`WHERE sr.farm_id = ${farmId}` : sql``}
        GROUP BY sr.batch_id, sr.animal_id
      )
      SELECT
        (ins.semen_id IS NOT NULL)                              AS actioned,
        COALESCE(ins.semen_id::text = ANY(b.rec_semen_ids), false) AS used_recommended,
        pc.result                                               AS outcome
      FROM batch b
      LEFT JOIN LATERAL (
        SELECT be.semen_id, be.event_date
        FROM breeding_events be
        WHERE be.animal_id = b.animal_id
          AND be.type = 'insemination'
          AND be.semen_id IS NOT NULL
          AND be.event_date >= b.recommended_at
          AND be.event_date < b.recommended_at + INTERVAL '7 days'
        ORDER BY be.event_date ASC
        LIMIT 1
      ) ins ON true
      LEFT JOIN LATERAL (
        SELECT pc.result
        FROM pregnancy_checks pc
        WHERE pc.animal_id = b.animal_id
          AND ins.event_date IS NOT NULL
          AND pc.check_date > ins.event_date
          AND pc.check_date < ins.event_date + INTERVAL '120 days'
        ORDER BY pc.check_date ASC
        LIMIT 1
      ) pc ON true
    `);

    const raw = (rows as unknown as readonly Record<string, unknown>[]) ?? [];
    const records: AccuracyRecord[] = raw.map((r) => ({
      actioned: r.actioned === true,
      usedRecommended: r.used_recommended === true,
      outcome: r.outcome === 'pregnant' ? 'pregnant' : r.outcome === 'open' ? 'open' : null,
    }));
    return computeRecommendationAccuracy(records);
  } catch (err) {
    logger.warn({ err, farmId }, '[RecommendationTracking] 정확도 집계 실패');
    return computeRecommendationAccuracy([]);
  }
}
