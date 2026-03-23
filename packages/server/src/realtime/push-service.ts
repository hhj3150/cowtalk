// Web Push 서비스 — VAPID 기반 브라우저 푸시 알림
// Critical/High severity 알림만 푸시

import webpush from 'web-push';
import { config } from '../config/index.js';
import { logger } from '../lib/logger.js';

// ── VAPID 설정 ──

if (config.VAPID_PUBLIC_KEY && config.VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(
    config.VAPID_EMAIL,
    config.VAPID_PUBLIC_KEY,
    config.VAPID_PRIVATE_KEY,
  );
  logger.info('[Push] VAPID configured');
} else {
  logger.warn('[Push] VAPID keys not configured — push disabled');
}

// ── 구독 관리 (인메모리 — 추후 DB 이관) ──

interface PushSubscription {
  readonly endpoint: string;
  readonly keys: {
    readonly p256dh: string;
    readonly auth: string;
  };
}

interface SubscriptionEntry {
  readonly userId: string;
  readonly subscription: PushSubscription;
  readonly farmIds: readonly string[];
  readonly minSeverity: 'critical' | 'high' | 'medium' | 'low';
}

const subscriptions = new Map<string, SubscriptionEntry>();

export function addSubscription(
  userId: string,
  subscription: PushSubscription,
  farmIds: readonly string[],
  minSeverity: SubscriptionEntry['minSeverity'] = 'high',
): void {
  subscriptions.set(subscription.endpoint, { userId, subscription, farmIds, minSeverity });
  logger.info({ userId, endpoint: subscription.endpoint.slice(-20) }, '[Push] Subscription added');
}

export function removeSubscription(endpoint: string): void {
  subscriptions.delete(endpoint);
  logger.info({ endpoint: endpoint.slice(-20) }, '[Push] Subscription removed');
}

export function getSubscriptionCount(): number {
  return subscriptions.size;
}

// ── Severity 순서 ──

const SEVERITY_ORDER: Readonly<Record<string, number>> = {
  critical: 4,
  high: 3,
  medium: 2,
  low: 1,
};

// ── 알림 전송 ──

interface PushPayload {
  readonly title: string;
  readonly body: string;
  readonly icon?: string;
  readonly tag?: string;
  readonly url?: string;
  readonly severity: string;
  readonly farmId?: string;
}

export async function sendPushToFarm(farmId: string, payload: PushPayload): Promise<number> {
  if (!config.VAPID_PUBLIC_KEY || !config.VAPID_PRIVATE_KEY) return 0;

  const payloadSeverity = SEVERITY_ORDER[payload.severity] ?? 0;
  let sentCount = 0;

  const targets = Array.from(subscriptions.values()).filter((entry) => {
    // farmId 필터: 빈 배열이면 전체 구독
    if (entry.farmIds.length > 0 && !entry.farmIds.includes(farmId)) return false;
    // severity 필터
    const minLevel = SEVERITY_ORDER[entry.minSeverity] ?? 0;
    return payloadSeverity >= minLevel;
  });

  const pushData = JSON.stringify({
    title: payload.title,
    body: payload.body,
    icon: payload.icon ?? '/icons/icon-192.png',
    tag: payload.tag ?? `alarm-${farmId}-${Date.now()}`,
    data: { url: payload.url ?? '/', farmId },
  });

  const sendPromises = targets.map(async (entry) => {
    try {
      await webpush.sendNotification(entry.subscription as webpush.PushSubscription, pushData);
      sentCount++;
    } catch (err: unknown) {
      const statusCode = (err as { statusCode?: number }).statusCode;
      if (statusCode === 410 || statusCode === 404) {
        // 구독 만료 — 자동 제거
        subscriptions.delete(entry.subscription.endpoint);
        logger.debug({ endpoint: entry.subscription.endpoint.slice(-20) }, '[Push] Expired subscription removed');
      } else {
        logger.warn({ err, endpoint: entry.subscription.endpoint.slice(-20) }, '[Push] Send failed');
      }
    }
  });

  await Promise.allSettled(sendPromises);

  if (sentCount > 0) {
    logger.info({ farmId, sentCount, severity: payload.severity }, '[Push] Notifications sent');
  }

  return sentCount;
}
