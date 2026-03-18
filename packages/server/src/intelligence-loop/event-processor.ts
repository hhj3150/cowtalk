// Event → Intelligence Loop 연결
// 농장 이벤트가 기록되면 AI 분석 파이프라인에 피드백을 전달

import { analyzeAnimal, analyzeFarm } from '../ai-brain/index.js';
import { logger } from '../lib/logger.js';
import type { Role } from '@cowtalk/shared';

// 이벤트 타입 → AI 예측 타입 매핑
const EVENT_TO_ENGINE_MAP: Record<string, string> = {
  health: 'disease',
  breeding: 'estrus',
  feeding: 'nutrition',
  movement: 'general',
  treatment: 'disease',
  observation: 'general',
};

interface FarmEvent {
  readonly eventId: string;
  readonly farmId: string;
  readonly animalId?: string;
  readonly eventType: string;
  readonly subType?: string;
  readonly description: string;
  readonly severity: string;
  readonly metadata?: Record<string, unknown>;
}

interface ProcessResult {
  readonly eventId: string;
  readonly processed: boolean;
  readonly engineType: string | null;
  readonly analysisTriggered: boolean;
  readonly feedbackRecorded: boolean;
}

/**
 * 단건 이벤트 처리 — AI 분석 트리거 + 피드백 루프
 */
export async function processEvent(event: FarmEvent): Promise<ProcessResult> {
  const engineType = EVENT_TO_ENGINE_MAP[event.eventType] ?? 'general';

  logger.info(
    { eventId: event.eventId, eventType: event.eventType, engineType },
    'Processing event for intelligence loop',
  );

  let analysisTriggered = false;

  // 심각도가 높으면 즉시 개체 분석 트리거
  if (event.severity === 'high' || event.severity === 'critical') {
    if (event.animalId) {
      try {
        await analyzeAnimal(event.animalId, 'farmer' as Role);
        analysisTriggered = true;
      } catch (error) {
        logger.error({ eventId: event.eventId, error }, 'Failed to trigger animal analysis');
      }
    }

    // 농장 레벨 분석도 트리거
    try {
      await analyzeFarm(event.farmId, 'farmer' as Role);
      analysisTriggered = true;
    } catch (error) {
      logger.error({ eventId: event.eventId, error }, 'Failed to trigger farm analysis');
    }
  }

  // Claude 피드백 루프 — 이벤트를 예측 정확도 검증에 활용
  const feedbackRecorded = await recordEventAsFeedback(event, engineType);

  return {
    eventId: event.eventId,
    processed: true,
    engineType,
    analysisTriggered,
    feedbackRecorded,
  };
}

/**
 * 벌크 이벤트 처리 — 배치 분석용
 */
export async function processBatchEvents(events: readonly FarmEvent[]): Promise<readonly ProcessResult[]> {
  logger.info({ count: events.length }, 'Processing batch events for intelligence loop');

  const results: ProcessResult[] = [];
  for (const event of events) {
    const result = await processEvent(event);
    results.push(result);
  }

  // 배치 처리 후 영향 받은 농장들 종합 분석
  const affectedFarmIds = [...new Set(events.map((e) => e.farmId))];
  for (const farmId of affectedFarmIds) {
    try {
      await analyzeFarm(farmId, 'farmer' as Role);
    } catch (error) {
      logger.error({ farmId, error }, 'Failed batch farm analysis');
    }
  }

  return results;
}

/**
 * 이벤트 → 예측 피드백 기록
 * 사용자가 기록한 이벤트(질병, 발정 등)를 AI 예측의 정확도 검증에 활용
 */
async function recordEventAsFeedback(event: FarmEvent, engineType: string): Promise<boolean> {
  try {
    // 이벤트 타입별 피드백 매핑
    const feedbackMapping = buildFeedbackMapping(event, engineType);
    if (!feedbackMapping) return false;

    // TODO: DB에 피드백 저장 — predictions + outcome_evaluations 테이블
    // 현재는 로그 기록만
    logger.info(
      { eventId: event.eventId, engineType, feedbackType: feedbackMapping.feedbackType },
      'Event recorded as AI feedback',
    );

    return true;
  } catch (error) {
    logger.error({ eventId: event.eventId, error }, 'Failed to record event as feedback');
    return false;
  }
}

function buildFeedbackMapping(event: FarmEvent, engineType: string) {
  switch (event.eventType) {
    case 'health':
      return {
        feedbackType: 'disease_confirmation',
        engineType,
        isPositiveConfirmation: true,
        details: { diagnosis: event.subType, severity: event.severity },
      };
    case 'breeding':
      if (event.subType === '발정') {
        return {
          feedbackType: 'estrus_confirmation',
          engineType: 'estrus',
          isPositiveConfirmation: true,
          details: { detectedBy: 'farmer_observation' },
        };
      }
      if (event.subType === '수정') {
        return {
          feedbackType: 'breeding_record',
          engineType: 'estrus',
          isPositiveConfirmation: true,
          details: event.metadata,
        };
      }
      return null;
    case 'treatment':
      return {
        feedbackType: 'treatment_outcome',
        engineType: 'disease',
        isPositiveConfirmation: false,
        details: { treatment: event.description },
      };
    default:
      return null;
  }
}

/**
 * 스케줄 기반 미처리 이벤트 수집 + 처리
 * 5분 주기 cron에서 호출
 */
export async function processUnprocessedEvents(): Promise<number> {
  // TODO: DB 조회 — ai_processed = false인 farm_events 조회
  // const unprocessed = await db.select().from(farmEvents).where(eq(farmEvents.aiProcessed, false)).limit(100);
  // for (const event of unprocessed) { await processEvent(event); }
  // await db.update(farmEvents).set({ aiProcessed: true }).where(inArray(farmEvents.eventId, ids));

  logger.info('Checking for unprocessed events');
  return 0;
}
