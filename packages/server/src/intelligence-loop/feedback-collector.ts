// 피드백 수집 서비스 — Intelligence Loop Phase 11A

import { eq, and, desc, sql, gte, lte } from 'drizzle-orm';
import { getDb } from '../config/database.js';
import { feedback } from '../db/schema.js';
import { logger } from '../lib/logger.js';

/** 11가지 피드백 타입 */
export type FeedbackType =
  | 'estrus_confirmed'
  | 'estrus_false'
  | 'insemination_done'
  | 'pregnancy_confirmed'
  | 'pregnancy_negative'
  | 'disease_confirmed'
  | 'disease_false'
  | 'treatment_effective'
  | 'treatment_ineffective'
  | 'alert_useful'
  | 'alert_ignored';

interface CollectFeedbackInput {
  readonly predictionId?: string;
  readonly alertId?: string;
  readonly animalId?: string;
  readonly farmId: string;
  readonly feedbackType: FeedbackType;
  readonly feedbackValue?: number;
  readonly sourceRole: string;
  readonly recordedBy: string;
  readonly notes?: string;
}

interface FeedbackStats {
  readonly total: number;
  readonly byType: Record<string, number>;
  readonly byRole: Record<string, number>;
}

type FeedbackRow = typeof feedback.$inferSelect;

/**
 * 피드백 저장 — DB feedback 테이블에 기록
 */
export async function collectFeedback(
  input: CollectFeedbackInput,
): Promise<FeedbackRow> {
  try {
    const db = getDb();
    const [row] = await db
      .insert(feedback)
      .values({
        predictionId: input.predictionId ?? null,
        alertId: input.alertId ?? null,
        animalId: input.animalId ?? null,
        farmId: input.farmId,
        feedbackType: input.feedbackType,
        feedbackValue: input.feedbackValue ?? null,
        sourceRole: input.sourceRole,
        recordedBy: input.recordedBy,
        notes: input.notes ?? null,
      })
      .returning();

    if (!row) {
      throw new Error('Failed to insert feedback');
    }

    logger.info(
      { feedbackId: row.feedbackId, feedbackType: input.feedbackType },
      'Feedback collected',
    );
    return row;
  } catch (error) {
    logger.error({ error, input }, 'Failed to collect feedback');
    throw error;
  }
}

/**
 * 동물별 피드백 조회
 */
export async function getFeedbackByAnimal(
  animalId: string,
): Promise<readonly FeedbackRow[]> {
  try {
    const db = getDb();
    return await db
      .select()
      .from(feedback)
      .where(eq(feedback.animalId, animalId))
      .orderBy(desc(feedback.createdAt));
  } catch (error) {
    logger.error({ error, animalId }, 'Failed to get feedback by animal');
    throw error;
  }
}

/**
 * 예측별 피드백 조회
 */
export async function getFeedbackByPrediction(
  predictionId: string,
): Promise<readonly FeedbackRow[]> {
  try {
    const db = getDb();
    return await db
      .select()
      .from(feedback)
      .where(eq(feedback.predictionId, predictionId))
      .orderBy(desc(feedback.createdAt));
  } catch (error) {
    logger.error({ error, predictionId }, 'Failed to get feedback by prediction');
    throw error;
  }
}

/**
 * 농장별 피드백 통계
 */
export async function getFeedbackStats(
  farmId: string,
  dateRange: { readonly from: Date; readonly to: Date },
): Promise<FeedbackStats> {
  try {
    const db = getDb();
    const conditions = [
      eq(feedback.farmId, farmId),
      gte(feedback.createdAt, dateRange.from),
      lte(feedback.createdAt, dateRange.to),
    ];

    const where = and(...conditions);

    const [totalResult, typeResults, roleResults] = await Promise.all([
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(feedback)
        .where(where),
      db
        .select({
          feedbackType: feedback.feedbackType,
          count: sql<number>`count(*)::int`,
        })
        .from(feedback)
        .where(where)
        .groupBy(feedback.feedbackType),
      db
        .select({
          sourceRole: feedback.sourceRole,
          count: sql<number>`count(*)::int`,
        })
        .from(feedback)
        .where(where)
        .groupBy(feedback.sourceRole),
    ]);

    const byType: Record<string, number> = {};
    for (const row of typeResults) {
      byType[row.feedbackType] = row.count;
    }

    const byRole: Record<string, number> = {};
    for (const row of roleResults) {
      byRole[row.sourceRole] = row.count;
    }

    return {
      total: totalResult[0]?.count ?? 0,
      byType,
      byRole,
    };
  } catch (error) {
    logger.error({ error, farmId }, 'Failed to get feedback stats');
    throw error;
  }
}
