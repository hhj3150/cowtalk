// OPS-12: Socket.IO 다중 레플리카 전파 — 레플리카 A 에서 발생한 알람을 B 에 붙은 사용자도 받게
//
// 어댑터가 없으면 io.to(room).emit 은 '그 프로세스에 붙은 소켓'에만 간다 → 레플리카가 2개면
// 알람이 사용자 절반에게만 간다. Redis 에 연결될 때만 붙이고, 실패하면 기존 인메모리 어댑터를 유지한다
// (단일 레플리카에서는 동작이 같다).

import Redis from 'ioredis';
import { createAdapter } from '@socket.io/redis-adapter';
import type { Server as SocketServer } from 'socket.io';
import { config } from '../config/index.js';
import { logger } from '../lib/logger.js';

const CONNECT_TIMEOUT_MS = 3_000;

export interface AdapterDeps {
  readonly enabled: boolean;
  readonly createClient: () => Redis;
}

function defaultDeps(): AdapterDeps {
  return {
    enabled: config.REDIS_ENABLED && config.SOCKET_IO_REDIS_ADAPTER,
    createClient: () => new Redis({
      host: config.REDIS_HOST,
      port: config.REDIS_PORT,
      password: config.REDIS_PASSWORD || undefined,
      lazyConnect: true,
      connectTimeout: CONNECT_TIMEOUT_MS,
      // 연결이 끊긴 동안 publish 를 메모리에 쌓지 않는다 (끊김 중 알람이 무한 적재되지 않게)
      enableOfflineQueue: false,
      maxRetriesPerRequest: 1,
    }),
  };
}

/** @returns 어댑터를 붙였으면 true */
export async function attachRedisAdapter(io: SocketServer, deps: AdapterDeps = defaultDeps()): Promise<boolean> {
  if (!deps.enabled) return false;
  const pub = deps.createClient();
  const sub = pub.duplicate();
  try {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('redis connect timeout')), CONNECT_TIMEOUT_MS + 1_000); });
    await Promise.race([Promise.all([pub.connect(), sub.connect()]), timeout]).finally(() => { if (timer) clearTimeout(timer); });
    pub.on('error', (err) => logger.warn({ err }, '[Socket] Redis adapter pub error'));
    sub.on('error', (err) => logger.warn({ err }, '[Socket] Redis adapter sub error'));
    io.adapter(createAdapter(pub, sub));
    logger.info('[Socket] Redis adapter attached — 레플리카 간 이벤트 전파');
    return true;
  } catch (err) {
    logger.warn({ err }, '[Socket] Redis adapter 미사용 — 인메모리 어댑터 유지 (단일 레플리카만 정상)');
    pub.disconnect();
    sub.disconnect();
    return false;
  }
}
