// 소버린 AI 지식 강화 루프 — 레이블 + AI 대화 라우트
// Sovereign AI Knowledge Loop: Expert labels events via AI chat

import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import { authenticate } from '../middleware/auth.js';
import { logger } from '../../lib/logger.js';
import { getDb } from '../../config/database.js';
import {
  smaxtecEvents, animals, farms, eventLabels, users, labelFollowUps, clinicalObservations, chatSessions,
} from '../../db/schema.js';
import { eq, and, gte, desc, inArray, count, sql } from 'drizzle-orm';
import { handleChatStream } from '../../chat/chat-service.js';
import { extractRecordsFromConversation } from '../../chat/conversation-extractor.js';
import { isClaudeAvailable } from '../../ai-brain/claude-client.js';
import type { Role, ExtractedRecord } from '@cowtalk/shared';
import type {
  EventContext,
  EventHistoryItem,
  ExistingLabel,
  SovereignAiStats,
  MisclassificationItem,
  DailyLabelCount,
} from '@cowtalk/shared';

export const labelChatRouter = Router();

labelChatRouter.use(authenticate);

// ===========================
// 이벤트 컨텍스트 조회
// GET /api/label-chat/context/:eventId
// ===========================

labelChatRouter.get('/context/:eventId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const db = getDb();
    const eventId = req.params.eventId as string;

    // 이벤트 조회
    const eventRows = await db.select({
      eventId: smaxtecEvents.eventId,
      eventType: smaxtecEvents.eventType,
      externalEventId: smaxtecEvents.externalEventId,
      severity: smaxtecEvents.severity,
      detectedAt: smaxtecEvents.detectedAt,
      animalId: smaxtecEvents.animalId,
      farmId: smaxtecEvents.farmId,
      details: smaxtecEvents.details,
    })
      .from(smaxtecEvents)
      .where(eq(smaxtecEvents.eventId, eventId))
      .limit(1);

    if (eventRows.length === 0) {
      res.status(404).json({ success: false, error: 'Event not found' });
      return;
    }

    const event = eventRows[0]!;

    // 동물 정보
    const animalRows = await db.select({
      earTag: animals.earTag,
    })
      .from(animals)
      .where(eq(animals.animalId, event.animalId))
      .limit(1);

    // 농장 정보
    const farmRows = await db.select({
      name: farms.name,
    })
      .from(farms)
      .where(eq(farms.farmId, event.farmId))
      .limit(1);

    // 최근 이벤트 이력 (같은 동물, 최근 30일)
    const since30d = new Date();
    since30d.setDate(since30d.getDate() - 30);

    const historyRows = await db.select({
      eventType: smaxtecEvents.eventType,
      severity: smaxtecEvents.severity,
      detectedAt: smaxtecEvents.detectedAt,
      externalEventId: smaxtecEvents.externalEventId,
    })
      .from(smaxtecEvents)
      .where(
        and(
          eq(smaxtecEvents.animalId, event.animalId),
          gte(smaxtecEvents.detectedAt, since30d),
        ),
      )
      .orderBy(desc(smaxtecEvents.detectedAt))
      .limit(20);

    const recentHistory: EventHistoryItem[] = historyRows.map((h) => ({
      eventType: h.eventType,
      severity: h.severity,
      detectedAt: h.detectedAt.toISOString(),
      label: h.externalEventId ?? h.eventType,
    }));

    // 기존 레이블 조회
    const labelRows = await db.select({
      labelId: eventLabels.labelId,
      verdict: eventLabels.verdict,
      actualDiagnosis: eventLabels.actualDiagnosis,
      actionTaken: eventLabels.actionTaken,
      outcome: eventLabels.outcome,
      labeledAt: eventLabels.labeledAt,
      labeledBy: eventLabels.labeledBy,
    })
      .from(eventLabels)
      .where(eq(eventLabels.eventId, eventId))
      .orderBy(desc(eventLabels.labeledAt));

    const currentLabels: ExistingLabel[] = labelRows.map((l) => ({
      labelId: l.labelId,
      verdict: l.verdict as ExistingLabel['verdict'],
      actualDiagnosis: l.actualDiagnosis,
      actionTaken: l.actionTaken,
      outcome: l.outcome as ExistingLabel['outcome'],
      labeledAt: l.labeledAt.toISOString(),
      labeledBy: l.labeledBy,
    }));

    const detailObj = (event.details ?? {}) as Record<string, unknown>;
    const sensorSummary = (detailObj['summary'] as string)
      ?? (detailObj['description'] as string)
      ?? `${event.eventType} 이벤트 감지`;

    const context: EventContext = {
      eventId: event.eventId,
      eventType: event.eventType,
      smaxtecOriginalType: event.externalEventId ?? event.eventType,
      severity: event.severity,
      detectedAt: event.detectedAt.toISOString(),
      animalId: event.animalId,
      earTag: animalRows[0]?.earTag ?? 'N/A',
      farmId: event.farmId,
      farmName: farmRows[0]?.name ?? '알 수 없음',
      sensorSummary,
      recentHistory,
      currentLabels,
    };

    res.json({ success: true, data: context });
  } catch (error) {
    logger.error({ error }, 'Label chat context query failed');
    next(error);
  }
});

// ===========================
// AI 대화 스트리밍 (이벤트 맥락 포함)
// POST /api/label-chat/stream
// ===========================

labelChatRouter.post('/stream', async (req: Request, res: Response) => {
  const body = req.body as {
    question: string;
    eventId: string;
    animalId?: string;
    farmId?: string;
    conversationHistory?: Array<{ role: 'user' | 'assistant'; content: string }>;
    eventContext?: string; // 직렬화된 이벤트 컨텍스트
  };

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  if (!isClaudeAvailable()) {
    res.write(`data: ${JSON.stringify({ type: 'text', content: '현재 AI 엔진을 사용할 수 없습니다. 레이블은 수동으로 입력해 주세요.' })}\n\n`);
    res.write(`data: ${JSON.stringify({ type: 'done', content: '현재 AI 엔진을 사용할 수 없습니다. 레이블은 수동으로 입력해 주세요.' })}\n\n`);
    res.end();
    return;
  }

  // 레이블링 전문 시스템 프롬프트를 대화 컨텍스트에 추가
  const labelSystemContext = body.eventContext
    ? `\n\n## 현재 이벤트 컨텍스트\n${body.eventContext}\n\n## 레이블링 가이드\n당신은 축산 전문 AI입니다. 현장 전문가가 smaXtec 센서 알람에 대해 질문합니다. 전문가가 현장에서 직접 확인한 정보를 바탕으로 정확한 진단과 레이블링을 도와주세요. 전문가의 현장 관찰을 존중하되, 센서 데이터와 결합하여 더 정확한 판단을 제안하세요.\n\n## 대화-즉-기록 가이드\n사용자가 수정, 분만, 치료, 예방접종 등 조치를 언급하면 자연스럽게 확인하고, 빠진 정보가 있으면 추가로 물어보세요. 예: "정액 번호가 어떻게 되나요?" "발정 강도는 어느 정도였나요?"`
    : `\n\n## 대화-즉-기록 가이드\n당신은 축산 전문 AI입니다. 사용자가 수정, 분만, 치료, 예방접종, 관찰 등을 언급하면 자연스럽게 확인하고, 빠진 정보가 있으면 추가로 물어보세요.`;

  const dashboardContext = labelSystemContext;

  // 대화 이력 구성 (추출용)
  const fullHistory = [
    ...(body.conversationHistory ?? []),
    { role: 'user' as const, content: body.question },
  ];

  await handleChatStream(
    {
      question: body.question,
      role: (req.user?.role ?? 'veterinarian') as Role,
      farmId: body.farmId ?? null,
      animalId: body.animalId ?? null,
      conversationHistory: body.conversationHistory ?? [],
      dashboardContext,
    },
    {
      onText: (text) => {
        res.write(`data: ${JSON.stringify({ type: 'text', content: text })}\n\n`);
      },
      onDone: async (fullText) => {
        // 스트리밍 완료 → AI 응답 포함한 전체 대화에서 기록 추출
        const completeHistory = [
          ...fullHistory,
          { role: 'assistant' as const, content: fullText },
        ];

        try {
          const extracted = await extractRecordsFromConversation(completeHistory);
          if (extracted.length > 0) {
            res.write(`data: ${JSON.stringify({ type: 'extracted_records', content: extracted })}\n\n`);
          }
        } catch (err) {
          logger.warn({ err }, 'Record extraction failed (non-fatal)');
        }

        res.write(`data: ${JSON.stringify({ type: 'done', content: fullText })}\n\n`);
        res.end();
      },
      onError: (error) => {
        res.write(`data: ${JSON.stringify({ type: 'error', content: error.message })}\n\n`);
        res.end();
      },
    },
  );
});

// ===========================
// 레이블 제출
// POST /api/label-chat/label
// ===========================

labelChatRouter.post('/label', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const db = getDb();
    const userId = req.user?.userId ?? null;
    const body = req.body as {
      eventId: string;
      animalId: string;
      farmId: string;
      predictedType?: string;
      predictedSeverity?: string;
      verdict: string;
      actualType?: string;
      actualSeverity?: string;
      actualDiagnosis?: string;
      actionTaken?: string;
      outcome?: string;
      notes?: string;
      conversationSummary?: string;
    };

    // 이벤트 원본 조회 (predicted 값 얻기)
    const eventRows = await db.select({
      eventType: smaxtecEvents.eventType,
      severity: smaxtecEvents.severity,
    })
      .from(smaxtecEvents)
      .where(eq(smaxtecEvents.eventId, body.eventId))
      .limit(1);

    const predicted = eventRows[0];

    const result = await db.insert(eventLabels).values({
      eventId: body.eventId,
      animalId: body.animalId,
      farmId: body.farmId,
      predictedType: body.predictedType ?? predicted?.eventType ?? 'unknown',
      predictedSeverity: body.predictedSeverity ?? predicted?.severity ?? 'unknown',
      verdict: body.verdict,
      actualType: body.actualType ?? null,
      actualSeverity: body.actualSeverity ?? null,
      actualDiagnosis: body.actualDiagnosis ?? null,
      actionTaken: body.actionTaken ?? null,
      outcome: body.outcome ?? null,
      notes: body.conversationSummary
        ? `${body.notes ?? ''}\n\n[AI 대화 요약] ${body.conversationSummary}`.trim()
        : (body.notes ?? null),
      labeledBy: userId,
    }).returning();

    // 이벤트를 acknowledged로 표시
    await db.update(smaxtecEvents)
      .set({ acknowledged: true })
      .where(eq(smaxtecEvents.eventId, body.eventId));

    logger.info({
      eventId: body.eventId,
      verdict: body.verdict,
      userId,
    }, 'Event label submitted — sovereign AI knowledge loop');

    res.json({ success: true, data: result[0] ?? null });
  } catch (error) {
    logger.error({ error }, 'Label submission failed');
    next(error);
  }
});

// ===========================
// 소버린 AI 학습 통계
// GET /api/label-chat/sovereign-stats
// ===========================

labelChatRouter.get('/sovereign-stats', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const db = getDb();

    // 전체 레이블 통계
    const totalRow = await db.select({ cnt: count() }).from(eventLabels);
    const totalLabels = Number(totalRow[0]?.cnt ?? 0);

    // verdict별 카운트
    const verdictRows = await db.select({
      verdict: eventLabels.verdict,
      cnt: count(),
    })
      .from(eventLabels)
      .groupBy(eventLabels.verdict);

    const verdictMap = new Map(verdictRows.map((r) => [r.verdict, Number(r.cnt)]));
    const confirmedCount = verdictMap.get('confirmed') ?? 0;
    const falsePositiveCount = verdictMap.get('false_positive') ?? 0;
    const modifiedCount = verdictMap.get('modified') ?? 0;
    const missedCount = verdictMap.get('missed') ?? 0;

    const accuracyRate = totalLabels > 0
      ? Math.round((confirmedCount / totalLabels) * 1000) / 10
      : 0;

    // 최근 30일 정확도 vs 이전 30일
    const now = new Date();
    const since30d = new Date(now);
    since30d.setDate(since30d.getDate() - 30);
    const since60d = new Date(now);
    since60d.setDate(since60d.getDate() - 60);

    const recent30 = await db.select({
      verdict: eventLabels.verdict,
      cnt: count(),
    })
      .from(eventLabels)
      .where(gte(eventLabels.labeledAt, since30d))
      .groupBy(eventLabels.verdict);

    const prev30 = await db.select({
      verdict: eventLabels.verdict,
      cnt: count(),
    })
      .from(eventLabels)
      .where(
        and(
          gte(eventLabels.labeledAt, since60d),
          sql`${eventLabels.labeledAt} < ${since30d.toISOString()}`,
        ),
      )
      .groupBy(eventLabels.verdict);

    const recentTotal = recent30.reduce((s, r) => s + Number(r.cnt), 0);
    const recentConfirmed = Number(recent30.find((r) => r.verdict === 'confirmed')?.cnt ?? 0);
    const recentAccuracy = recentTotal > 0 ? (recentConfirmed / recentTotal) * 100 : 0;

    const prevTotal = prev30.reduce((s, r) => s + Number(r.cnt), 0);
    const prevConfirmed = Number(prev30.find((r) => r.verdict === 'confirmed')?.cnt ?? 0);
    const prevAccuracy = prevTotal > 0 ? (prevConfirmed / prevTotal) * 100 : 0;

    const improvementRate = Math.round((recentAccuracy - prevAccuracy) * 10) / 10;

    // 주요 오분류 패턴 (Top 5)
    const misclassRows = await db.select({
      predictedType: eventLabels.predictedType,
      actualType: eventLabels.actualType,
      cnt: count(),
    })
      .from(eventLabels)
      .where(eq(eventLabels.verdict, 'modified'))
      .groupBy(eventLabels.predictedType, eventLabels.actualType)
      .orderBy(desc(count()))
      .limit(5);

    const topMisclassifications: MisclassificationItem[] = misclassRows
      .filter((r) => r.actualType)
      .map((r) => ({
        predictedType: r.predictedType,
        actualType: r.actualType!,
        count: Number(r.cnt),
      }));

    // 역할별 레이블 카운트
    const roleRows = await db.select({
      role: users.role,
      cnt: count(),
    })
      .from(eventLabels)
      .leftJoin(users, eq(eventLabels.labeledBy, users.userId))
      .groupBy(users.role);

    const labelsByRole = roleRows.map((r) => ({
      role: r.role ?? 'unknown',
      count: Number(r.cnt),
    }));

    // 일별 레이블 카운트 (최근 30일)
    const dailyRows = await db.select({
      date: sql<string>`DATE(${eventLabels.labeledAt})`.as('date'),
      cnt: count(),
    })
      .from(eventLabels)
      .where(gte(eventLabels.labeledAt, since30d))
      .groupBy(sql`DATE(${eventLabels.labeledAt})`)
      .orderBy(sql`DATE(${eventLabels.labeledAt})`);

    const dailyLabelCounts: DailyLabelCount[] = dailyRows.map((r) => ({
      date: String(r.date),
      count: Number(r.cnt),
    }));

    const stats: SovereignAiStats = {
      totalLabels,
      confirmedCount,
      falsePositiveCount,
      modifiedCount,
      missedCount,
      accuracyRate,
      improvementRate,
      topMisclassifications,
      labelsByRole,
      dailyLabelCounts,
      regionName: '대한민국',
    };

    res.json({ success: true, data: stats });
  } catch (error) {
    logger.error({ error }, 'Sovereign AI stats query failed');
    next(error);
  }
});

// ===========================
// 동물별 이벤트 목록 (레이블 가능)
// GET /api/label-chat/events/:animalId
// ===========================

labelChatRouter.get('/events/:animalId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const db = getDb();
    const animalId = req.params.animalId as string;

    const since7d = new Date();
    since7d.setDate(since7d.getDate() - 7);

    const events = await db.select({
      eventId: smaxtecEvents.eventId,
      eventType: smaxtecEvents.eventType,
      externalEventId: smaxtecEvents.externalEventId,
      severity: smaxtecEvents.severity,
      detectedAt: smaxtecEvents.detectedAt,
      acknowledged: smaxtecEvents.acknowledged,
      farmId: smaxtecEvents.farmId,
    })
      .from(smaxtecEvents)
      .where(
        and(
          eq(smaxtecEvents.animalId, animalId),
          gte(smaxtecEvents.detectedAt, since7d),
        ),
      )
      .orderBy(desc(smaxtecEvents.detectedAt))
      .limit(20);

    // 어떤 이벤트에 레이블이 있는지 확인
    const eventIds = events.map((e) => e.eventId);
    const labeledEventIds = new Set<string>();

    if (eventIds.length > 0) {
      const labelRows = await db.select({
        eventId: eventLabels.eventId,
      })
        .from(eventLabels)
        .where(inArray(eventLabels.eventId, eventIds));

      for (const l of labelRows) {
        labeledEventIds.add(l.eventId);
      }
    }

    const result = events.map((e) => ({
      eventId: e.eventId,
      eventType: e.eventType,
      smaxtecOriginalType: e.externalEventId ?? e.eventType,
      severity: e.severity,
      detectedAt: e.detectedAt.toISOString(),
      acknowledged: e.acknowledged,
      farmId: e.farmId,
      hasLabel: labeledEventIds.has(e.eventId),
    }));

    res.json({ success: true, data: result });
  } catch (error) {
    logger.error({ error }, 'Animal events query failed');
    next(error);
  }
});

// ===========================
// 동물 기본 정보 (이벤트 없는 소도 레이블링 가능하도록)
// GET /api/label-chat/animal-info/:animalId
// ===========================

labelChatRouter.get('/animal-info/:animalId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const db = getDb();
    const animalId = req.params.animalId as string;

    const [animal] = await db.select({
      animalId: animals.animalId,
      earTag: animals.earTag,
      name: animals.name,
      breed: animals.breed,
      sex: animals.sex,
      farmId: animals.farmId,
      farmName: farms.name,
      status: animals.status,
      parity: animals.parity,
      daysInMilk: animals.daysInMilk,
      lactationStatus: animals.lactationStatus,
      birthDate: animals.birthDate,
    })
      .from(animals)
      .leftJoin(farms, eq(animals.farmId, farms.farmId))
      .where(eq(animals.animalId, animalId))
      .limit(1);

    if (!animal) {
      res.status(404).json({ success: false, error: 'Animal not found' });
      return;
    }

    res.json({ success: true, data: animal });
  } catch (error) {
    logger.error({ error }, 'Animal info query failed');
    next(error);
  }
});

// ===========================
// 예후 기록 등록
// POST /api/label-chat/follow-up
// 진단/처방 후 D+3, D+7, D+14 등 시점별 예후 추적
// → 소버린 AI가 "진단→처방→결과" 인과관계를 학습
// ===========================

labelChatRouter.post('/follow-up', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const db = getDb();
    const {
      labelId,
      eventId,
      animalId,
      status,
      clinicalNotes,
      temperature,
      appetite,
      mobility,
      milkYieldChange,
      additionalTreatment,
      treatmentChanged,
      conversationSummary,
    } = req.body;

    if (!labelId || !eventId || !animalId || !status) {
      res.status(400).json({ success: false, error: 'labelId, eventId, animalId, status are required' });
      return;
    }

    // 최초 레이블 시점 계산 → daysSinceLabel
    const [label] = await db.select({
      labeledAt: eventLabels.labeledAt,
    })
      .from(eventLabels)
      .where(eq(eventLabels.labelId, labelId));

    if (!label) {
      res.status(404).json({ success: false, error: 'Label not found' });
      return;
    }

    const labelDate = new Date(label.labeledAt);
    const now = new Date();
    const daysSinceLabel = Math.round((now.getTime() - labelDate.getTime()) / 86_400_000);

    const userId = (req as unknown as { user?: { userId: string } }).user?.userId ?? null;

    const result = await db.insert(labelFollowUps).values({
      labelId,
      eventId,
      animalId,
      daysSinceLabel,
      followUpDate: now,
      status,
      clinicalNotes: clinicalNotes ?? null,
      temperature: temperature ?? null,
      appetite: appetite ?? null,
      mobility: mobility ?? null,
      milkYieldChange: milkYieldChange ?? null,
      additionalTreatment: additionalTreatment ?? null,
      treatmentChanged: treatmentChanged ?? false,
      conversationSummary: conversationSummary ?? null,
      recordedBy: userId,
    }).returning();

    logger.info({ labelId, animalId, daysSinceLabel, status }, 'Follow-up recorded');
    res.json({ success: true, data: result[0] ?? null });
  } catch (error) {
    logger.error({ error }, 'Follow-up submission failed');
    next(error);
  }
});

// ===========================
// 레이블 예후 이력 조회
// GET /api/label-chat/follow-ups/:labelId
// ===========================

labelChatRouter.get('/follow-ups/:labelId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const db = getDb();
    const labelId = req.params.labelId as string;

    const followUps = await db.select({
      followUpId: labelFollowUps.followUpId,
      daysSinceLabel: labelFollowUps.daysSinceLabel,
      followUpDate: labelFollowUps.followUpDate,
      status: labelFollowUps.status,
      clinicalNotes: labelFollowUps.clinicalNotes,
      temperature: labelFollowUps.temperature,
      appetite: labelFollowUps.appetite,
      mobility: labelFollowUps.mobility,
      milkYieldChange: labelFollowUps.milkYieldChange,
      additionalTreatment: labelFollowUps.additionalTreatment,
      treatmentChanged: labelFollowUps.treatmentChanged,
      createdAt: labelFollowUps.createdAt,
    })
      .from(labelFollowUps)
      .where(eq(labelFollowUps.labelId, labelId))
      .orderBy(labelFollowUps.followUpDate);

    const result = followUps.map((f) => ({
      followUpId: f.followUpId,
      daysSinceLabel: f.daysSinceLabel,
      followUpDate: f.followUpDate?.toISOString() ?? '',
      status: f.status,
      clinicalNotes: f.clinicalNotes,
      temperature: f.temperature,
      appetite: f.appetite,
      mobility: f.mobility,
      milkYieldChange: f.milkYieldChange,
      additionalTreatment: f.additionalTreatment,
      treatmentChanged: f.treatmentChanged,
      createdAt: f.createdAt?.toISOString() ?? '',
    }));

    res.json({ success: true, data: result });
  } catch (error) {
    logger.error({ error }, 'Follow-ups query failed');
    next(error);
  }
});

// ===========================
// 특정 이벤트의 레이블 + 예후 전체 이력 조회
// GET /api/label-chat/label-history/:eventId
// → 레이블 + 모든 follow-up을 시간순으로 반환
// ===========================

labelChatRouter.get('/label-history/:eventId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const db = getDb();
    const eventId = req.params.eventId as string;

    // 레이블 조회
    const labels = await db.select({
      labelId: eventLabels.labelId,
      verdict: eventLabels.verdict,
      actualDiagnosis: eventLabels.actualDiagnosis,
      actionTaken: eventLabels.actionTaken,
      outcome: eventLabels.outcome,
      notes: eventLabels.notes,
      labeledAt: eventLabels.labeledAt,
    })
      .from(eventLabels)
      .where(eq(eventLabels.eventId, eventId))
      .orderBy(desc(eventLabels.labeledAt));

    // 각 레이블의 follow-up 조회
    const labelIds = labels.map((l) => l.labelId);
    let followUps: {
      followUpId: string;
      labelId: string;
      daysSinceLabel: number;
      followUpDate: Date | null;
      status: string;
      clinicalNotes: string | null;
      temperature: number | null;
      appetite: string | null;
      mobility: string | null;
      milkYieldChange: string | null;
      additionalTreatment: string | null;
      treatmentChanged: boolean;
    }[] = [];

    if (labelIds.length > 0) {
      followUps = await db.select({
        followUpId: labelFollowUps.followUpId,
        labelId: labelFollowUps.labelId,
        daysSinceLabel: labelFollowUps.daysSinceLabel,
        followUpDate: labelFollowUps.followUpDate,
        status: labelFollowUps.status,
        clinicalNotes: labelFollowUps.clinicalNotes,
        temperature: labelFollowUps.temperature,
        appetite: labelFollowUps.appetite,
        mobility: labelFollowUps.mobility,
        milkYieldChange: labelFollowUps.milkYieldChange,
        additionalTreatment: labelFollowUps.additionalTreatment,
        treatmentChanged: labelFollowUps.treatmentChanged,
      })
        .from(labelFollowUps)
        .where(inArray(labelFollowUps.labelId, labelIds))
        .orderBy(labelFollowUps.followUpDate);
    }

    const followUpMap = new Map<string, typeof followUps>();
    for (const fu of followUps) {
      const existing = followUpMap.get(fu.labelId) ?? [];
      existing.push(fu);
      followUpMap.set(fu.labelId, existing);
    }

    const result = labels.map((l) => ({
      labelId: l.labelId,
      verdict: l.verdict,
      actualDiagnosis: l.actualDiagnosis,
      actionTaken: l.actionTaken,
      outcome: l.outcome,
      notes: l.notes,
      labeledAt: l.labeledAt?.toISOString() ?? '',
      followUps: (followUpMap.get(l.labelId) ?? []).map((f) => ({
        followUpId: f.followUpId,
        daysSinceLabel: f.daysSinceLabel,
        followUpDate: f.followUpDate?.toISOString() ?? '',
        status: f.status,
        clinicalNotes: f.clinicalNotes,
        temperature: f.temperature,
        appetite: f.appetite,
        mobility: f.mobility,
        milkYieldChange: f.milkYieldChange,
        additionalTreatment: f.additionalTreatment,
        treatmentChanged: f.treatmentChanged,
      })),
    }));

    res.json({ success: true, data: result });
  } catch (error) {
    logger.error({ error }, 'Label history query failed');
    next(error);
  }
});

// ===========================
// 임상 관찰 기록 등록
// POST /api/label-chat/observation
// 이벤트 유무와 관계없이 모든 소에 대한 수동 관찰 기록
// 분만, 수정, 치료, 일반 관찰 등 → 소버린 AI 학습 자료
// ===========================

labelChatRouter.post('/observation', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const db = getDb();
    const {
      animalId,
      farmId,
      observationType,
      description,
      temperature,
      bodyConditionScore,
      weight,
      medication,
      dosage,
      treatmentDuration,
      breedingInfo,
      calvingInfo,
      conversationSummary,
    } = req.body as {
      animalId: string;
      farmId: string;
      observationType: string;
      description: string;
      temperature?: number;
      bodyConditionScore?: number;
      weight?: number;
      medication?: string;
      dosage?: string;
      treatmentDuration?: string;
      breedingInfo?: string;
      calvingInfo?: string;
      conversationSummary?: string;
    };

    if (!animalId || !farmId || !observationType || !description) {
      res.status(400).json({ success: false, error: 'animalId, farmId, observationType, description required' });
      return;
    }

    const userId = (req as unknown as { user?: { userId: string } }).user?.userId ?? null;

    const [observation] = await db.insert(clinicalObservations).values({
      animalId,
      farmId,
      observationType,
      description,
      temperature: temperature ?? null,
      bodyConditionScore: bodyConditionScore ?? null,
      weight: weight ?? null,
      medication: medication ?? null,
      dosage: dosage ?? null,
      treatmentDuration: treatmentDuration ?? null,
      breedingInfo: breedingInfo ?? null,
      calvingInfo: calvingInfo ?? null,
      conversationSummary: conversationSummary ?? null,
      recordedBy: userId,
    }).returning();

    logger.info({
      observationId: observation!.observationId,
      animalId,
      observationType,
    }, 'Clinical observation recorded — Sovereign AI learning data');

    res.json({ success: true, data: observation });
  } catch (error) {
    logger.error({ error }, 'Clinical observation submit failed');
    next(error);
  }
});

// ===========================
// 동물의 임상 관찰 기록 조회
// GET /api/label-chat/observations/:animalId
// ===========================

labelChatRouter.get('/observations/:animalId', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const db = getDb();
    const animalId = _req.params.animalId as string;

    const observations = await db.select({
      observationId: clinicalObservations.observationId,
      observationType: clinicalObservations.observationType,
      description: clinicalObservations.description,
      temperature: clinicalObservations.temperature,
      bodyConditionScore: clinicalObservations.bodyConditionScore,
      weight: clinicalObservations.weight,
      medication: clinicalObservations.medication,
      observedAt: clinicalObservations.observedAt,
      breedingInfo: clinicalObservations.breedingInfo,
      calvingInfo: clinicalObservations.calvingInfo,
    })
      .from(clinicalObservations)
      .where(eq(clinicalObservations.animalId, animalId))
      .orderBy(desc(clinicalObservations.observedAt))
      .limit(30);

    const result = observations.map((o) => ({
      ...o,
      observedAt: o.observedAt?.toISOString() ?? '',
    }));

    res.json({ success: true, data: result });
  } catch (error) {
    logger.error({ error }, 'Clinical observations query failed');
    next(error);
  }
});

// ===========================
// 대화 세션 저장/조회
// POST /api/label-chat/session
// ===========================

labelChatRouter.post('/session', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const db = getDb();
    const body = req.body as {
      animalId: string;
      farmId: string;
      eventId?: string;
      messages: readonly { role: string; content: string; timestamp: string }[];
    };

    const userId = req.user?.userId;
    if (!userId) { res.status(401).json({ success: false, error: 'Unauthorized' }); return; }

    // 기존 active 세션이 있으면 업데이트, 없으면 생성
    const existing = await db.select({ sessionId: chatSessions.sessionId })
      .from(chatSessions)
      .where(and(
        eq(chatSessions.animalId, body.animalId),
        eq(chatSessions.userId, userId),
        eq(chatSessions.status, 'active'),
      ))
      .limit(1);

    if (existing.length > 0) {
      await db.update(chatSessions)
        .set({ messages: body.messages as unknown as [] })
        .where(eq(chatSessions.sessionId, existing[0]!.sessionId));

      res.json({ success: true, data: { sessionId: existing[0]!.sessionId, updated: true } });
    } else {
      const [created] = await db.insert(chatSessions).values({
        animalId: body.animalId,
        farmId: body.farmId,
        userId,
        messages: body.messages as unknown as [],
        eventId: body.eventId ?? null,
      }).returning({ sessionId: chatSessions.sessionId });

      res.json({ success: true, data: { sessionId: created!.sessionId, updated: false } });
    }
  } catch (error) {
    logger.error({ error }, 'Chat session save failed');
    next(error);
  }
});

// ===========================
// 대화 세션 조회 (활성 세션)
// GET /api/label-chat/session/:animalId
// ===========================

labelChatRouter.get('/session/:animalId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const db = getDb();
    const animalId = req.params.animalId as string;
    const userId = req.user?.userId;
    if (!userId) { res.status(401).json({ success: false, error: 'Unauthorized' }); return; }

    const sessions = await db.select()
      .from(chatSessions)
      .where(and(
        eq(chatSessions.animalId, animalId),
        eq(chatSessions.userId, userId),
        eq(chatSessions.status, 'active'),
      ))
      .orderBy(desc(chatSessions.createdAt))
      .limit(1);

    res.json({ success: true, data: sessions[0] ?? null });
  } catch (error) {
    logger.error({ error }, 'Chat session query failed');
    next(error);
  }
});

// ===========================
// 대화에서 추출된 기록 저장 (사용자 확인 후)
// POST /api/label-chat/save-conversation-record
// ===========================

labelChatRouter.post('/save-conversation-record', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const db = getDb();
    const body = req.body as {
      animalId: string;
      farmId: string;
      sessionId?: string;
      record: ExtractedRecord;
      conversationSummary: string;
    };

    const userId = req.user?.userId;

    // ExtractedRecord → clinicalObservations 변환
    const sd = body.record.structuredData;
    const obsData: Record<string, unknown> = {
      animalId: body.animalId,
      farmId: body.farmId,
      observationType: body.record.eventType,
      description: body.record.summary,
      conversationSummary: body.conversationSummary,
      recordedBy: userId ?? null,
    };

    // 이벤트 유형별 필드 매핑
    if (sd.type === 'insemination') {
      obsData.breedingInfo = JSON.stringify(sd.data);
    } else if (sd.type === 'calving') {
      obsData.calvingInfo = JSON.stringify(sd.data);
    } else if (sd.type === 'treatment' || sd.type === 'mastitis') {
      obsData.medication = sd.data.medication ?? null;
      if ('dosage' in sd.data) obsData.dosage = sd.data.dosage ?? null;
      if ('duration' in sd.data) obsData.treatmentDuration = sd.data.duration ?? null;
    } else if (sd.type === 'vaccination') {
      obsData.medication = sd.data.vaccineType ?? null;
    }

    // 임상 지표 (있으면)
    if ('temperature' in sd.data && sd.data.temperature != null) {
      obsData.temperature = sd.data.temperature;
    }
    if ('bodyConditionScore' in sd.data && sd.data.bodyConditionScore != null) {
      obsData.bodyConditionScore = sd.data.bodyConditionScore;
    }
    if ('weight' in sd.data && sd.data.weight != null) {
      obsData.weight = sd.data.weight;
    }

    const [created] = await db.insert(clinicalObservations)
      .values(obsData as typeof clinicalObservations.$inferInsert)
      .returning({ observationId: clinicalObservations.observationId });

    // 세션에 추출된 기록 ID 연결
    if (body.sessionId && created) {
      const session = await db.select({ extractedRecordIds: chatSessions.extractedRecordIds })
        .from(chatSessions)
        .where(eq(chatSessions.sessionId, body.sessionId))
        .limit(1);

      if (session[0]) {
        const ids = [...(session[0].extractedRecordIds as string[]), created.observationId];
        await db.update(chatSessions)
          .set({ extractedRecordIds: ids })
          .where(eq(chatSessions.sessionId, body.sessionId));
      }
    }

    logger.info(
      { animalId: body.animalId, eventType: body.record.eventType, observationId: created?.observationId },
      'Conversation record saved (sovereign AI learning)',
    );

    res.json({ success: true, data: { observationId: created?.observationId } });
  } catch (error) {
    logger.error({ error }, 'Conversation record save failed');
    next(error);
  }
});
