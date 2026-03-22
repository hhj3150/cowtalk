// 캐시 서비스 — Redis에 최신 프로파일 캐시
// TTL 5분, 파이프라인 완료 시 업데이트

import Redis from 'ioredis';
import { config } from '../config/index.js';
import { logger } from '../lib/logger.js';
import type { AnimalProfile, FarmProfile, RegionalProfile } from '@cowtalk/shared';

// ===========================
// Redis 연결
// ===========================

let redis: Redis | null = null;
let redisDisabled = false;

export function getRedis(): Redis | null {
  if (redisDisabled || !config.REDIS_ENABLED) {
    return null;
  }
  if (!redis) {
    redis = new Redis({
      host: config.REDIS_HOST,
      port: config.REDIS_PORT,
      password: config.REDIS_PASSWORD || undefined,
      retryStrategy: (times) => {
        if (times > 3) {
          logger.warn('[Cache] Redis unavailable, disabling cache');
          redisDisabled = true;
          return null;
        }
        return Math.min(times * 200, 5000);
      },
      lazyConnect: true,
    });

    redis.on('error', (err) => {
      logger.error({ err }, '[Cache] Redis error');
    });
    redis.on('connect', () => {
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
