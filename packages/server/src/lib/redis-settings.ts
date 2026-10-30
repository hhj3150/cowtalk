// Redis 접속 설정 판정 — 캐시·잡 스케줄러·헬스체크가 같은 결론을 쓰도록 한 곳에서 정한다
//
// 예전에는 REDIS_ENABLED 만 보고, 접속 정보가 없으면 기본값 localhost:6379 로 계속 연결을 시도했다.
// 운영(Railway)에 Redis 서비스가 아예 없는데도 연결 실패 로그가 쌓이고 /health/deep 이 "장애"로 나왔다.
// 이제 접속 정보(REDIS_URL 또는 REDIS_HOST)가 없으면 연결을 시도하지 않고 캐시 없이 동작한다.

import { logger } from './logger.js';
import { parseRedisEnabled } from './env-flags.js';

export interface RedisConnectionOptions {
  readonly host: string;
  readonly port: number;
  readonly username?: string;
  readonly password?: string;
  readonly db?: number;
  readonly tls?: Record<string, never>;
}

export type RedisSettings =
  | { readonly state: 'disabled'; readonly detail: string }
  | { readonly state: 'not_configured'; readonly detail: string }
  | { readonly state: 'invalid'; readonly detail: string }
  | { readonly state: 'configured'; readonly detail: string; readonly connection: RedisConnectionOptions };

export interface RedisEnv {
  readonly REDIS_ENABLED?: string;
  readonly REDIS_URL?: string;
  readonly REDIS_HOST?: string;
  readonly REDIS_PORT?: string;
  readonly REDIS_PASSWORD?: string;
}

export { parseRedisEnabled };

function nonEmpty(v: string | undefined): string | undefined {
  const t = v?.trim();
  return t ? t : undefined;
}

/** 순수 함수 — 환경변수만 보고 판정한다 (테스트 가능) */
export function resolveRedisSettings(env: RedisEnv): RedisSettings {
  if (!parseRedisEnabled(env.REDIS_ENABLED)) {
    return { state: 'disabled', detail: 'REDIS_ENABLED=false' };
  }

  const url = nonEmpty(env.REDIS_URL);
  if (url) {
    try {
      const u = new URL(url);
      if (u.protocol !== 'redis:' && u.protocol !== 'rediss:') {
        return { state: 'invalid', detail: 'REDIS_URL must start with redis:// or rediss://' };
      }
      if (!u.hostname) return { state: 'invalid', detail: 'REDIS_URL has no host' };
      const dbPath = u.pathname.replace(/^\//, '');
      const db = dbPath ? Number(dbPath) : undefined;
      const connection: RedisConnectionOptions = {
        host: u.hostname,
        port: u.port ? Number(u.port) : 6379,
        ...(u.username ? { username: decodeURIComponent(u.username) } : {}),
        ...(u.password ? { password: decodeURIComponent(u.password) } : {}),
        ...(db !== undefined && Number.isInteger(db) ? { db } : {}),
        ...(u.protocol === 'rediss:' ? { tls: {} } : {}),
      };
      return { state: 'configured', detail: `REDIS_URL (${connection.host}:${connection.port})`, connection };
    } catch {
      // 원문에는 비밀번호가 있을 수 있어 그대로 남기지 않는다
      return { state: 'invalid', detail: 'REDIS_URL is not a valid URL' };
    }
  }

  const host = nonEmpty(env.REDIS_HOST);
  if (host) {
    const port = nonEmpty(env.REDIS_PORT) ? Number(env.REDIS_PORT) : 6379;
    if (!Number.isInteger(port) || port <= 0) {
      return { state: 'invalid', detail: 'REDIS_PORT is not a valid port' };
    }
    const password = nonEmpty(env.REDIS_PASSWORD);
    return {
      state: 'configured',
      detail: `REDIS_HOST (${host}:${port})`,
      connection: { host, port, ...(password ? { password } : {}) },
    };
  }

  return { state: 'not_configured', detail: 'no REDIS_URL or REDIS_HOST' };
}

let cached: RedisSettings | null = null;
let warned = false;

/** 프로세스 환경 기준 판정 (1회 계산). 연결하지 않는 경우 경고는 프로세스당 1번만 남긴다 */
export function getRedisSettings(): RedisSettings {
  if (!cached) {
    cached = resolveRedisSettings(process.env as RedisEnv);
    if (!warned && (cached.state === 'not_configured' || cached.state === 'invalid')) {
      warned = true;
      logger.warn(`[Redis] 연결하지 않음 — ${cached.detail}. 캐시 없이 동작합니다 (REDIS_URL 을 설정하거나 REDIS_ENABLED=false 로 끄세요)`);
    } else if (!warned && cached.state === 'disabled') {
      warned = true;
      logger.info('[Redis] REDIS_ENABLED=false — 캐시 없이 동작합니다');
    }
  }
  return cached;
}

/** 테스트 전용 */
export function resetRedisSettingsForTest(): void {
  cached = null;
  warned = false;
}
