// AI 성능 평가 서비스 — Intelligence Loop Phase 11B

import { and, sql, gte, lte } from 'drizzle-orm';
import { getDb } from '../config/database.js';
import { predictions, feedback } from '../db/schema.js';
import { logger } from '../lib/logger.js';

interface DateRange {
  readonly from: Date;
  readonly to: Date;
}

interface EngineEvaluation {
  readonly engineType: string;
  readonly precision: number;
  readonly recall: number;
  readonly f1Score: number;
  readonly truePositives: number;
  readonly falsePositives: number;
  readonly trueNegatives: number;
  readonly falseNegatives: number;
  readonly totalPredictions: number;
  readonly totalEvaluated: number;
  readonly averageConfidence: number;
}

interface RoleEvaluation {
  readonly total: number;
  readonly byType: Record<string, number>;
}

interface AccuracyTrendPoint {
  readonly month: string;
  readonly precision: number;
  readonly recall: number;
  readonly totalEvaluated: number;
}

/**
 * 엔진별 성능 평가 — precision, recall, F1
 */
export async function evaluateEngine(
  engineType: string,
  dateRange: DateRange,
  farmId?: string,
): Promise<EngineEvaluation> {
  try {
    const db = getDb();
    const farmFilter = farmId ? sql`AND p.farm_id = ${farmId}` : sql``;

    const result = await db.execute(sql`
      SELECT
        count(*)::int AS total_predictions,
        count(oe.evaluation_id)::int AS total_evaluated,
        coalesce(avg(p.confidence), 0)::real AS avg_confidence,
        count(*) FILTER (WHERE oe.match_result = 'true_positive')::int AS tp,
        count(*) FILTER (WHERE oe.match_result = 'false_positive')::int AS fp,
        count(*) FILTER (WHERE oe.match_result = 'true_negative')::int AS tn,
        count(*) FILTER (WHERE oe.match_result = 'false_negative')::int AS fn
      FROM predictions p
      LEFT JOIN outcome_evaluations oe ON oe.prediction_id = p.prediction_id
      WHERE p.engine_type = ${engineType}
        AND p.timestamp >= ${dateRange.from}
        AND p.timestamp <= ${dateRange.to}
        ${farmFilter}
    `);

    const row = (result as unknown as Record<string, unknown>[])[0] ?? {};
    const tp = Number(row.tp ?? 0);
    const fp = Number(row.fp ?? 0);
    const tn = Number(row.tn ?? 0);
    const fn = Number(row.fn ?? 0);

    const precision = tp + fp > 0 ? tp / (tp + fp) : 0;
    const recall = tp + fn > 0 ? tp / (tp + fn) : 0;
    const f1Score = precision + recall > 0
      ? (2 * precision * recall) / (precision + recall)
      : 0;

    return {
      engineType,
      precision,
      recall,
      f1Score,
      truePositives: tp,
      falsePositives: fp,
      trueNegatives: tn,
      falseNegatives: fn,
      totalPredictions: Number(row.total_predictions ?? 0),
      totalEvaluated: Number(row.total_evaluated ?? 0),
      averageConfidence: Number(row.avg_confidence ?? 0),
    };
  } catch (error) {
    logger.error({ error, engineType }, 'Failed to evaluate engine');
    throw error;
  }
}

/**
 * 역할별 피드백 평가
 */
export async function evaluateByRole(
  dateRange: DateRange,
): Promise<Record<string, RoleEvaluation>> {
  try {
    const db = getDb();

    const rows = await db
      .select({
        sourceRole: feedback.sourceRole,
        feedbackType: feedback.feedbackType,
        count: sql<number>`count(*)::int`,
      })
      .from(feedback)
      .where(
        and(
          gte(feedback.createdAt, dateRange.from),
          lte(feedback.createdAt, dateRange.to),
        ),
      )
      .groupBy(feedback.sourceRole, feedback.feedbackType);

    const result: Record<string, RoleEvaluation> = {};

    for (const row of rows) {
      if (!result[row.sourceRole]) {
        result[row.sourceRole] = { total: 0, byType: {} };
      }
      const existing = result[row.sourceRole]!;
      result[row.sourceRole] = {
        total: existing.total + row.count,
        byType: { ...existing.byType, [row.feedbackType]: row.count },
      };
    }

    return result;
  } catch (error) {
    logger.error({ error }, 'Failed to evaluate by role');
    throw error;
  }
}

/**
 * 정확도 트렌드 — 월별 precision/recall
 */
export async function getAccuracyTrend(
  engineType: string,
  months: number,
): Promise<readonly AccuracyTrendPoint[]> {
  try {
    const db = getDb();

    const rows = await db.execute(sql`
      SELECT
        to_char(date_trunc('month', p.timestamp), 'YYYY-MM') AS month,
        count(oe.evaluation_id)::int AS total_evaluated,
        count(*) FILTER (WHERE oe.match_result = 'true_positive')::int AS tp,
        count(*) FILTER (WHERE oe.match_result = 'false_positive')::int AS fp,
        count(*) FILTER (WHERE oe.match_result = 'false_negative')::int AS fn
      FROM predictions p
      LEFT JOIN outcome_evaluations oe ON oe.prediction_id = p.prediction_id
      WHERE p.engine_type = ${engineType}
        AND p.timestamp >= date_trunc('month', now()) - (${months} || ' months')::interval
      GROUP BY date_trunc('month', p.timestamp)
      ORDER BY date_trunc('month', p.timestamp) ASC
    `);

    return (rows as unknown as Record<string, unknown>[]).map((row) => {
      const tp = Number(row.tp ?? 0);
      const fp = Number(row.fp ?? 0);
      const fn = Number(row.fn ?? 0);
      const precision = tp + fp > 0 ? tp / (tp + fp) : 0;
      const recall = tp + fn > 0 ? tp / (tp + fn) : 0;

      return {
        month: String(row.month ?? ''),
        precision,
        recall,
        totalEvaluated: Number(row.total_evaluated ?? 0),
      };
    });
  } catch (error) {
    logger.error({ error, engineType, months }, 'Failed to get accuracy trend');
    throw error;
  }
}

/**
 * 엔진 간 비교
 */
export async function compareEngines(
  dateRange: DateRange,
): Promise<readonly EngineEvaluation[]> {
  try {
    const db = getDb();

    const engineTypes = await db
      .selectDistinct({ engineType: predictions.engineType })
      .from(predictions)
      .where(
        and(
          gte(predictions.timestamp, dateRange.from),
          lte(predictions.timestamp, dateRange.to),
        ),
      );

    const results: EngineEvaluation[] = [];
    for (const { engineType } of engineTypes) {
      const evaluation = await evaluateEngine(engineType, dateRange);
      results.push(evaluation);
    }

    return results;
  } catch (error) {
    logger.error({ error }, 'Failed to compare engines');
    throw error;
  }
}
