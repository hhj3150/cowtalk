// 알림 게이트 — 사용자 설정(민감도·무음시간)을 발송 경로에서 실제로 적용한다
//
// 원칙:
// - 판정은 순수 함수 (단위 테스트 대상). DB 조회는 60초 캐시로 분리.
// - critical(응급)은 무음시간을 우회한다 — 폐사·응급 위험은 새벽에도 알려야 한다.
// - 설정 행이 없으면 '허용' — 알림을 잃는 쪽이 아니라 보내는 쪽으로 폴백한다.

import { and, eq, inArray } from 'drizzle-orm';
import { getDb } from '../../config/database.js';
import { notificationPreferences } from '../../db/schema.js';
import { logger } from '../../lib/logger.js';

const SEVERITY_ORDER: Readonly<Record<string, number>> = {
  critical: 4,
  high: 3,
  medium: 2,
  low: 1,
};

export interface ChannelPreference {
  readonly isEnabled: boolean;
  readonly minSeverity: string;
  readonly quietHoursStart: string | null; // "HH:MM"
  readonly quietHoursEnd: string | null;
}

/** "HH:MM" → 자정 기준 분. 형식이 아니면 null */
export function parseHHMM(value: string | null | undefined): number | null {
  if (!value) return null;
  const m = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h < 0 || h > 23 || min < 0 || min > 59) return null;
  return h * 60 + min;
}

/**
 * 무음시간 판정 (순수) — 자정을 넘는 범위(예: 22:00~06:00) 지원.
 * 시작==끝이거나 어느 한쪽이 없으면 무음시간 없음.
 */
export function isInQuietHours(
  nowMinutes: number,
  start: string | null | undefined,
  end: string | null | undefined,
): boolean {
  const s = parseHHMM(start);
  const e = parseHHMM(end);
  if (s === null || e === null || s === e) return false;
  if (s < e) return nowMinutes >= s && nowMinutes < e;
  // 자정을 넘는 범위
  return nowMinutes >= s || nowMinutes < e;
}

/** 심각도 게이트 (순수) — 알 수 없는 값은 보수적으로 통과(0 취급 안 함) */
export function passesSeverity(minSeverity: string, severity: string): boolean {
  const min = SEVERITY_ORDER[minSeverity];
  const sev = SEVERITY_ORDER[severity];
  if (min == null || sev == null) return true;
  return sev >= min;
}

/**
 * 발송 여부 판정 (순수).
 * - 설정 없음(null) → 발송 (기본 허용)
 * - 채널 비활성 → 차단
 * - critical은 무음시간 우회, 그 외는 무음시간 차단
 * - minSeverity 미달 → 차단
 */
export function shouldDeliver(
  pref: ChannelPreference | null,
  severity: string,
  now: Date = new Date(),
): boolean {
  if (!pref) return true;
  if (!pref.isEnabled) return false;
  if (!passesSeverity(pref.minSeverity, severity)) return false;
  if (severity !== 'critical') {
    const nowMinutes = now.getHours() * 60 + now.getMinutes();
    if (isInQuietHours(nowMinutes, pref.quietHoursStart, pref.quietHoursEnd)) return false;
  }
  return true;
}

// ===========================
// DB 조회 + 캐시 (60초)
// ===========================

const CACHE_TTL_MS = 60_000;
const prefCache = new Map<string, { at: number; pref: ChannelPreference | null }>();

export function invalidateNotificationGateCache(): void {
  prefCache.clear();
}

/** 여러 사용자의 특정 채널 설정 일괄 조회 — 없으면 null(기본 허용) */
export async function getChannelPrefs(
  userIds: readonly string[],
  channel: string,
): Promise<Map<string, ChannelPreference | null>> {
  const result = new Map<string, ChannelPreference | null>();
  const misses: string[] = [];
  const now = Date.now();

  for (const uid of new Set(userIds)) {
    const hit = prefCache.get(`${uid}:${channel}`);
    if (hit && now - hit.at < CACHE_TTL_MS) result.set(uid, hit.pref);
    else misses.push(uid);
  }
  if (misses.length === 0) return result;

  try {
    const db = getDb();
    const rows = await db
      .select({
        userId: notificationPreferences.userId,
        isEnabled: notificationPreferences.isEnabled,
        minSeverity: notificationPreferences.minSeverity,
        quietHoursStart: notificationPreferences.quietHoursStart,
        quietHoursEnd: notificationPreferences.quietHoursEnd,
      })
      .from(notificationPreferences)
      .where(and(
        inArray(notificationPreferences.userId, misses),
        eq(notificationPreferences.channel, channel),
      ));

    const byUser = new Map(rows.map((r) => [r.userId, r]));
    for (const uid of misses) {
      const row = byUser.get(uid);
      const pref: ChannelPreference | null = row
        ? {
            isEnabled: row.isEnabled,
            minSeverity: row.minSeverity,
            quietHoursStart: row.quietHoursStart,
            quietHoursEnd: row.quietHoursEnd,
          }
        : null;
      prefCache.set(`${uid}:${channel}`, { at: now, pref });
      result.set(uid, pref);
    }
  } catch (err) {
    logger.warn({ err, channel }, '[NotifyGate] 설정 조회 실패 — 기본 허용 폴백');
    for (const uid of misses) result.set(uid, null);
  }
  return result;
}
