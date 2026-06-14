// 열린 루프 닫기 — 사용자 farm_event → feedback 적재 + 예측 매칭
//
// 흐름: 사용자가 이벤트(발정/수정/질병 등)를 기록 → 이를 정답(ground-truth) feedback 으로
// 적재 → 같은 동물의 미평가 예측을 즉시 매칭(outcome_evaluations)하여 정확도 평가의 루프를 닫는다.
// 주기 배치(orchestrator runBatchMatching)와 별개로 즉시 닫아 지연을 없앤다.
//
// 원칙: 농장주가 "실제 발생한 사건"을 기록하는 것은 추측이 아닌 사실이므로 예측 정확도의 정답으로 신뢰.
// 단, 부정 신호(estrus_false/disease_false)는 명시적 feedback API 가 담당(여기선 양성 확인만 매핑).

import { and, eq, gte, sql } from 'drizzle-orm';
import { getDb } from '../config/database.js';
import { predictions } from '../db/schema.js';
import { logger } from '../lib/logger.js';
import { collectFeedback, type FeedbackType } from './feedback-collector.js';
import { matchPredictionToOutcome } from './outcome-recorder.js';

/** 예측 매칭 윈도우 — 같은 동물의 최근 7일 미평가 예측만 대상 */
const PREDICTION_MATCH_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
/** 한 이벤트당 매칭 시도 상한 (storm 방지) */
const MAX_PREDICTIONS_PER_EVENT = 50;

/**
 * 사용자 farm_event → 정답 feedback 타입 매핑 (순수 함수).
 * 정답으로 부적합한 이벤트(치료/검진/관찰 등)는 null → feedback 미적재.
 */
export function mapEventToFeedbackType(
  eventType: string,
  subType?: string | null,
): FeedbackType | null {
  const sub = (subType ?? '').trim();
  switch (eventType) {
    case 'breeding':
      if (sub === '발정') return 'estrus_confirmed';
      if (sub === '수정') return 'insemination_done';
      if (sub === '임신확인') return 'pregnancy_confirmed';
      if (sub === '유산') return 'pregnancy_negative';
      return null;
    case 'health':
      // 효과 여부를 모르는 치료/검진/부상은 제외 — "질병" 확진만 정답
      if (sub === '질병') return 'disease_confirmed';
      return null;
    default:
      return null;
  }
}

export interface RecordFarmEventFeedbackInput {
  readonly eventId: string;
  readonly farmId: string;
  readonly animalId?: string | null;
  readonly eventType: string;
  readonly subType?: string | null;
  readonly description?: string | null;
  /** 기록자 역할 (farmer/veterinarian/...) — feedback.source_role */
  readonly sourceRole: string;
  /** 기록자 user uuid — feedback.recorded_by */
  readonly recordedBy: string;
}

export interface RecordFarmEventFeedbackResult {
  readonly feedbackId: string;
  readonly feedbackType: FeedbackType;
  readonly predictionsMatched: number;
}

/**
 * farm_event 를 feedback 으로 적재하고, 같은 동물의 미평가 예측을 즉시 매칭한다.
 * 정답 신호가 아닌 이벤트는 null 반환(no-op). 호출부는 fire-and-forget 권장.
 */
export async function recordFarmEventFeedback(
  input: RecordFarmEventFeedbackInput,
): Promise<RecordFarmEventFeedbackResult | null> {
  const feedbackType = mapEventToFeedbackType(input.eventType, input.subType);
  if (!feedbackType) return null;

  const noteParts = [`farm_event:${input.eventId}`];
  if (input.description) noteParts.push(input.description);

  const row = await collectFeedback({
    animalId: input.animalId ?? undefined,
    farmId: input.farmId,
    feedbackType,
    sourceRole: input.sourceRole,
    recordedBy: input.recordedBy,
    notes: noteParts.join(' · '),
  });

  // 즉시 루프 닫기 — 주기 배치를 기다리지 않고 같은 동물의 미평가 예측을 매칭
  const predictionsMatched = input.animalId
    ? await matchAnimalPredictions(input.animalId)
    : 0;

  logger.info(
    { eventId: input.eventId, animalId: input.animalId, feedbackType, predictionsMatched },
    '[AX-LOOP] farm_event → feedback 적재 + 예측 매칭',
  );

  return { feedbackId: row.feedbackId, feedbackType, predictionsMatched };
}

/** 같은 동물의 최근 7일 미평가 예측을 매칭 (방금 적재한 feedback 이 outcome-recorder 의 동물+윈도우 매칭에 잡힘) */
async function matchAnimalPredictions(animalId: string): Promise<number> {
  const db = getDb();
  const cutoff = new Date(Date.now() - PREDICTION_MATCH_WINDOW_MS);

  const rows = await db
    .select({ predictionId: predictions.predictionId })
    .from(predictions)
    .where(
      and(
        eq(predictions.animalId, animalId),
        gte(predictions.createdAt, cutoff),
        sql`NOT EXISTS (
          SELECT 1 FROM outcome_evaluations oe
          WHERE oe.prediction_id = ${predictions.predictionId}
        )`,
      ),
    )
    .limit(MAX_PREDICTIONS_PER_EVENT);

  let matched = 0;
  for (const r of rows) {
    try {
      const result = await matchPredictionToOutcome(r.predictionId);
      if (result.matched) matched++;
    } catch (err) {
      logger.warn(
        { err: (err as Error).message, predictionId: r.predictionId },
        '[AX-LOOP] 예측 매칭 실패',
      );
    }
  }
  return matched;
}
