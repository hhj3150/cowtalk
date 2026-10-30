// VO-07: 같은 요청이 처리 중일 때 두 번째를 거절 — Redis(레플리카 공유) 우선, 불가 시 프로세스 메모리
//
// 음성 인식기가 겹치거나 Whisper 결과가 늦게 도착하면 같은 발화가 두 번 제출돼 같은 질문이 두 번 실행됐다
// (기록 도구 제안이 두 번 생기고 비용도 두 배). 클라이언트가 발화마다 붙이는 clientRequestId 로 막는다.

import { logger } from './logger.js';

export interface DedupeRedis {
  set(key: string, value: string, px: 'PX', ttlMs: number, nx: 'NX'): Promise<unknown>;
  del(key: string): Promise<unknown>;
}

const PREFIX = 'cowtalk:inflight:';
const REDIS_TIMEOUT_MS = 300;
const memory = new Map<string, number>();

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const t = new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('redis timeout')), ms); });
  return Promise.race([p, t]).finally(() => { if (timer) clearTimeout(timer); });
}

function claimMemory(key: string, ttlMs: number, now: number): boolean {
  const until = memory.get(key);
  if (until !== undefined && until > now) return false;
  memory.set(key, now + ttlMs);
  // 만료 항목 청소 (메모리 누수 방지)
  if (memory.size > 5_000) for (const [k, v] of memory) if (v <= now) memory.delete(k);
  return true;
}

/** @returns 처음이면 true (진행), 이미 처리 중이면 false (거절) */
export async function claimInFlight(key: string, ttlMs: number, redis: DedupeRedis | null): Promise<boolean> {
  if (redis) {
    try {
      const r = await withTimeout(redis.set(PREFIX + key, '1', 'PX', ttlMs, 'NX'), REDIS_TIMEOUT_MS);
      return r === 'OK';
    } catch (err) {
      logger.debug({ err }, '[inflight] Redis 불가 — 메모리로 판정');
    }
  }
  return claimMemory(key, ttlMs, Date.now());
}

export async function releaseInFlight(key: string, redis: DedupeRedis | null): Promise<void> {
  memory.delete(key);
  if (redis) {
    await withTimeout(redis.del(PREFIX + key), REDIS_TIMEOUT_MS).catch(() => undefined);
  }
}

export function clearInFlightForTest(): void {
  memory.clear();
}
