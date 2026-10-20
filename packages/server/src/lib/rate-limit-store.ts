// OPS-12: 속도 제한 카운터를 레플리카·재시작과 무관하게 — Redis 공유 카운터, 불가 시 메모리
//
// 예전엔 express-rate-limit 기본 MemoryStore 라 재시작마다 초기화되고 레플리카 수만큼 한도가 늘었다
// (로그인 브루트포스 한도 10회/15분이 레플리카 3개면 사실상 30회).
// Redis 가 없거나 응답이 늦으면 요청을 막지 않고 메모리 카운터로 이어간다 — 속도 제한 때문에 장애가 나면 안 된다.

import { MemoryStore, type Options, type Store, type IncrementResponse, type ClientRateLimitInfo } from 'express-rate-limit';
import { logger } from './logger.js';

/** Redis 클라이언트에서 쓰는 부분만 (테스트 주입용) */
export interface RateLimitRedis {
  eval(script: string, numKeys: number, ...args: Array<string | number>): Promise<unknown>;
  del(key: string): Promise<unknown>;
  decr(key: string): Promise<unknown>;
}

// INCR + 첫 증가 때만 만료 설정 → [카운트, 남은 ms]
const INCREMENT_SCRIPT = `
local c = redis.call('INCR', KEYS[1])
if c == 1 then redis.call('PEXPIRE', KEYS[1], ARGV[1]) end
local ttl = redis.call('PTTL', KEYS[1])
if ttl < 0 then redis.call('PEXPIRE', KEYS[1], ARGV[1]); ttl = tonumber(ARGV[1]) end
return {c, ttl}
`;

const REDIS_TIMEOUT_MS = 300;

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const t = new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('redis timeout')), ms); });
  return Promise.race([p, t]).finally(() => { if (timer) clearTimeout(timer); });
}

export class RedisFallbackStore implements Store {
  readonly localKeys = false;
  readonly prefix: string;
  private windowMs = 60_000;
  private readonly memory = new MemoryStore();
  private warned = false;

  constructor(prefix: string, private readonly redis: () => RateLimitRedis | null) {
    this.prefix = `cowtalk:rl:${prefix}:`;
  }

  init(options: Options): void {
    this.windowMs = options.windowMs;
    this.memory.init(options);
  }

  private fallback(err: unknown): void {
    if (!this.warned) {
      this.warned = true;
      logger.warn({ err, prefix: this.prefix }, '[RateLimit] Redis 사용 불가 — 메모리 카운터로 진행');
    }
  }

  async increment(key: string): Promise<IncrementResponse> {
    const r = this.redis();
    if (r) {
      try {
        const res = await withTimeout(r.eval(INCREMENT_SCRIPT, 1, this.prefix + key, this.windowMs), REDIS_TIMEOUT_MS);
        const [count, ttl] = res as [number, number];
        this.warned = false;
        return { totalHits: Number(count), resetTime: new Date(Date.now() + Number(ttl)) };
      } catch (err) {
        this.fallback(err);
      }
    }
    return this.memory.increment(key);
  }

  async decrement(key: string): Promise<void> {
    const r = this.redis();
    if (r) {
      try { await withTimeout(r.decr(this.prefix + key), REDIS_TIMEOUT_MS); return; } catch (err) { this.fallback(err); }
    }
    await this.memory.decrement(key);
  }

  async resetKey(key: string): Promise<void> {
    const r = this.redis();
    if (r) {
      try { await withTimeout(r.del(this.prefix + key), REDIS_TIMEOUT_MS); } catch (err) { this.fallback(err); }
    }
    await this.memory.resetKey(key);
  }

  async get(key: string): Promise<ClientRateLimitInfo | undefined> {
    return this.memory.get(key);
  }

  shutdown(): void {
    this.memory.shutdown();
  }
}
