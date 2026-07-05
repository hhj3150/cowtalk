// 알림 전송 — 채널별 분기
// in_app: alerts 테이블 저장 + Socket.IO 실시간 push (완결)
// push: Web Push (VAPID) — critical/high만
// SMS/이메일은 Phase 5+에서 추가

import type { AlertCandidate, Severity } from '@cowtalk/shared';
import { getDb } from '../../config/database.js';
import { alerts } from '../../db/schema.js';
import { and, eq, sql } from 'drizzle-orm';
import { getIO } from '../../realtime/socket-server.js';
import { sendPushToFarm } from '../../realtime/push-service.js';
import { logger } from '../../lib/logger.js';

export type NotificationChannel = 'in_app' | 'push' | 'email' | 'sms';

export interface NotificationResult {
  readonly alertDedupKey: string;
  readonly channels: readonly NotificationChannel[];
  readonly success: boolean;
  readonly alertId?: string;
  readonly deduplicated?: boolean;
}

// 심각도별 채널 매핑 (email/sms는 Phase 5+ — 현재 실제 발송 채널은 in_app/push)
const SEVERITY_CHANNELS: Readonly<Record<Severity, readonly NotificationChannel[]>> = {
  critical: ['in_app', 'push'],
  high: ['in_app', 'push'],
  medium: ['in_app'],
  low: ['in_app'],
} as const;

export function getChannelsForSeverity(severity: Severity): readonly NotificationChannel[] {
  return SEVERITY_CHANNELS[severity];
}

const ALERT_TYPE_TITLES: Readonly<Record<string, string>> = {
  health_risk: '건강 위험 감지',
  herd_anomaly: '우군 이상 징후',
  temperature_warning: '체온 이상',
  rumination_warning: '반추 저하',
  epidemic_risk: '전염병 확산 위험',
};

/** AlertCandidate → alerts 테이블 insert 값 매핑 */
function toAlertRow(alert: AlertCandidate): typeof alerts.$inferInsert {
  const title = ALERT_TYPE_TITLES[alert.type] ?? alert.message.slice(0, 100);
  return {
    alertType: alert.type.slice(0, 30),
    engineType: alert.source,
    animalId: alert.animalId,
    farmId: alert.farmId,
    priority: alert.severity,
    status: 'new',
    title: title.slice(0, 300),
    explanation: alert.message,
    recommendedAction: '', // AI 해석의 roleSpecific 액션은 개체 상세에서 제공
    dedupKey: alert.dedupKey.slice(0, 200),
  };
}

/**
 * 알림 실전송 — 저장(in_app) + 실시간(Socket.IO) + Web Push.
 * farmId가 없는 후보(집계 미완성)는 저장 불가 → 로그만 남기고 실패 처리하지 않는다.
 * 개별 채널 실패는 비치명적 — in_app 저장 성공이 최소 성공 조건.
 */
export async function sendNotification(
  alert: AlertCandidate,
): Promise<NotificationResult> {
  const channels = getChannelsForSeverity(alert.severity);

  if (!alert.farmId) {
    logger.warn({ type: alert.type, animalId: alert.animalId }, '[Notify] farmId 없음 — 저장 생략');
    return { alertDedupKey: alert.dedupKey, channels, success: false };
  }

  // 1) in_app — alerts 테이블 저장 (동일 dedupKey의 미확인 알림이 있으면 중복 생성 안 함)
  let alertId: string | undefined;
  let deduplicated = false;
  try {
    const db = getDb();
    const [dup] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(alerts)
      .where(and(eq(alerts.dedupKey, alert.dedupKey), eq(alerts.status, 'new')));
    if ((dup?.count ?? 0) > 0) {
      deduplicated = true;
    } else {
      const [inserted] = await db.insert(alerts).values(toAlertRow(alert))
        .returning({ alertId: alerts.alertId });
      alertId = inserted?.alertId;
    }
  } catch (err) {
    logger.error({ err, dedupKey: alert.dedupKey }, '[Notify] alerts 저장 실패');
    return { alertDedupKey: alert.dedupKey, channels, success: false };
  }

  if (deduplicated) {
    return { alertDedupKey: alert.dedupKey, channels, success: true, deduplicated };
  }

  // 2) Socket.IO 실시간 push — 농장 room + 관리자 전체 room
  try {
    const io = getIO();
    if (io && alertId) {
      const payload = {
        alertId,
        alertType: alert.type,
        farmId: alert.farmId,
        animalId: alert.animalId,
        priority: alert.severity,
        title: ALERT_TYPE_TITLES[alert.type] ?? alert.message.slice(0, 100),
        explanation: alert.message,
        createdAt: new Date().toISOString(),
      };
      io.to(`farm:${alert.farmId}`).emit('alert:new', payload);
      io.to('alarms:all').emit('alert:new', payload);
    }
  } catch (err) {
    logger.warn({ err, alertId }, '[Notify] Socket.IO push 실패 (비치명적)');
  }

  // 3) Web Push — critical/high만 (VAPID 미설정이면 내부에서 0건 반환)
  if (channels.includes('push')) {
    try {
      await sendPushToFarm(alert.farmId, {
        title: ALERT_TYPE_TITLES[alert.type] ?? '팅커벨 알림',
        body: alert.message.slice(0, 200),
        severity: alert.severity,
        farmId: alert.farmId,
        tag: alert.dedupKey,
        url: alert.animalId ? `/animals/${alert.animalId}` : `/farms/${alert.farmId}`,
      });
    } catch (err) {
      logger.warn({ err, farmId: alert.farmId }, '[Notify] Web Push 실패 (비치명적)');
    }
  }

  logger.info({
    type: alert.type,
    severity: alert.severity,
    animalId: alert.animalId,
    farmId: alert.farmId,
    alertId,
    channels,
  }, 'Notification dispatched');

  return { alertDedupKey: alert.dedupKey, channels, success: true, alertId };
}

export async function sendBatchNotifications(
  alerts: readonly AlertCandidate[],
): Promise<readonly NotificationResult[]> {
  const results: NotificationResult[] = [];
  for (const alert of alerts) {
    const result = await sendNotification(alert);
    results.push(result);
  }
  return results;
}
