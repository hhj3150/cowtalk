// 캐시 서비스 — Redis에 최신 프로파일 캐시
// TTL 5분, 파이프라인 완료 시 업데이트

import Redis from 'ioredis';
import { getRedisSettings } from '../lib/redis-settings.js';
import { logger } from '../lib/logger.js';
import type { AnimalProfile, FarmProfile, RegionalProfile } from '@cowtalk/shared';

// ===========================
// Redis 연결
// ===========================

let redis: Redis | null = null;
let redisDisabled = false;
let errorLogged = false;

// 연결 실패 시 재시도 상한 — 넘으면 이 프로세스에서는 캐시를 끈다 (로그 도배·무한 재연결 방지)
const MAX_RECONNECT_ATTEMPTS = 3;

export function getRedis(): Redis | null {
  if (redisDisabled) return null;
  // 접속 정보가 없거나 꺼져 있으면 연결을 시도하지 않는다 (예전: 기본값 localhost:6379 로 계속 시도)
  const settings = getRedisSettings();
  if (settings.state !== 'configured') {
    redisDisabled = true;
    return null;
  }
  if (!redis) {
    redis = new Redis({
      ...settings.connection,
      connectTimeout: 3000,
      maxRetriesPerRequest: 1,
      retryStrategy: (times) => {
        if (times > MAX_RECONNECT_ATTEMPTS) {
          logger.warn(`[Cache] Redis 재연결 ${MAX_RECONNECT_ATTEMPTS}회 실패 — 캐시를 끄고 계속 동작합니다`);
          redisDisabled = true;
          return null;
        }
        return Math.min(times * 500, 5000);
      },
      lazyConnect: true,
    });

    redis.on('error', (err) => {
      // 같은 원인의 오류가 재시도마다 반복되므로 첫 1회만 error 로 남긴다
      if (errorLogged) return;
      errorLogged = true;
      logger.error({ err }, '[Cache] Redis error');
    });
    redis.on('connect', () => {
      errorLogged = false;
      logger.info('[Cache] Redis connected');
    });
  }
  return redis;
}

export async function closeRedis(): Promise<void> {
  if (redis) {
    await redis.quit();
    redis = null;
  }
}

// ===========================
// 캐시 키 규칙
// ===========================

const CACHE_PREFIX = 'cowtalk:' as const;
const DEFAULT_TTL = 5 * 60; // 5분 (초)

function animalKey(animalId: string): string {
  return `${CACHE_PREFIX}animal:${animalId}`;
}

function farmKey(farmId: string): string {
  return `${CACHE_PREFIX}farm:${farmId}`;
}

function regionalKey(regionId: string): string {
  return `${CACHE_PREFIX}regional:${regionId}`;
}

// ===========================
// 캐시 읽기/쓰기
// ===========================

export async function cacheAnimalProfile(
  profile: AnimalProfile,
  ttl = DEFAULT_TTL,
): Promise<void> {
  try {
    const r = getRedis();
    if (!r) return;
    await r.set(animalKey(profile.animalId), JSON.stringify(profile), 'EX', ttl);
  } catch (error) {
    logger.error({ err: error }, '[Cache] Failed to cache animal profile');
  }
}

export async function getCachedAnimalProfile(
  animalId: string,
): Promise<AnimalProfile | null> {
  try {
    const r = getRedis();
    if (!r) return null;
    const raw = await r.get(animalKey(animalId));
    return raw ? (JSON.parse(raw) as AnimalProfile) : null;
  } catch (error) {
    logger.error({ err: error }, '[Cache] Failed to get cached animal profile');
    return null;
  }
}

export async function cacheFarmProfile(
  profile: FarmProfile,
  ttl = DEFAULT_TTL,
): Promise<void> {
  try {
    const r = getRedis();
    if (!r) return;
    await r.set(farmKey(profile.farmId), JSON.stringify(profile), 'EX', ttl);
  } catch (error) {
    logger.error({ err: error }, '[Cache] Failed to cache farm profile');
  }
}

export async function getCachedFarmProfile(
  farmId: string,
): Promise<FarmProfile | null> {
  try {
    const r = getRedis();
    if (!r) return null;
    const raw = await r.get(farmKey(farmId));
    return raw ? (JSON.parse(raw) as FarmProfile) : null;
  } catch (error) {
    logger.error({ err: error }, '[Cache] Failed to get cached farm profile');
    return null;
  }
}

export async function cacheRegionalProfile(
  profile: RegionalProfile,
  ttl = DEFAULT_TTL,
): Promise<void> {
  const id = profile.regionId ?? profile.tenantId ?? 'unknown';
  try {
    const r = getRedis();
    if (!r) return;
    await r.set(regionalKey(id), JSON.stringify(profile), 'EX', ttl);
  } catch (error) {
    logger.error({ err: error }, '[Cache] Failed to cache regional profile');
  }
}

export async function getCachedRegionalProfile(
  regionId: string,
): Promise<RegionalProfile | null> {
  try {
    const r = getRedis();
    if (!r) return null;
    const raw = await r.get(regionalKey(regionId));
    return raw ? (JSON.parse(raw) as RegionalProfile) : null;
  } catch (error) {
    logger.error({ err: error }, '[Cache] Failed to get cached regional profile');
    return null;
  }
}

// ===========================
// 캐시 무효화
// ===========================

export async function invalidateAnimalCache(animalId: string): Promise<void> {
  try {
    const r = getRedis();
    if (!r) return;
    await r.del(animalKey(animalId));
  } catch (error) {
    logger.error({ err: error }, '[Cache] Failed to invalidate animal cache');
  }
}

export async function invalidateFarmCache(farmId: string): Promise<void> {
  try {
    const r = getRedis();
    if (!r) return;
    await r.del(farmKey(farmId));
  } catch (error) {
    logger.error({ err: error }, '[Cache] Failed to invalidate farm cache');
  }
}
