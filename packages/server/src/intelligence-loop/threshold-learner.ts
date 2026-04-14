// 임계값 학습 서비스 — Intelligence Loop Phase 2
// sovereign_alarm_labels의 confirmed/false_positive 비율을 알람 타입별로 분석하여
// confidence 보정 배수(multiplier)와 severity 조정을 자동 제안한다.
// 24h 배치로 실행. 결과는 threshold_suggestions 테이블에 저장.

import { eq, and, sql } from 'drizzle-orm';
import { getDb } from '../config/database.js';
import { thresholdSuggestions, modelRegistry } from '../db/schema.js';
import { logger } from '../lib/logger.js';

const DEFAULT_THRESHOLD = 0.60;
const BORDERLINE_RANGE = 0.05;
const MIN_LABELS_FOR_LEARNING = 5; // 최소 레이블 수

// ─── 타입 ───────────────────────────────────────────────────────

interface AlarmTypeStats {
  readonly alarmType: string;
  readonly total: number;
  readonly confirmed: number;
  readonly falsePositive: number;
  readonly modified: number;
  readonly confirmRate: number;
  readonly fpRate: number;
}

interface ThresholdSuggestion {
  readonly alarmType: string;
  readonly farmId: string | null;
  readonly stats: AlarmTypeStats;
  readonly confidenceMultiplier: number;
  readonly severityAdjustment: 'upgrade' | 'downgrade' | 'keep';
  readonly suggestedAction: string;
  readonly trend: 'improving' | 'worsening' | 'stable';
  readonly previousConfirmRate: number | null;
}

export interface ThresholdLearningResult {
  readonly totalAlarmTypes: number;
  readonly suggestionsCreated: number;
  readonly globalSuggestions: readonly ThresholdSuggestion[];
}

interface ThresholdAnalysis {
  readonly currentThreshold: number;
  readonly suggestedThreshold: number;
  readonly reason: string;
  readonly evidence: {
    readonly falsePositives: number;
    readonly falseNegatives: number;
    readonly borderlineCases: number;
  };
}

interface ThresholdHistoryEntry {
  readonly engineType: string;
  readonly previousValue: number;
  readonly newValue: number;
  readonly changedAt: string;
  readonly changedBy: string;
  readonly reason: string;
}

// ─── 메인 배치 ───────────────────────────────────────────────────

/**
 * 24h 배치: sovereign_alarm_labels를 분석하여 알람 타입별 임계값 조정 제안 생성
 */
export async function runThresholdLearning(days = 90): Promise<ThresholdLearningResult> {
  const db = getDb();
  let suggestionsCreated = 0;

  try {
    // 1. 글로벌 알람 타입별 성능 집계
    const globalStats = await aggregateLabelStats(null, days);

    // 2. 이전 분석 결과 조회 (추세 비교용)
    const previousSuggestions = await getLatestSuggestions(null);
    const prevMap = new Map(previousSuggestions.map(s => [s.alarmType, s]));

    // 3. 각 알람 타입에 대해 제안 생성
    const suggestions: ThresholdSuggestion[] = [];

    for (const stats of globalStats) {
      if (stats.total < MIN_LABELS_FOR_LEARNING) continue;

      const prev = prevMap.get(stats.alarmType);
      const suggestion = computeSuggestion(stats, null, prev);
      suggestions.push(suggestion);

      // DB 저장
      await db.insert(thresholdSuggestions).values({
        alarmType: suggestion.alarmType,
        farmId: suggestion.farmId,
        totalLabels: stats.total,
        confirmedCount: stats.confirmed,
        fpCount: stats.falsePositive,
        modifiedCount: stats.modified,
        confirmRate: stats.confirmRate,
        fpRate: stats.fpRate,
        confidenceMultiplier: suggestion.confidenceMultiplier,
        severityAdjustment: suggestion.severityAdjustment,
        suggestedAction: suggestion.suggestedAction,
        trend: suggestion.trend,
        previousConfirmRate: suggestion.previousConfirmRate,
        analysisWindowDays: days,
      });
      suggestionsCreated++;
    }

    logger.info(
      { totalAlarmTypes: globalStats.length, suggestionsCreated },
      '[ThresholdLearner] 배치 완료',
    );

    return {
      totalAlarmTypes: globalStats.length,
      suggestionsCreated,
      globalSuggestions: suggestions,
    };
  } catch (error) {
    logger.error({ error }, '[ThresholdLearner] 배치 실패');
    return { totalAlarmTypes: 0, suggestionsCreated: 0, globalSuggestions: [] };
  }
}

/**
 * 특정 농장의 임계값 학습 (농장별 미세 조정)
 */
export async function runFarmThresholdLearning(farmId: string, days = 90): Promise<ThresholdLearningResult> {
  const db = getDb();
  let suggestionsCreated = 0;

  try {
    const farmStats = await aggregateLabelStats(farmId, days);
    const previousSuggestions = await getLatestSuggestions(farmId);
    const prevMap = new Map(previousSuggestions.map(s => [s.alarmType, s]));
    const suggestions: ThresholdSuggestion[] = [];

    for (const stats of farmStats) {
      if (stats.total < MIN_LABELS_FOR_LEARNING) continue;

      const prev = prevMap.get(stats.alarmType);
      const suggestion = computeSuggestion(stats, farmId, prev);
      suggestions.push(suggestion);

      await db.insert(thresholdSuggestions).values({
        alarmType: suggestion.alarmType,
        farmId: suggestion.farmId,
        totalLabels: stats.total,
        confirmedCount: stats.confirmed,
        fpCount: stats.falsePositive,
        modifiedCount: stats.modified,
        confirmRate: stats.confirmRate,
        fpRate: stats.fpRate,
        confidenceMultiplier: suggestion.confidenceMultiplier,
        severityAdjustment: suggestion.severityAdjustment,
        suggestedAction: suggestion.suggestedAction,
        trend: suggestion.trend,
        previousConfirmRate: suggestion.previousConfirmRate,
        analysisWindowDays: days,
      });
      suggestionsCreated++;
    }

    logger.info(
      { farmId, totalAlarmTypes: farmStats.length, suggestionsCreated },
      '[ThresholdLearner] 농장별 배치 완료',
    );

    return {
      totalAlarmTypes: farmStats.length,
      suggestionsCreated,
      globalSuggestions: suggestions,
    };
  } catch (error) {
    logger.error({ error, farmId }, '[ThresholdLearner] 농장별 배치 실패');
    return { totalAlarmTypes: 0, suggestionsCreated: 0, globalSuggestions: [] };
  }
}

/**
 * orchestrator가 사용: 알람 타입별 최신 confidence multiplier 조회
 * 농장별 > 글로벌 우선순위
 */
export async function getConfidenceMultipliers(
  farmId: string,
): Promise<ReadonlyMap<string, number>> {
  const db = getDb();
  const result = new Map<string, number>();

  try {
    // 글로벌 최신 제안
    const globalRows = await db.execute(sql`
      SELECT DISTINCT ON (alarm_type) alarm_type, confidence_multiplier
      FROM threshold_suggestions
      WHERE farm_id IS NULL
        AND total_labels >= ${MIN_LABELS_FOR_LEARNING}
      ORDER BY alarm_type, computed_at DESC
    `);

    for (const row of globalRows as unknown as Array<{ alarm_type: string; confidence_multiplier: number }>) {
      result.set(row.alarm_type, row.confidence_multiplier);
    }

    // 농장별 제안 (글로벌 오버라이드)
    const farmRows = await db.execute(sql`
      SELECT DISTINCT ON (alarm_type) alarm_type, confidence_multiplier
      FROM threshold_suggestions
      WHERE farm_id = ${farmId}
        AND total_labels >= ${MIN_LABELS_FOR_LEARNING}
      ORDER BY alarm_type, computed_at DESC
    `);

    for (const row of farmRows as unknown as Array<{ alarm_type: string; confidence_multiplier: number }>) {
      result.set(row.alarm_type, row.confidence_multiplier);
    }
  } catch {
    // 테이블 없거나 조회 실패 시 빈 맵 반환
  }

  return result;
}

// ─── 기존 호환 (predictions 기반 분석) ──────────────────────────

/**
 * 임계값 분석 — predictions 테이블 기반 (기존 호환)
 */
export async function analyzeThresholds(
  engineType: string,
): Promise<ThresholdAnalysis> {
  try {
    const db = getDb();
    const currentThreshold = await getCurrentThreshold(engineType);
    const lowerBound = currentThreshold - BORDERLINE_RANGE;
    const upperBound = currentThreshold + BORDERLINE_RANGE;

    const result = await db.execute(sql`
      SELECT
        count(*) FILTER (
          WHERE p.confidence >= ${lowerBound}
            AND p.confidence <= ${upperBound}
        )::int AS borderline_cases,
        count(*) FILTER (
          WHERE oe.match_result = 'false_positive'
        )::int AS false_positives,
        count(*) FILTER (
          WHERE oe.match_result = 'false_negative'
        )::int AS false_negatives,
        count(*) FILTER (
          WHERE oe.match_result = 'false_negative'
            AND p.confidence >= ${lowerBound}
            AND p.confidence < ${currentThreshold}
        )::int AS fn_near_threshold
      FROM predictions p
      LEFT JOIN outcome_evaluations oe ON oe.prediction_id = p.prediction_id
      WHERE p.engine_type = ${engineType}
        AND p.timestamp >= now() - interval '90 days'
    `);

    const row = (result as unknown as Record<string, unknown>[])[0] ?? {};
    const falsePositives = Number(row.false_positives ?? 0);
    const falseNegatives = Number(row.false_negatives ?? 0);
    const borderlineCases = Number(row.borderline_cases ?? 0);
    const fnNearThreshold = Number(row.fn_near_threshold ?? 0);

    let suggestedThreshold = currentThreshold;
    let reason = 'Current threshold is performing well';

    if (fnNearThreshold > 3 && falseNegatives > falsePositives) {
      suggestedThreshold = Math.max(0.40, currentThreshold - 0.05);
      reason = `${fnNearThreshold} false negatives near threshold boundary. Suggest lowering to catch more positives.`;
    } else if (falsePositives > falseNegatives * 2 && falsePositives > 5) {
      suggestedThreshold = Math.min(0.90, currentThreshold + 0.05);
      reason = `High false positive rate (${falsePositives}). Suggest raising threshold to reduce noise.`;
    }

    return {
      currentThreshold,
      suggestedThreshold,
      reason,
      evidence: { falsePositives, falseNegatives, borderlineCases },
    };
  } catch (error) {
    logger.error({ error, engineType }, 'Failed to analyze thresholds');
    throw error;
  }
}

/**
 * 임계값 변경 이력 조회 — modelRegistry metrics에서 읽기
 */
export async function getThresholdHistory(
  engineType: string,
): Promise<readonly ThresholdHistoryEntry[]> {
  try {
    const db = getDb();

    const versions = await db
      .select()
      .from(modelRegistry)
      .where(eq(modelRegistry.engineType, engineType))
      .orderBy(modelRegistry.deployedAt);

    const history: ThresholdHistoryEntry[] = [];

    for (let i = 1; i < versions.length; i++) {
      const prev = versions[i - 1]!;
      const curr = versions[i]!;
      const prevMetrics = prev.metrics as Record<string, unknown> | null;
      const currMetrics = curr.metrics as Record<string, unknown> | null;

      const prevThreshold = Number(prevMetrics?.threshold ?? DEFAULT_THRESHOLD);
      const currThreshold = Number(currMetrics?.threshold ?? DEFAULT_THRESHOLD);

      if (prevThreshold !== currThreshold) {
        history.push({
          engineType,
          previousValue: prevThreshold,
          newValue: currThreshold,
          changedAt: curr.deployedAt.toISOString(),
          changedBy: String(currMetrics?.changedBy ?? 'system'),
          reason: String(currMetrics?.thresholdReason ?? 'Version update'),
        });
      }
    }

    return history;
  } catch (error) {
    logger.error({ error, engineType }, 'Failed to get threshold history');
    throw error;
  }
}

// ─── Private ───────────────────────────────────────────────────────

async function aggregateLabelStats(
  farmId: string | null,
  days: number,
): Promise<AlarmTypeStats[]> {
  const db = getDb();
  const since = new Date(Date.now() - days * 86400_000).toISOString();

  const farmFilter = farmId
    ? sql`AND farm_id = ${farmId}`
    : sql``;

  const rows = await db.execute(sql`
    SELECT
      alarm_type,
      count(*)::int AS total,
      count(*) FILTER (WHERE verdict = 'confirmed')::int AS confirmed,
      count(*) FILTER (WHERE verdict = 'false_positive')::int AS false_positive,
      count(*) FILTER (WHERE verdict = 'modified')::int AS modified
    FROM sovereign_alarm_labels
    WHERE labeled_at >= ${since}::timestamptz
    ${farmFilter}
    GROUP BY alarm_type
    ORDER BY count(*) DESC
  `);

  return (rows as unknown as Array<{
    alarm_type: string;
    total: number;
    confirmed: number;
    false_positive: number;
    modified: number;
  }>).map(r => ({
    alarmType: r.alarm_type,
    total: r.total,
    confirmed: r.confirmed,
    falsePositive: r.false_positive,
    modified: r.modified,
    confirmRate: r.total > 0 ? r.confirmed / r.total : 0,
    fpRate: r.total > 0 ? r.false_positive / r.total : 0,
  }));
}

async function getLatestSuggestions(
  farmId: string | null,
): Promise<Array<{ alarmType: string; confirmRate: number }>> {
  const db = getDb();

  const farmFilter = farmId
    ? sql`WHERE farm_id = ${farmId}`
    : sql`WHERE farm_id IS NULL`;

  const rows = await db.execute(sql`
    SELECT DISTINCT ON (alarm_type)
      alarm_type, confirm_rate
    FROM threshold_suggestions
    ${farmFilter}
    ORDER BY alarm_type, computed_at DESC
  `);

  return (rows as unknown as Array<{ alarm_type: string; confirm_rate: number }>)
    .map(r => ({ alarmType: r.alarm_type, confirmRate: r.confirm_rate }));
}

function computeSuggestion(
  stats: AlarmTypeStats,
  farmId: string | null,
  prev: { alarmType: string; confirmRate: number } | undefined,
): ThresholdSuggestion {
  // 추세 계산
  let trend: 'improving' | 'worsening' | 'stable' = 'stable';
  const previousConfirmRate = prev?.confirmRate ?? null;
  if (previousConfirmRate !== null) {
    const diff = stats.confirmRate - previousConfirmRate;
    if (diff > 0.05) trend = 'improving';
    else if (diff < -0.05) trend = 'worsening';
  }

  // confidence multiplier 계산
  // fpRate가 높으면 낮추고, confirmRate가 높으면 올림
  let confidenceMultiplier = 1.0;
  let severityAdjustment: 'upgrade' | 'downgrade' | 'keep' = 'keep';
  let suggestedAction = '';

  if (stats.fpRate > 0.5 && stats.total >= 10) {
    // FP 50% 이상: 심각한 과잉 알람
    confidenceMultiplier = 0.65;
    severityAdjustment = 'downgrade';
    suggestedAction = `FP율 ${Math.round(stats.fpRate * 100)}% — confidence 35% 하향. 룰 임계값 점검 필요.`;
  } else if (stats.fpRate > 0.3 && stats.total >= 8) {
    // FP 30-50%: 과잉 알람
    confidenceMultiplier = 0.80;
    severityAdjustment = 'downgrade';
    suggestedAction = `FP율 ${Math.round(stats.fpRate * 100)}% — confidence 20% 하향. 정밀도 개선 여지 있음.`;
  } else if (stats.confirmRate > 0.9 && stats.total >= 10) {
    // 90% 이상 확인: 높은 정확도
    confidenceMultiplier = 1.15;
    severityAdjustment = 'upgrade';
    suggestedAction = `확인율 ${Math.round(stats.confirmRate * 100)}% — confidence 15% 상향. 이 알람 타입은 신뢰도 높음.`;
  } else if (stats.confirmRate > 0.7 && stats.total >= 5) {
    // 양호
    confidenceMultiplier = 1.05;
    suggestedAction = `확인율 ${Math.round(stats.confirmRate * 100)}% — 양호. 소폭 상향.`;
  } else {
    suggestedAction = `확인율 ${Math.round(stats.confirmRate * 100)}%, FP율 ${Math.round(stats.fpRate * 100)}% — 현행 유지.`;
  }

  // multiplier 범위 제한
  confidenceMultiplier = Math.max(0.5, Math.min(1.3, confidenceMultiplier));

  return {
    alarmType: stats.alarmType,
    farmId,
    stats,
    confidenceMultiplier,
    severityAdjustment,
    suggestedAction,
    trend,
    previousConfirmRate,
  };
}

async function getCurrentThreshold(engineType: string): Promise<number> {
  try {
    const db = getDb();
    const [active] = await db
      .select()
      .from(modelRegistry)
      .where(
        and(
          eq(modelRegistry.engineType, engineType),
          eq(modelRegistry.isActive, true),
        ),
      )
      .limit(1);

    if (!active?.metrics) {
      return DEFAULT_THRESHOLD;
    }

    const metrics = active.metrics as Record<string, unknown>;
    return Number(metrics.threshold ?? DEFAULT_THRESHOLD);
  } catch {
    return DEFAULT_THRESHOLD;
  }
}
