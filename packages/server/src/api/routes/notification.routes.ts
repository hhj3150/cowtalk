// 알림 설정 라우트 — 실제 DB 쿼리

import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import { authenticate } from '../middleware/auth.js';
import { getDb } from '../../config/database.js';
import { notificationPreferences, userFarmAccess, alerts, farms } from '../../db/schema.js';
import { eq, inArray, desc } from 'drizzle-orm';
import { addSubscription, removeSubscription, sendPushToFarm, getSubscriptionCount } from '../../realtime/push-service.js';
import { config } from '../../config/index.js';

export const notificationRouter = Router();

notificationRouter.use(authenticate);

// GET /notifications/recent — 최근 알림 (NotificationDrawer가 사용)
// 농장 권한이 있으면 그 농장들로 한정, 광역 역할(방역관·행정관)은 전체.
notificationRouter.get('/recent', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const db = getDb();
    const userId = req.user!.userId;
    const role = req.user!.role;
    const limit = Math.min(Number(req.query.limit) || 30, 100);

    const farmRows = await db
      .select({ farmId: userFarmAccess.farmId })
      .from(userFarmAccess)
      .where(eq(userFarmAccess.userId, userId));
    const farmIds = farmRows.map((r) => r.farmId);

    const isWideRole = role === 'quarantine_officer' || role === 'government_admin';
    if (!isWideRole && farmIds.length === 0) {
      res.json({ success: true, data: [] });
      return;
    }
    const rows = await db
      .select({
        id: alerts.alertId,
        type: alerts.alertType,
        title: alerts.title,
        message: alerts.explanation,
        severity: alerts.priority,
        status: alerts.status,
        createdAt: alerts.createdAt,
        animalId: alerts.animalId,
        farmId: alerts.farmId,
      })
      .from(alerts)
      .where(isWideRole ? undefined : inArray(alerts.farmId, farmIds))
      .orderBy(desc(alerts.createdAt))
      .limit(limit);

    res.json({
      success: true,
      data: rows.map((r) => ({
        id: r.id,
        type: r.type,
        title: r.title,
        message: r.message,
        severity: r.severity,
        createdAt: r.createdAt,
        read: r.status !== 'new',
        animalId: r.animalId ?? undefined,
        farmId: r.farmId,
      })),
    });
  } catch (error) {
    next(error);
  }
});

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

// POST /notifications/test — 테스트 알림 발송 (실 채널 연동)
notificationRouter.post('/test', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.userId;
    const { channel, templateId } = req.body as { channel: string; templateId?: string };
    const sentAt = new Date().toISOString();

    if (channel === 'push') {
      // 사용자 소속 첫 농장 룸으로 웹푸시 발송
      const firstFarmId = req.user!.farmIds?.[0];
      if (!firstFarmId) {
        res.json({ success: false, data: { userId, channel, sentAt, success: false, message: '푸시 테스트 대상 농장이 없습니다 (farmIds 비어 있음).' } });
        return;
      }
      const sent = await sendPushToFarm(firstFarmId, {
        title: '🔔 CowTalk 테스트 알림',
        body: `템플릿 ${templateId ?? 'default'} 푸시 테스트입니다.`,
        severity: 'low',
        farmId: firstFarmId,
        url: '/notifications',
      });
      res.json({ success: true, data: { userId, channel, templateId, sentAt, success: sent > 0, message: sent > 0 ? `푸시 ${String(sent)}건 발송` : '활성 푸시 구독이 없습니다.' } });
      return;
    }

    if (channel === 'kakao') {
      // 사용자 첫 농장의 등록 전화(farms.phone)로 알림톡 발송 (키 미설정 시 lib 내부 테스트모드 자동 전환)
      const kakaoFarmId = req.user!.farmIds?.[0];
      if (!kakaoFarmId) {
        res.json({ success: false, data: { userId, channel, sentAt, success: false, message: '알림톡 테스트 대상 농장이 없습니다 (farmIds 비어 있음).' } });
        return;
      }
      const db = getDb();
      const [farm] = await db.select({ phone: farms.phone }).from(farms).where(eq(farms.farmId, kakaoFarmId)).limit(1);
      if (!farm?.phone) {
        res.json({ success: false, data: { userId, channel, sentAt, success: false, message: '농장에 전화번호가 등록되어 있지 않습니다.' } });
        return;
      }
      const result = await sendAlimtalk({
        to: farm.phone,
        templateId: (templateId as AlimtalkTemplateId | undefined) ?? 'DISEASE_SUSPECTED',
        variables: { farmName: 'CowTalk', earTag: 'TEST', symptom: '테스트 발송', confidence: '0' },
      });
      res.json({ success: true, data: { userId, channel, templateId, sentAt, success: result.success, message: result.testMode ? '알림톡 테스트모드 발송 (실발송 아님)' : `알림톡 발송 완료 (${result.messageId ?? ''})` } });
      return;
    }

    // email 등 미지원 채널 — 가짜 성공 응답 금지
    res.json({ success: false, data: { userId, channel, sentAt, success: false, message: `${String(channel)} 채널은 아직 연동되지 않았습니다.` } });
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

// ===========================
// 카카오 알림톡 API
// ===========================

import {
  sendAlimtalk,
  notifyEstrus,
  notifyCalvingImminent,
  notifyDiseaseSuspected,
  type AlimtalkTemplateId,
} from '../../lib/kakao-alimtalk.js';

// POST /notifications/alimtalk/test — 알림톡 테스트 발송
notificationRouter.post('/alimtalk/test', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { phone, templateId, variables } = req.body as {
      phone: string;
      templateId: AlimtalkTemplateId;
      variables: Record<string, string>;
    };

    if (!phone || !templateId) {
      res.status(400).json({ success: false, error: 'phone, templateId 필수' });
      return;
    }

    const result = await sendAlimtalk({ to: phone, templateId, variables: variables ?? {} });
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
});

// POST /notifications/alimtalk/estrus — 발정 알림 발송 (수정사·농장주)
notificationRouter.post('/alimtalk/estrus', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { phone, farmName, earTag, detectedAt, optimalTime } = req.body as {
      phone: string;
      farmName: string;
      earTag: string;
      detectedAt: string;
      optimalTime: string;
    };

    if (!phone || !farmName || !earTag) {
      res.status(400).json({ success: false, error: 'phone, farmName, earTag 필수' });
      return;
    }

    const result = await notifyEstrus({ phone, farmName, earTag, detectedAt, optimalTime });
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
});

// POST /notifications/alimtalk/calving — 분만 임박 알림
notificationRouter.post('/alimtalk/calving', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { phone, farmName, earTag, parity, calvingDate } = req.body as {
      phone: string;
      farmName: string;
      earTag: string;
      parity: number;
      calvingDate: string;
    };

    const result = await notifyCalvingImminent({ phone, farmName, earTag, parity: parity ?? 1, calvingDate });
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
});

// POST /notifications/alimtalk/disease — 질병 의심 알림
notificationRouter.post('/alimtalk/disease', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { phone, farmName, earTag, symptom, confidence } = req.body as {
      phone: string;
      farmName: string;
      earTag: string;
      symptom: string;
      confidence: number;
    };

    const result = await notifyDiseaseSuspected({
      phone, farmName, earTag, symptom, confidence: confidence ?? 80,
    });
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
});

// GET /notifications/alimtalk/status — 알림톡 연동 상태 조회
notificationRouter.get('/alimtalk/status', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const { config: cfg } = await import('../../config/index.js');
    res.json({
      success: true,
      data: {
        testMode: cfg.KAKAO_ALIMTALK_TEST_MODE,
        configured: !!(cfg.KAKAO_ALIMTALK_API_KEY && cfg.KAKAO_ALIMTALK_PFID),
        templates: [
          'ESTRUS_ALERT', 'INSEMINATION_TIMING', 'PREGNANCY_CHECK_DUE',
          'CALVING_IMMINENT', 'DISEASE_SUSPECTED', 'QUARANTINE_ALERT',
        ],
        provider: 'Solapi (솔라피)',
        channelName: 'CowTalk 공식채널',
        approvalStatus: cfg.KAKAO_ALIMTALK_PFID ? 'ready' : 'pending_registration',
      },
    });
  } catch (error) {
    next(error);
  }
});
