// TTS 사용량 추적 + 쿼터 — Redis 기반 카운터.
//
// 설계:
// - 키: cowtalk:tts:usage:{userId}:{day|month}:{chars|reqs}
// - 일별 키는 자정에 EXPIRE (KST 기준), 월별은 다음 달 1일.
// - Redis 미사용/장애 시 graceful — 쿼터를 우회하고 사용량 추적만 스킵.
// - 원자적 INCRBY로 race condition 방지.
//
// 한도 정책:
// - 일/월 글자 한도 초과 시 checkAndIncrement가 { allowed: false, retryAfterSeconds } 반환.
// - government_admin/quarantine_officer 역할은 쿼터 우회 (행정·방역 업무 보호).

import { getRedis } from '../../serving/cache.service.js';
import { config } from '../../config/index.js';
import { logger } from '../../lib/logger.js';

const KEY_PREFIX = 'cowtalk:tts:usage';

// KST(UTC+9) 기준 날짜 문자열 — 한국 서비스이므로 자정 리셋도 KST 기준.
function kstDayKey(date = new Date()): string {
  const kst = new Date(date.getTime() + 9 * 60 * 60 * 1000);
  return kst.toISOString().slice(0, 10); // YYYY-MM-DD
}

function kstMonthKey(date = new Date()): string {
  return kstDayKey(date).slice(0, 7); // YYYY-MM
}

// 자정(KST)까지 남은 초.
function secondsUntilKstMidnight(date = new Date()): number {
  const kst = new Date(date.getTime() + 9 * 60 * 60 * 1000);
  const nextMidnight = new Date(Date.UTC(
    kst.getUTCFullYear(),
    kst.getUTCMonth(),
    kst.getUTCDate() + 1,
  ));
  return Math.max(60, Math.ceil((nextMidnight.getTime() - kst.getTime()) / 1000));
}

// 다음 달 1일(KST)까지 남은 초.
function secondsUntilKstNextMonth(date = new Date()): number {
  const kst = new Date(date.getTime() + 9 * 60 * 60 * 1000);
  const nextMonth = new Date(Date.UTC(
    kst.getUTCFullYear(),
    kst.getUTCMonth() + 1,
    1,
  ));
  return Math.max(3600, Math.ceil((nextMonth.getTime() - kst.getTime()) / 1000));
}

export interface QuotaCheckResult {
  readonly allowed: boolean;
  /** 한도 초과 시 — 다음 리셋까지 남은 초. */
  readonly retryAfterSeconds?: number;
  /** 어떤 한도에 걸렸는지 (사용자 안내용). */
  readonly limitType?: 'daily' | 'monthly';
  /** 현재 일 사용량(chars). */
  readonly dailyUsed: number;
  /** 현재 월 사용량(chars). */
  readonly monthlyUsed: number;
}

export interface UserUsage {
  readonly userId: string;
  readonly dailyChars: number;
  readonly monthlyChars: number;
  readonly dailyRequests: number;
  readonly monthlyRequests: number;
}

const ADMIN_ROLES: ReadonlySet<string> = new Set(['government_admin', 'quarantine_officer']);

/**
 * 쿼터 체크 + 사용량 원자적 증가.
 *
 * 흐름:
 * 1. role이 ADMIN_ROLES면 우회.
 * 2. Redis 미연결이면 우회 + 경고 로그.
 * 3. 현재 사용량 조회 → 이 요청 chars를 더했을 때 한도 초과 여부 확인.
 * 4. 한도 OK면 INCRBY + EXPIRE 갱신, 한도 NG면 거부.
 */
export async function checkAndIncrementTtsUsage(
  userId: string,
  chars: number,
  role?: string,
): Promise<QuotaCheckResult> {
  // 비인증·시스템 호출(예: 배치)은 userId 없이 옴 — 우회
  if (!userId) {
    return { allowed: true, dailyUsed: 0, monthlyUsed: 0 };
  }
  if (role && ADMIN_ROLES.has(role)) {
    return { allowed: true, dailyUsed: 0, monthlyUsed: 0 };
  }

  const redis = getRedis();
  if (!redis) {
    // Redis 미사용 환경(개발/테스트) — 쿼터 우회.
    return { allowed: true, dailyUsed: 0, monthlyUsed: 0 };
  }

  const dayKey = kstDayKey();
  const monthKey = kstMonthKey();
  const dayChars = `${KEY_PREFIX}:${userId}:d:${dayKey}:chars`;
  const monthChars = `${KEY_PREFIX}:${userId}:m:${monthKey}:chars`;
  const dayReqs = `${KEY_PREFIX}:${userId}:d:${dayKey}:reqs`;
  const monthReqs = `${KEY_PREFIX}:${userId}:m:${monthKey}:reqs`;

  try {
    const [dCharsRaw, mCharsRaw] = await redis.mget(dayChars, monthChars);
    const currentDayChars = Number(dCharsRaw ?? 0);
    const currentMonthChars = Number(mCharsRaw ?? 0);

    if (config.TTS_DAILY_CHAR_LIMIT > 0 && currentDayChars + chars > config.TTS_DAILY_CHAR_LIMIT) {
      return {
        allowed: false,
        limitType: 'daily',
        retryAfterSeconds: secondsUntilKstMidnight(),
        dailyUsed: currentDayChars,
        monthlyUsed: currentMonthChars,
      };
    }
    if (config.TTS_MONTHLY_CHAR_LIMIT > 0 && currentMonthChars + chars > config.TTS_MONTHLY_CHAR_LIMIT) {
      return {
        allowed: false,
        limitType: 'monthly',
        retryAfterSeconds: secondsUntilKstNextMonth(),
        dailyUsed: currentDayChars,
        monthlyUsed: currentMonthChars,
      };
    }

    // 한도 OK → 원자적 증가 + EXPIRE.
    // 한도가 0이면 카운터 비활성(추적 안함).
    const pipeline = redis.multi();
    pipeline.incrby(dayChars, chars);
    pipeline.expire(dayChars, secondsUntilKstMidnight());
    pipeline.incrby(monthChars, chars);
    pipeline.expire(monthChars, secondsUntilKstNextMonth());
    pipeline.incr(dayReqs);
    pipeline.expire(dayReqs, secondsUntilKstMidnight());
    pipeline.incr(monthReqs);
    pipeline.expire(monthReqs, secondsUntilKstNextMonth());
    await pipeline.exec();

    return {
      allowed: true,
      dailyUsed: currentDayChars + chars,
      monthlyUsed: currentMonthChars + chars,
    };
  } catch (err) {
    // Redis 일시 장애 — 사용자 차단보다는 우회 (가용성 우선)
    logger.warn({ err }, '[tts-quota] Redis error — bypassing quota check');
    return { allowed: true, dailyUsed: 0, monthlyUsed: 0 };
  }
}

/**
 * 특정 사용자의 현재 사용량 조회 (admin 대시보드 + 본인 확인용).
 */
export async function getUserTtsUsage(userId: string): Promise<UserUsage> {
  const redis = getRedis();
  if (!redis) {
    return { userId, dailyChars: 0, monthlyChars: 0, dailyRequests: 0, monthlyRequests: 0 };
  }
  const dayKey = kstDayKey();
  const monthKey = kstMonthKey();
  try {
    const [dC, mC, dR, mR] = await redis.mget(
      `${KEY_PREFIX}:${userId}:d:${dayKey}:chars`,
      `${KEY_PREFIX}:${userId}:m:${monthKey}:chars`,
      `${KEY_PREFIX}:${userId}:d:${dayKey}:reqs`,
      `${KEY_PREFIX}:${userId}:m:${monthKey}:reqs`,
    );
    return {
      userId,
      dailyChars: Number(dC ?? 0),
      monthlyChars: Number(mC ?? 0),
      dailyRequests: Number(dR ?? 0),
      monthlyRequests: Number(mR ?? 0),
    };
  } catch (err) {
    logger.warn({ err }, '[tts-quota] getUserTtsUsage failed');
    return { userId, dailyChars: 0, monthlyChars: 0, dailyRequests: 0, monthlyRequests: 0 };
  }
}

/**
 * 비용 추정 — chars × USD_PER_MILLION_CHARS / 1_000_000.
 * tts-1: $15/1M, tts-1-hd: $30/1M (2026-05 시점 OpenAI 가격).
 */
export function estimateTtsCostUsd(chars: number, model: 'tts-1' | 'tts-1-hd' = 'tts-1-hd'): number {
  const rate = model === 'tts-1-hd' ? 30 : 15;
  return (chars / 1_000_000) * rate;
}

/**
 * 한도 응답 헬퍼 — 라우터에서 일관되게 사용.
 */
export interface QuotaSnapshot {
  readonly dailyLimit: number;
  readonly monthlyLimit: number;
}

export function getQuotaLimits(): QuotaSnapshot {
  return {
    dailyLimit: config.TTS_DAILY_CHAR_LIMIT,
    monthlyLimit: config.TTS_MONTHLY_CHAR_LIMIT,
  };
}
