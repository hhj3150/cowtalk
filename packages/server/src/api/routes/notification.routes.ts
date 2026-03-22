// 알림 설정 라우트 — 실제 DB 쿼리

import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import { authenticate } from '../middleware/auth.js';
import { getDb } from '../../config/database.js';
import { notificationPreferences } from '../../db/schema.js';
import { eq } from 'drizzle-orm';

export const notificationRouter = Router();

notificationRouter.use(authenticate);

// GET /notifications/preferences — 알림 설정 조회
notificationRouter.get('/preferences', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const db = getDb();
    const userId = req.user!.userId;

    const prefs = await db
      .select()
      .from(notificationPreferences)
      .where(eq(notificationPreferences.userId, userId));

    const channels = prefs.map((p) => ({
      channel: p.channel,
      isEnabled: p.isEnabled,
      alertTypes: p.alertTypes,
      minSeverity: p.minSeverity,
      quietHoursStart: p.quietHoursStart,
      quietHoursEnd: p.quietHoursEnd,
    }));

    res.json({ success: true, data: { userId, channels } });
  } catch (error) {
    next(error);
  }
});

// POST /notifications/preferences — 알림 설정 저장
notificationRouter.post('/preferences', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const db = getDb();
    const userId = req.user!.userId;
    const { channels } = req.body as {
      channels: Array<{
        channel: string;
        isEnabled: boolean;
        alertTypes: string[];
        minSeverity: string;
        quietHoursStart: string | null;
        quietHoursEnd: string | null;
      }>;
    };

    // 기존 설정 삭제 후 새로 삽입
    await db
      .delete(notificationPreferences)
      .where(eq(notificationPreferences.userId, userId));

    if (channels && channels.length > 0) {
      const values = channels.map((ch) => ({
        userId,
        channel: ch.channel,
        isEnabled: ch.isEnabled,
        alertTypes: ch.alertTypes,
        minSeverity: ch.minSeverity,
        quietHoursStart: ch.quietHoursStart,
        quietHoursEnd: ch.quietHoursEnd,
      }));

      await db.insert(notificationPreferences).values(values);
    }

    res.json({
      success: true,
      data: { userId, channels, updatedAt: new Date().toISOString() },
    });
  } catch (error) {
    next(error);
  }
});

// GET /notifications/templates — 알림 템플릿 목록 (정적 정의)
notificationRouter.get('/templates', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const templates = [
      { id: 'estrus', name: '발정 알림', channels: ['push', 'kakao'], variables: ['earTag', 'confidence'] },
      { id: 'health_warning', name: '건강 경고', channels: ['push', 'email', 'kakao'], variables: ['earTag', 'symptom', 'severity'] },
      { id: 'calving_imminent', name: '분만 임박', channels: ['push', 'kakao'], variables: ['earTag', 'expectedDate'] },
      { id: 'vaccine_overdue', name: '미접종 알림', channels: ['push', 'email'], variables: ['count', 'vaccineName'] },
      { id: 'escalation', name: '에스컬레이션', channels: ['push', 'email', 'kakao'], variables: ['farmName', 'alertTitle', 'level'] },
    ];

    res.json({ success: true, data: templates });
  } catch (error) {
    next(error);
  }
});

// POST /notifications/test — 테스트 알림 발송
notificationRouter.post('/test', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.userId;
    const { channel, templateId } = req.body;

    // TODO: 실제 알림 발송 연동 (Kakao, FCM, Email)
    const result = {
      userId,
      channel,
      templateId,
      sentAt: new Date().toISOString(),
      success: true,
      message: `테스트 알림이 ${String(channel)} 채널로 발송되었습니다.`,
    };

    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
});
