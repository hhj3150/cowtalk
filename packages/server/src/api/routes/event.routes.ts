// 이벤트 라우트 — 실제 DB 쿼리

import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import { authenticate } from '../middleware/auth.js';
import { requireFarmAccess } from '../middleware/rbac.js';
import { getDb } from '../../config/database.js';
import { smaxtecEvents, farmEvents, animals } from '../../db/schema.js';
import { eq, and, desc, count } from 'drizzle-orm';
import { logger } from '../../lib/logger.js';
import { recordFarmEventFeedback } from '../../intelligence-loop/event-feedback.js';
import { requireAnimalAccess, requireScopedIds, requireAnimalInBodyFarm, resolveScopedFarmId } from '../middleware/animal-access.js';
import { scopedFarmIds } from '../middleware/rbac.js';
import { ForbiddenError, BadRequestError } from '../../lib/errors.js';

/**
 * 열린 루프 닫기 — 사용자 farm_event 를 정답 feedback 으로 적재하고 같은 동물의
 * 미평가 예측을 즉시 매칭(outcome_evaluations)한다. event 기록 UX 를 막지 않도록
 * fire-and-forget(비차단). 정답 신호가 아닌 이벤트는 recordFarmEventFeedback 이 no-op.
 */
function recordEventFeedbackAsync(input: {
  eventId: string; farmId: string; animalId: string | null;
  eventType: string; subType: string | null; description: string;
  sourceRole: string; recordedBy: string;
}): void {
  void recordFarmEventFeedback(input).catch((err) =>
    logger.warn(
      { err: (err as Error).message, eventId: input.eventId },
      '[AX-LOOP] farm_event → feedback 적재 실패',
    ),
  );
}

/**
 * 벌크 이벤트 입력 → farmEvents insert 값 (순수 함수).
 * ⚠️ animalId 를 반드시 포함한다 — 누락 시 모든 벌크 이벤트가 농장 단위로만 적재돼
 * 개체별 예측 매칭(열린 루프)이 스킵된다. 단건 POST 와 동일하게 개체를 연결한다.
 */
export function mapBulkEventToInsertValues(
  e: Record<string, unknown>,
  recordedBy: string,
): {
  farmId: string;
  animalId: string | null;
  description: string;
  eventType: string;
  subType: string | null;
  severity: string;
  eventDate: Date;
  recordedBy: string;
  metadata: Record<string, unknown>;
} {
  return {
    farmId: e.farmId as string,
    animalId: (e.animalId as string) ?? null,
    description: (e.description as string) ?? `${String(e.eventType)}: ${String(e.subType ?? '')}`,
    eventType: (e.eventType as string) ?? 'observation',
    subType: (e.subType as string) ?? null,
    severity: (e.severity as string) ?? 'normal',
    eventDate: e.eventDate ? new Date(e.eventDate as string) : new Date(),
    recordedBy,
    metadata: (e.metadata as Record<string, unknown>) ?? {},
  };
}

export const eventRouter = Router();

const UUID_SHAPE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function assertBulkEventsInScope(
  events: ReadonlyArray<Record<string, unknown>>,
  scope: readonly string[] | null,
): Promise<void> {
  for (const e of events) {
    const farmId = typeof e.farmId === 'string' ? e.farmId : '';
    if (!UUID_SHAPE.test(farmId)) throw new BadRequestError('각 이벤트에 올바른 farmId 가 필요합니다');
    if (scope !== null && !scope.includes(farmId)) throw new ForbiddenError('다른 목장의 이벤트는 기록할 수 없습니다');
    const animalId = typeof e.animalId === 'string' && e.animalId !== '' ? e.animalId : null;
    if (animalId) {
      if (!UUID_SHAPE.test(animalId)) throw new BadRequestError('animalId 형식이 올바르지 않습니다');
      const animalFarm = await resolveScopedFarmId('animal', animalId);
      if (animalFarm !== farmId) throw new ForbiddenError('개체가 해당 목장 소속이 아닙니다');
    }
  }
}

eventRouter.use(authenticate);

// GET /events/types — 이벤트 타입 정의
eventRouter.get('/types', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const eventTypes = [
      { type: 'health', label: '건강', subTypes: ['질병', '부상', '치료', '검진'] },
      { type: 'breeding', label: '번식', subTypes: ['발정', '수정', '임신확인', '유산'] },
      { type: 'feeding', label: '급이', subTypes: ['사료변경', '음수이상', '식욕부진'] },
      { type: 'movement', label: '이동', subTypes: ['입식', '출하', '폐사', '군분리'] },
      { type: 'treatment', label: '처치', subTypes: ['투약', '수술', '예방접종', '발굽관리'] },
      { type: 'observation', label: '관찰', subTypes: ['행동이상', '외관이상', '기타'] },
    ];

    res.json({ success: true, data: eventTypes });
  } catch (error) {
    next(error);
  }
});

// POST /events — 단건 이벤트 기록
// 프론트엔드: { animalId, farmId, eventTypeId, data }
// 레거시:     { farmId, eventType, subType, description, eventDate, metadata }
// SEC-09: 본문 farmId·animalId 를 스코프로 검사 (예전: 남의 목장에 이벤트 기록 가능)
eventRouter.post('/', requireScopedIds([
  { source: 'body', field: 'farmId', kind: 'farm', required: true },
  { source: 'body', field: 'animalId', kind: 'animal' },
]), requireAnimalInBodyFarm(), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const db = getDb();
    const body = req.body as Record<string, unknown>;
    const farmId = body.farmId as string;
    const animalId = (body.animalId as string) ?? null;
    const eventType = (body.eventType as string) ?? (body.eventTypeId as string) ?? 'observation';
    const subType = (body.subType as string) ?? null;
    const description = (body.description as string)
      ?? (body.data && typeof body.data === 'object' && 'notes' in body.data ? String((body.data as Record<string, unknown>).notes) : null)
      ?? `${eventType}${subType ? `: ${subType}` : ''}`;
    const severity = (body.severity as string) ?? 'normal';
    const eventDate = body.eventDate ? new Date(body.eventDate as string) : new Date();
    const metadata = (body.metadata as Record<string, unknown>) ?? (body.data as Record<string, unknown>) ?? {};
    const recordedBy = req.user!.userId;

    const [event] = await db
      .insert(farmEvents)
      .values({
        farmId,
        animalId,
        description,
        eventType,
        subType,
        severity,
        eventDate,
        recordedBy,
        metadata,
      })
      .returning();

    // 열린 루프 닫기 — farm_event → feedback 적재 + 예측 매칭 (fire-and-forget, 응답 비차단).
    if (event) {
      recordEventFeedbackAsync({
        eventId: event.eventId,
        farmId: event.farmId,
        animalId: event.animalId,
        eventType: event.eventType,
        subType: event.subType,
        description: event.description,
        sourceRole: req.user!.role,
        recordedBy,
      });
    }

    res.status(201).json({ success: true, data: event });
  } catch (error) {
    next(error);
  }
});

// POST /events/bulk — 벌크 이벤트 기록
eventRouter.post('/bulk', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const db = getDb();
    const { events } = req.body as { events?: unknown };
    const recordedBy = req.user!.userId;
    if (!Array.isArray(events) || events.length === 0 || events.length > 500) {
      throw new BadRequestError('events 는 1~500건 배열이어야 합니다');
    }
    // SEC-09: 각 건의 farmId·animalId 를 스코프로 검사 — 하나라도 밖이면 전체 거부
    await assertBulkEventsInScope(events as Array<Record<string, unknown>>, scopedFarmIds(req));

    const values = (events as Array<Record<string, unknown>>).map((e) =>
      mapBulkEventToInsertValues(e, recordedBy),
    );

    const created = await db
      .insert(farmEvents)
      .values(values)
      .returning();

    // 열린 루프 닫기 — 각 이벤트를 feedback 으로 적재 + 예측 매칭 (fire-and-forget).
    for (const ev of created) {
      recordEventFeedbackAsync({
        eventId: ev.eventId,
        farmId: ev.farmId,
        animalId: ev.animalId,
        eventType: ev.eventType,
        subType: ev.subType,
        description: ev.description,
        sourceRole: req.user!.role,
        recordedBy,
      });
    }

    res.status(201).json({ success: true, data: { created: created.length, events: created } });
  } catch (error) {
    next(error);
  }
});

// GET /events/:animalId — 개체별 이벤트 조회
eventRouter.get('/:animalId', requireAnimalAccess(), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const db = getDb();
    const animalId = req.params.animalId as string;
    const limit = Math.min(Number(req.query.limit) || 20, 100);
    const offset = Number(req.query.offset) || 0;

    const events = await db
      .select({
        eventId: smaxtecEvents.eventId,
        animalId: smaxtecEvents.animalId,
        eventType: smaxtecEvents.eventType,
        confidence: smaxtecEvents.confidence,
        severity: smaxtecEvents.severity,
        detectedAt: smaxtecEvents.detectedAt,
        details: smaxtecEvents.details,
        acknowledged: smaxtecEvents.acknowledged,
      })
      .from(smaxtecEvents)
      .where(eq(smaxtecEvents.animalId, animalId))
      .orderBy(desc(smaxtecEvents.detectedAt))
      .limit(limit)
      .offset(offset);

    const [totalResult] = await db
      .select({ count: count() })
      .from(smaxtecEvents)
      .where(eq(smaxtecEvents.animalId, animalId));

    res.json({
      success: true,
      data: { events, total: totalResult?.count ?? 0, limit, offset },
    });
  } catch (error) {
    next(error);
  }
});

// GET /events/farm/:farmId — 농장별 이벤트
eventRouter.get('/farm/:farmId', requireFarmAccess, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const db = getDb();
    const farmId = req.params.farmId as string;
    const eventType = req.query.eventType as string | undefined;
    const limit = Math.min(Number(req.query.limit) || 50, 200);

    const conditions = [eq(smaxtecEvents.farmId, farmId)];
    if (eventType) {
      conditions.push(eq(smaxtecEvents.eventType, eventType));
    }

    const events = await db
      .select({
        eventId: smaxtecEvents.eventId,
        animalId: smaxtecEvents.animalId,
        animalName: animals.name,
        animalEarTag: animals.earTag,
        eventType: smaxtecEvents.eventType,
        confidence: smaxtecEvents.confidence,
        severity: smaxtecEvents.severity,
        detectedAt: smaxtecEvents.detectedAt,
        details: smaxtecEvents.details,
      })
      .from(smaxtecEvents)
      .leftJoin(animals, eq(smaxtecEvents.animalId, animals.animalId))
      .where(and(...conditions))
      .orderBy(desc(smaxtecEvents.detectedAt))
      .limit(limit);

    res.json({ success: true, data: { events, farmId } });
  } catch (error) {
    next(error);
  }
});

// POST /events/voice — 음성 이벤트 변환
// NEW-04: 구현되지 않은 자리표시 — 예전엔 입력과 무관한 고정 결과(신뢰도 0.85)를 '변환 성공'처럼 돌려줬다.
// 화면에서 쓰지 않으며, 음성 기록은 팅커벨 대화(확인 후 저장) 경로를 쓴다. 지어낸 결과 대신 미구현을 알린다.
eventRouter.post('/voice', (_req: Request, res: Response) => {
  res.status(501).json({ success: false, error: { code: 'NOT_IMPLEMENTED', message: '음성 이벤트 변환은 팅커벨 대화로 기록해 주세요.' } });
});
