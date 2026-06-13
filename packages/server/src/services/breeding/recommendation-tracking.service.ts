// 추천 정확도 추적 — 정액 추천을 영속화해 "추천 vs 실제 사용 vs 임신 결과"를
// 사후 측정할 수 있게 한다. (CLAUDE.md 4층 Intelligence Loop: 정확도 추적 → 프롬프트 개선)
//
// 1차 슬라이스: 데이터 캡처. 집계 쿼리(채택률/lift)는 이 위에 올린다.

import { randomUUID } from 'node:crypto';
import { getDb } from '../../config/database.js';
import { semenRecommendations } from '../../db/schema.js';
import { logger } from '../../lib/logger.js';
import type { SemenRecommendation } from './breeding-advisor.service.js';

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
