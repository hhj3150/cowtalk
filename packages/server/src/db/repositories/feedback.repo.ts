// Feedback Repository

import { eq, and, desc, sql } from 'drizzle-orm';
import { getDb } from '../../config/database';
import { feedback, outcomeEvaluations, predictions } from '../schema';
import { buildPaginatedResult } from './base.repo';
import type { PaginationParams, PaginatedResult } from '@cowtalk/shared';

type FeedbackRow = typeof feedback.$inferSelect;
type OutcomeRow = typeof outcomeEvaluations.$inferSelect;

export async function findFeedback(
  params: PaginationParams & { farmId?: string; predictionId?: string },
): Promise<PaginatedResult<FeedbackRow>> {
  const db = getDb();
  const conditions = [];

  if (params.farmId) {
    conditions.push(eq(feedback.farmId, params.farmId));
  }
  if (params.predictionId) {
    conditions.push(eq(feedback.predictionId, params.predictionId));
  }

  const where = conditions.length > 0 ? and(...conditions) : undefined;
  const offset = (params.page - 1) * params.limit;

  const [data, countResult] = await Promise.all([
    db
      .select()
      .from(feedback)
      .where(where)
      .orderBy(desc(feedback.createdAt))
      .limit(params.limit)
      .offset(offset),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(feedback)
      .where(where),
  ]);

  const total = countResult[0]?.count ?? 0;
  return buildPaginatedResult(data, total, params);
}

export async function createFeedback(
  data: typeof feedback.$inferInsert,
): Promise<FeedbackRow> {
  const db = getDb();
  const [row] = await db.insert(feedback).values(data).returning();
  if (!row) {
    throw new Error('Failed to create feedback');
  }
  return row;
}

export async function createOutcomeEvaluation(
  data: typeof outcomeEvaluations.$inferInsert,
): Promise<OutcomeRow> {
  const db = getDb();
  const [row] = await db.insert(outcomeEvaluations).values(data).returning();
  if (!row) {
    throw new Error('Failed to create outcome evaluation');
  }
  return row;
}

export async function getEnginePerformance(
  engineType: string,
  since: Date,
): Promise<{
  total: number;
  correct: number;
  precision: number;
}> {
  const db = getDb();
  const result = await db
    .select({
      total: sql<number>`count(*)::int`,
      correct: sql<number>`count(*) filter (where is_correct = true)::int`,
    })
    .from(outcomeEvaluations)
    .innerJoin(
      predictions,
      eq(outcomeEvaluations.predictionId, predictions.predictionId),
    )
    .where(
      and(
        eq(predictions.engineType, engineType),
        sql`outcome_evaluations.evaluated_at >= ${since}`,
      ),
    );

  const total = result[0]?.total ?? 0;
  const correct = result[0]?.correct ?? 0;
  return {
    total,
    correct,
    precision: total > 0 ? correct / total : 0,
  };
}
