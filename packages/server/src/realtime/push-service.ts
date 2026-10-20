// Web Push 서비스 — VAPID 기반 브라우저 푸시 알림
// Critical/High severity 알림만 푸시

import webpush from 'web-push';
import { config } from '../config/index.js';
import { logger } from '../lib/logger.js';
import { getDb } from '../config/database.js';
import { pushSubscriptions, userFarmAccess } from '../db/schema.js';
import { and, eq, or, sql } from 'drizzle-orm';
import { getChannelPrefs, shouldDeliver } from '../services/notification/notification-gate.service.js';

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

// ── 구독 관리 (OPS-12: DB — push_subscriptions, 마이그레이션 0046) ──
// 예전엔 메모리 Map 이라 재시작마다 모든 구독이 사라지고 레플리카마다 따로였다.

interface PushSubscription {
  readonly endpoint: string;
  readonly keys: {
    readonly p256dh: string;
    readonly auth: string;
  };
}

type MinSeverity = 'critical' | 'high' | 'medium' | 'low';

export interface SubscriptionTarget {
  readonly userId: string;
  readonly endpoint: string;
  readonly p256dh: string;
  readonly auth: string;
  readonly minSeverity: string;
}

/**
 * 구독 등록 (같은 endpoint 는 갱신).
 * @param allFarms 농장 제한이 없는 계정(scopedFarmIds === null)일 때만 true.
 *   false 면 발송 시점의 user_farm_access 로 대상 농장을 판정한다 — 배정이 바뀌거나 회수되면 즉시 반영.
 *   (예전: 구독 시점 농장 목록이 비면 '전체 구독'으로 취급 → 미배정 계정이 모든 농장 알림을 받았다)
 */
export async function addSubscription(
  userId: string,
  subscription: PushSubscription,
  allFarms: boolean,
  minSeverity: MinSeverity = 'high',
): Promise<void> {
  const db = getDb();
  await db.insert(pushSubscriptions).values({
    endpoint: subscription.endpoint,
    userId,
    p256dh: subscription.keys.p256dh,
    auth: subscription.keys.auth,
    allFarms,
    minSeverity,
  }).onConflictDoUpdate({
    target: pushSubscriptions.endpoint,
    set: {
      userId,
      p256dh: subscription.keys.p256dh,
      auth: subscription.keys.auth,
      allFarms,
      minSeverity,
      updatedAt: new Date(),
    },
  });
  logger.info({ userId, endpoint: subscription.endpoint.slice(-20) }, '[Push] Subscription saved');
}

/** 구독 해제 — 본인 구독만 (userId 가 없으면 만료 처리용 내부 호출) */
export async function removeSubscription(endpoint: string, userId?: string): Promise<boolean> {
  const db = getDb();
  const where = userId
    ? and(eq(pushSubscriptions.endpoint, endpoint), eq(pushSubscriptions.userId, userId))
    : eq(pushSubscriptions.endpoint, endpoint);
  const rows = await db.delete(pushSubscriptions).where(where).returning({ endpoint: pushSubscriptions.endpoint });
  logger.info({ endpoint: endpoint.slice(-20), removed: rows.length }, '[Push] Subscription removed');
  return rows.length > 0;
}

export async function getSubscriptionCount(): Promise<number> {
  const [row] = await getDb().select({ n: sql<number>`count(*)::int` }).from(pushSubscriptions);
  return Number(row?.n ?? 0);
}

/** 이 농장 알림을 받을 구독 — 전 농장 구독 + 현재 이 농장에 배정된 계정의 구독 */
export async function loadSubscriptionsForFarm(farmId: string): Promise<SubscriptionTarget[]> {
  const db = getDb();
  return db.select({
    userId: pushSubscriptions.userId,
    endpoint: pushSubscriptions.endpoint,
    p256dh: pushSubscriptions.p256dh,
    auth: pushSubscriptions.auth,
    minSeverity: pushSubscriptions.minSeverity,
  })
    .from(pushSubscriptions)
    .where(or(
      eq(pushSubscriptions.allFarms, true),
      sql`EXISTS (SELECT 1 FROM ${userFarmAccess} ufa
                  WHERE ufa.user_id = ${pushSubscriptions.userId} AND ufa.farm_id = ${farmId})`,
    ));
}

/** 구독 설정 심각도 이상만 */
export function meetsMinSeverity(payloadSeverity: string, minSeverity: string): boolean {
  return (SEVERITY_ORDER[payloadSeverity] ?? 0) >= (SEVERITY_ORDER[minSeverity] ?? 0);
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

  let sentCount = 0;

  const candidates = (await loadSubscriptionsForFarm(farmId))
    .filter((entry) => meetsMinSeverity(payload.severity, entry.minSeverity));

  // 사용자별 채널 설정(민감도·무음시간) 적용 — critical은 무음시간 우회
  const prefs = await getChannelPrefs(candidates.map((e) => e.userId), 'push');
  const targets = candidates.filter((entry) =>
    shouldDeliver(prefs.get(entry.userId) ?? null, payload.severity),
  );

  const pushData = JSON.stringify({
    title: payload.title,
    body: payload.body,
    icon: payload.icon ?? '/icons/icon-192.png',
    tag: payload.tag ?? `alarm-${farmId}-${Date.now()}`,
    data: { url: payload.url ?? '/', farmId },
  });

  const sendPromises = targets.map(async (entry) => {
    try {
      await webpush.sendNotification({ endpoint: entry.endpoint, keys: { p256dh: entry.p256dh, auth: entry.auth } }, pushData);
      sentCount++;
    } catch (err: unknown) {
      const statusCode = (err as { statusCode?: number }).statusCode;
      if (statusCode === 410 || statusCode === 404) {
        // 구독 만료 — 자동 제거
        await removeSubscription(entry.endpoint).catch((e: unknown) => logger.warn({ err: e }, '[Push] 만료 구독 삭제 실패'));
        logger.debug({ endpoint: entry.endpoint.slice(-20) }, '[Push] Expired subscription removed');
      } else {
        logger.warn({ err, endpoint: entry.endpoint.slice(-20) }, '[Push] Send failed');
      }
    }
  });

  await Promise.allSettled(sendPromises);

  if (sentCount > 0) {
    logger.info({ farmId, sentCount, severity: payload.severity }, '[Push] Notifications sent');
  }

  return sentCount;
}
