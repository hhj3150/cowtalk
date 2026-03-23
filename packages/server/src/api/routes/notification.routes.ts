// 알림 설정 라우트 — 실제 DB 쿼리

import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import { authenticate } from '../middleware/auth.js';
import { getDb } from '../../config/database.js';
import { notificationPreferences, userFarmAccess } from '../../db/schema.js';
import { eq } from 'drizzle-orm';
import { addSubscription, removeSubscription, sendPushToFarm, getSubscriptionCount } from '../../realtime/push-service.js';
import { config } from '../../config/index.js';

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

// GET /notifications/vapid-key — VAPID public key (프론트에서 구독 시 필요)
notificationRouter.get('/vapid-key', (_req: Request, res: Response) => {
  res.json({
    success: true,
    data: { publicKey: config.VAPID_PUBLIC_KEY ?? '' },
  });
});

// POST /notifications/subscribe — 브라우저 푸시 구독 등록
notificationRouter.post('/subscribe', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.userId;
    const { subscription, minSeverity } = req.body as {
      subscription: { endpoint: string; keys: { p256dh: string; auth: string } };
      minSeverity?: string;
    };

    if (!subscription?.endpoint || !subscription?.keys?.p256dh) {
      res.status(400).json({ success: false, error: '유효한 Push 구독 정보가 필요합니다' });
      return;
    }

    // 사용자의 farmIds 조회
    const db = getDb();
    const farmAccessRows = await db
      .select({ farmId: userFarmAccess.farmId })
      .from(userFarmAccess)
      .where(eq(userFarmAccess.userId, userId));
    const farmIds = farmAccessRows.map((r) => r.farmId);

    addSubscription(userId, subscription, farmIds, (minSeverity as 'critical' | 'high') ?? 'high');

    res.json({
      success: true,
      data: { subscribed: true, subscriptionCount: getSubscriptionCount() },
    });
  } catch (error) {
    next(error);
  }
});

// POST /notifications/unsubscribe — 구독 해제
notificationRouter.post('/unsubscribe', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { endpoint } = req.body as { endpoint: string };
    if (!endpoint) {
      res.status(400).json({ success: false, error: 'endpoint가 필요합니다' });
      return;
    }

    removeSubscription(endpoint);
    res.json({ success: true, data: { unsubscribed: true } });
  } catch (error) {
    next(error);
  }
});

// POST /notifications/push-test — 푸시 알림 테스트 전송
notificationRouter.post('/push-test', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const sentCount = await sendPushToFarm('test', {
      title: '🐄 CowTalk 테스트 알림',
      body: '푸시 알림이 정상적으로 작동합니다!',
      severity: 'critical',
      url: '/',
    });

    res.json({ success: true, data: { sentCount } });
  } catch (error) {
    next(error);
  }
});
