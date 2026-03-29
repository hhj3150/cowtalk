// 이벤트 라우트 — 실제 DB 쿼리

import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import { authenticate } from '../middleware/auth.js';
import { requireFarmAccess } from '../middleware/rbac.js';
import { getDb } from '../../config/database.js';
import { smaxtecEvents, farmEvents, animals } from '../../db/schema.js';
import { eq, and, desc, count } from 'drizzle-orm';

export const eventRouter = Router();

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
eventRouter.post('/', async (req: Request, res: Response, next: NextFunction) => {
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

    res.status(201).json({ success: true, data: event });
  } catch (error) {
    next(error);
  }
});

// POST /events/bulk — 벌크 이벤트 기록
eventRouter.post('/bulk', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const db = getDb();
    const { events } = req.body;
    const recordedBy = req.user!.userId;

    const values = (events as Array<Record<string, unknown>>).map((e) => ({
      farmId: e.farmId as string,
      description: (e.description as string) ?? `${String(e.eventType)}: ${String(e.subType ?? '')}`,
      eventType: (e.eventType as string) ?? 'observation',
      subType: (e.subType as string) ?? null,
      severity: (e.severity as string) ?? 'normal',
      eventDate: e.eventDate ? new Date(e.eventDate as string) : new Date(),
      recordedBy,
      metadata: (e.metadata as Record<string, unknown>) ?? {},
    }));

    const created = await db
      .insert(farmEvents)
      .values(values)
      .returning();

    res.status(201).json({ success: true, data: { created: created.length, events: created } });
  } catch (error) {
    next(error);
  }
});

// GET /events/:animalId — 개체별 이벤트 조회
eventRouter.get('/:animalId', async (req: Request, res: Response, next: NextFunction) => {
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
eventRouter.post('/voice', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { farmId, animalId } = req.body;

    const parsed = {
      eventType: 'observation',
      subType: '기타',
      description: '음성 입력에서 변환된 이벤트',
      confidence: 0.85,
      rawTranscript: '(음성 텍스트 변환 결과)',
    };

    res.json({ success: true, data: { parsed, farmId, animalId } });
  } catch (error) {
    next(error);
  }
});
