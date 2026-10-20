// 공유 Redis 클라이언트 — 속도 제한(OPS-12)·처리 중 중복 거절(VO-07)이 쓴다.
// REDIS_ENABLED=false 이거나 연결이 3번 실패하면 null 을 돌려주고, 호출부는 메모리로 대체한다.
// OPS-17: 예전 serving/cache.service.ts 에서 옮김 — 그 파일의 프로필 캐시 함수들은 어디서도 쓰지 않는 죽은 코드였다.

import Redis from 'ioredis';
import { config } from '../config/index.js';
import { logger } from './logger.js';

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
          logger.warn('[Redis] Redis unavailable, disabling cache');
          redisDisabled = true;
          return null;
        }
        return Math.min(times * 200, 5000);
      },
      lazyConnect: true,
    });

    redis.on('error', (err) => {
      logger.error({ err }, '[Redis] Redis error');
    });
    redis.on('connect', () => {
      logger.info('[Redis] Redis connected');
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
