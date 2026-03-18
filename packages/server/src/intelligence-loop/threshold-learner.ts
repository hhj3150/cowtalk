// 임계값 제안 서비스 — Intelligence Loop Phase 11B

import { eq, and, sql } from 'drizzle-orm';
import { getDb } from '../config/database.js';
import { modelRegistry } from '../db/schema.js';
import { logger } from '../lib/logger.js';

const DEFAULT_THRESHOLD = 0.60;
const BORDERLINE_RANGE = 0.05;

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

/**
 * 임계값 분석 — 현재 임계값 대비 성능 분석 + 제안
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
