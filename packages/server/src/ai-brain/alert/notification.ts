// 알림 전송 — 채널별 분기
// Phase 4에서는 인앱(DB) 저장만 구현
// SMS/이메일은 Phase 5+에서 추가

import type { AlertCandidate, Severity } from '@cowtalk/shared';
import { logger } from '../../lib/logger.js';

export type NotificationChannel = 'in_app' | 'email' | 'sms';

export interface NotificationResult {
  readonly alertDedupKey: string;
  readonly channels: readonly NotificationChannel[];
  readonly success: boolean;
}

// 심각도별 채널 매핑
const SEVERITY_CHANNELS: Readonly<Record<Severity, readonly NotificationChannel[]>> = {
  critical: ['in_app', 'email', 'sms'],
  high: ['in_app', 'email'],
  medium: ['in_app'],
  low: ['in_app'],
} as const;

export function getChannelsForSeverity(severity: Severity): readonly NotificationChannel[] {
  return SEVERITY_CHANNELS[severity];
}

export async function sendNotification(
  alert: AlertCandidate,
): Promise<NotificationResult> {
  const channels = getChannelsForSeverity(alert.severity);

  // Phase 4: 인앱(로그)만 구현
  // TODO: DB alerts 테이블에 저장, Socket.IO 푸시
  logger.info({
    type: alert.type,
    severity: alert.severity,
    animalId: alert.animalId,
    farmId: alert.farmId,
    channels,
    message: alert.message,
  }, 'Notification dispatched');

  return {
    alertDedupKey: alert.dedupKey,
    channels,
    success: true,
  };
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
