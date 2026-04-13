// 예측-결과 매칭 서비스 — Intelligence Loop Phase 11A

import { eq, and, sql, desc, gte, lte } from 'drizzle-orm';
import { getDb } from '../config/database.js';
import { predictions, outcomeEvaluations, feedback, smaxtecEvents } from '../db/schema.js';
import { logger } from '../lib/logger.js';

type OutcomeRow = typeof outcomeEvaluations.$inferSelect;
type PredictionRow = typeof predictions.$inferSelect;

interface RecordOutcomeInput {
  readonly predictionId: string;
  readonly animalId?: string;
  readonly actualOutcome: string;
  readonly isCorrect: boolean;
  readonly matchResult: string;
  readonly evaluatedBy?: string;
  readonly notes?: string;
}

interface MatchResult {
  readonly matched: boolean;
  readonly evaluation: OutcomeRow | null;
}

interface BatchMatchSummary {
  readonly totalChecked: number;
  readonly matched: number;
  readonly unmatched: number;
}

/** 7일 (발정/번식 매칭 윈도우) */
const ESTRUS_MATCH_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
/** 3일 (건강/질병 매칭 윈도우) */
const HEALTH_MATCH_WINDOW_MS = 3 * 24 * 60 * 60 * 1000;

const ESTRUS_POSITIVE_TYPES = ['estrus_confirmed', 'insemination_done'];
const ESTRUS_NEGATIVE_TYPES = ['estrus_false'];
const HEALTH_POSITIVE_TYPES = ['disease_confirmed'];
const HEALTH_NEGATIVE_TYPES = ['disease_false'];

/**
 * 수동 결과 기록
 */
export async function recordOutcome(
  input: RecordOutcomeInput,
): Promise<OutcomeRow> {
  try {
    const db = getDb();
    const [row] = await db
      .insert(outcomeEvaluations)
      .values({
        predictionId: input.predictionId,
        actualOutcome: input.actualOutcome,
        isCorrect: input.isCorrect,
        matchResult: input.matchResult,
        evaluatedBy: input.evaluatedBy ?? null,
        details: input.notes ? { notes: input.notes } : null,
      })
      .returning();

    if (!row) {
      throw new Error('Failed to record outcome');
    }

    logger.info(
      { evaluationId: row.evaluationId, predictionId: input.predictionId },
      'Outcome recorded',
    );
    return row;
  } catch (error) {
    logger.error({ error, predictionId: input.predictionId }, 'Failed to record outcome');
    throw error;
  }
}

/**
 * 단건 예측-결과 자동 매칭
 */
export async function matchPredictionToOutcome(
  predictionId: string,
): Promise<MatchResult> {
  try {
    const db = getDb();

    const [pred] = await db
      .select()
      .from(predictions)
      .where(eq(predictions.predictionId, predictionId))
      .limit(1);

    if (!pred) {
      return { matched: false, evaluation: null };
    }

    const [existing] = await db
      .select()
      .from(outcomeEvaluations)
      .where(eq(outcomeEvaluations.predictionId, predictionId))
      .limit(1);

    if (existing) {
      return { matched: true, evaluation: existing };
    }

    const match = await findMatchingFeedback(pred);
    if (!match) {
      return { matched: false, evaluation: null };
    }

    const evaluation = await recordOutcome({
      predictionId,
      animalId: pred.animalId ?? undefined,
      actualOutcome: match.feedbackType,
      isCorrect: match.isCorrect,
      matchResult: match.matchResult,
    });

    return { matched: true, evaluation };
  } catch (error) {
    logger.error({ error, predictionId }, 'Failed to match prediction');
    throw error;
  }
}

/**
 * 배치 자동 매칭 — 미매칭 예측들에 대해 보수적으로 매칭
 */
export async function runBatchMatching(
  farmId?: string,
): Promise<BatchMatchSummary> {
  try {
    const unmatchedList = await getUnmatchedPredictions(farmId, 200);
    let matched = 0;

    for (const pred of unmatchedList) {
      const result = await matchPredictionToOutcome(pred.predictionId);
      if (result.matched) {
        matched++;
      }
    }

    const summary: BatchMatchSummary = {
      totalChecked: unmatchedList.length,
      matched,
      unmatched: unmatchedList.length - matched,
    };

    logger.info(summary, 'Batch matching completed');
    return summary;
  } catch (error) {
    logger.error({ error, farmId }, 'Failed to run batch matching');
    throw error;
  }
}

/**
 * 미매칭 예측 조회
 */
export async function getUnmatchedPredictions(
  farmId?: string,
  limit = 50,
): Promise<readonly PredictionRow[]> {
  try {
    const db = getDb();

    return await db
      .select()
      .from(predictions)
      .where(
        and(
          sql`NOT EXISTS (
            SELECT 1 FROM outcome_evaluations oe
            WHERE oe.prediction_id = ${predictions.predictionId}
          )`,
          farmId ? eq(predictions.farmId, farmId) : undefined,
        ),
      )
      .orderBy(desc(predictions.createdAt))
      .limit(limit);
  } catch (error) {
    logger.error({ error, farmId }, 'Failed to get unmatched predictions');
    throw error;
  }
}

// ─── Private Helpers ───────────────────────────────────────────────

interface FeedbackMatch {
  readonly feedbackType: string;
  readonly isCorrect: boolean;
  readonly matchResult: string;
}

async function findMatchingFeedback(
  pred: PredictionRow,
): Promise<FeedbackMatch | null> {
  const db = getDb();

  // 1) predictionId로 직접 매칭
  const directMatches = await db
    .select()
    .from(feedback)
    .where(eq(feedback.predictionId, pred.predictionId))
    .orderBy(desc(feedback.createdAt));

  if (directMatches.length > 0) {
    return classifyFeedback(pred.engineType, directMatches[0]!.feedbackType);
  }

  // 2) 같은 동물 + 시간 윈도우 매칭 (보수적)
  if (!pred.animalId) {
    return null;
  }

  const windowMs = pred.engineType === 'estrus'
    ? ESTRUS_MATCH_WINDOW_MS
    : HEALTH_MATCH_WINDOW_MS;

  const windowEnd = new Date(pred.timestamp.getTime() + windowMs);

  const animalMatches = await db
    .select()
    .from(feedback)
    .where(
      and(
        eq(feedback.animalId, pred.animalId),
        sql`${feedback.createdAt} >= ${pred.timestamp}`,
        sql`${feedback.createdAt} <= ${windowEnd}`,
      ),
    )
    .orderBy(desc(feedback.createdAt));

  if (animalMatches.length > 0) {
    return classifyFeedback(pred.engineType, animalMatches[0]!.feedbackType);
  }

  // 3) smaXtec 이벤트 기반 후향적 매칭 (feedback 없을 때 fallback)
  return findMatchingSmaxtecEvent(pred);
}

function classifyFeedback(
  engineType: string,
  feedbackType: string,
): FeedbackMatch | null {
  if (engineType === 'estrus' || engineType === 'breeding_advisor_v1') {
    if (ESTRUS_POSITIVE_TYPES.includes(feedbackType)) {
      return { feedbackType, isCorrect: true, matchResult: 'true_positive' };
    }
    if (ESTRUS_NEGATIVE_TYPES.includes(feedbackType)) {
      return { feedbackType, isCorrect: false, matchResult: 'false_positive' };
    }
  }

  if (engineType === 'disease' || engineType === 'sovereign_v1' || engineType === 'diff_diagnosis_v1') {
    if (HEALTH_POSITIVE_TYPES.includes(feedbackType)) {
      return { feedbackType, isCorrect: true, matchResult: 'true_positive' };
    }
    if (HEALTH_NEGATIVE_TYPES.includes(feedbackType)) {
      return { feedbackType, isCorrect: false, matchResult: 'false_positive' };
    }
  }

  return null;
}

// ── smaXtec 이벤트 기반 후향적 매칭 ──
// feedback 테이블에 없어도, smaXtec이 나중에 이벤트를 발생시키면 매칭 가능

/** 소버린/감별진단 예측에 대해 smaXtec 건강 이벤트가 실제 발생했는지 확인 */
const HEALTH_EVENT_TYPES = [
  'health_warning', 'health_general', 'clinical_condition',
  'temperature_high', 'temperature_warning', 'rumination_warning',
  'rumination_decrease', 'activity_decrease',
];

const ESTRUS_EVENT_TYPES = ['estrus', 'estrus_dnb', 'heat', 'insemination'];

async function findMatchingSmaxtecEvent(
  pred: PredictionRow,
): Promise<FeedbackMatch | null> {
  if (!pred.animalId) return null;

  const db = getDb();
  const engine = pred.engineType;
  const isHealthEngine = engine === 'sovereign_v1' || engine === 'diff_diagnosis_v1' || engine === 'disease';
  const isBreedingEngine = engine === 'breeding_advisor_v1' || engine === 'estrus';

  const windowMs = isBreedingEngine ? ESTRUS_MATCH_WINDOW_MS : HEALTH_MATCH_WINDOW_MS;
  const windowEnd = new Date(pred.timestamp.getTime() + windowMs);
  const eventTypes = isHealthEngine ? HEALTH_EVENT_TYPES : isBreedingEngine ? ESTRUS_EVENT_TYPES : [];

  if (eventTypes.length === 0) return null;

  try {
    const matches = await db
      .select({ eventType: smaxtecEvents.eventType, detectedAt: smaxtecEvents.detectedAt })
      .from(smaxtecEvents)
      .where(and(
        eq(smaxtecEvents.animalId, pred.animalId),
        gte(smaxtecEvents.detectedAt, pred.timestamp),
        lte(smaxtecEvents.detectedAt, windowEnd),
        sql`${smaxtecEvents.eventType} = ANY(${eventTypes})`,
      ))
      .orderBy(smaxtecEvents.detectedAt)
      .limit(1);

    if (matches.length > 0) {
      return {
        feedbackType: `smaxtec_${matches[0]!.eventType}`,
        isCorrect: true,
        matchResult: 'true_positive',
      };
    }

    // 윈도우 만료 + 이벤트 없음 = false_positive (7일 이상 경과한 예측만)
    const daysSincePred = (Date.now() - pred.timestamp.getTime()) / (24 * 60 * 60 * 1000);
    if (daysSincePred > 7) {
      return {
        feedbackType: 'no_smaxtec_event',
        isCorrect: false,
        matchResult: 'false_positive',
      };
    }

    return null; // 아직 윈도우 내 — 판정 보류
  } catch (error) {
    logger.debug({ error, predictionId: pred.predictionId }, 'smaXtec matching failed');
    return null;
  }
}
