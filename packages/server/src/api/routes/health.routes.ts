// 헬스체크 라우트 — 기본 ping + 딥 체크 (DB, Redis, Claude API)

import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import { COWTALK_VERSION } from '@cowtalk/shared';
import { getDb } from '../../config/database.js';
import { config } from '../../config/index.js';
import { sql } from 'drizzle-orm';
import { logger } from '../../lib/logger.js';

export const healthRouter = Router();

// GET /health — 빠른 ping (Railway 헬스체크용)
healthRouter.get('/', (_req, res) => {
  res.json({
    success: true,
    data: {
      status: 'ok',
      version: COWTALK_VERSION,
      timestamp: new Date().toISOString(),
    },
  });
});

// OPS-02: 공개 엔드포인트인데 요청마다 새 Redis 클라이언트를 만들어 재시도로 ~10초 막히고, 실패 시 닫지 않아
// 연결이 누수됐다 (요청을 반복하면 서버 자원이 고갈되는 증폭 경로).
//   - Redis 핑은 재시도 없이 1초 상한, 성공·실패 모두 연결 해제
//   - 결과를 15초 캐시 + 동시 요청 합류 — 요청이 몰려도 실제 점검은 한 번
const DEEP_HEALTH_TTL_MS = 15_000;
const REDIS_PING_TIMEOUT_MS = 1_000;
let deepHealthCache: { at: number; result: Promise<DeepHealthResult> } | null = null;

interface DeepHealthResult {
  readonly httpStatus: number;
  readonly body: unknown;
}

/** Redis 핑 — 재시도 없음, 상한 시간, 항상 연결 해제 */
export async function pingRedisOnce(
  createClient: () => { ping: () => Promise<string>; disconnect: () => void },
  timeoutMs: number = REDIS_PING_TIMEOUT_MS,
): Promise<'PONG' | 'timeout' | 'error'> {
  const client = createClient();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const timeout = new Promise<'timeout'>((resolve) => { timer = setTimeout(() => resolve('timeout'), timeoutMs); });
    const result = await Promise.race([client.ping().then((p) => (p === 'PONG' ? 'PONG' as const : 'error' as const)), timeout]);
    return result;
  } catch {
    return 'error';
  } finally {
    if (timer) clearTimeout(timer);
    client.disconnect();
  }
}

export function resetDeepHealthCacheForTest(): void {
  deepHealthCache = null;
}

// GET /health/deep — 전체 의존성 검증 (배포 후 확인용)
// eslint-disable-next-line @typescript-eslint/no-unused-vars
healthRouter.get('/deep', async (_req: Request, res: Response, _next: NextFunction) => {
  const now = Date.now();
  if (!deepHealthCache || now - deepHealthCache.at > DEEP_HEALTH_TTL_MS) {
    deepHealthCache = { at: now, result: computeDeepHealth() };
  }
  const { httpStatus, body } = await deepHealthCache.result;
  res.status(httpStatus).json(body);
});

async function computeDeepHealth(): Promise<DeepHealthResult> {
  const startTime = Date.now();
  const checks: Array<{
    name: string;
    status: 'healthy' | 'degraded' | 'down';
    latencyMs: number;
    detail?: string;
  }> = [];

  // 1. DB 연결 확인
  const dbStart = Date.now();
  try {
    const db = getDb();
    await db.execute(sql`SELECT 1`);
    checks.push({ name: 'PostgreSQL', status: 'healthy', latencyMs: Date.now() - dbStart });
  } catch (err) {
    logger.warn({ err }, '[HealthCheck] DB check failed');
    checks.push({ name: 'PostgreSQL', status: 'down', latencyMs: Date.now() - dbStart, detail: 'Connection refused' });
  }

  // 2. Redis 연결 확인 (ioredis ping — 재시도 없음, 1초 상한, 항상 해제)
  const redisStart = Date.now();
  try {
    const IORedis = await import('ioredis');
    const Redis = IORedis.default;
    const result = await pingRedisOnce(() => new Redis({
      host: config.REDIS_HOST,
      port: config.REDIS_PORT,
      password: config.REDIS_PASSWORD || undefined,
      connectTimeout: REDIS_PING_TIMEOUT_MS,
      maxRetriesPerRequest: 0,
      enableOfflineQueue: false,
      retryStrategy: () => null,
      lazyConnect: false,
    }));
    checks.push({
      name: 'Redis',
      status: result === 'PONG' ? 'healthy' : 'down',
      latencyMs: Date.now() - redisStart,
      detail: result === 'PONG' ? undefined : result === 'timeout' ? 'Ping timeout' : 'Connection failed',
    });
  } catch {
    checks.push({ name: 'Redis', status: 'down', latencyMs: Date.now() - redisStart, detail: 'Connection failed' });
  }

  // 3. Claude API 키 존재 확인 (실제 호출 없이)
  const claudeStart = Date.now();
  if (config.ANTHROPIC_API_KEY) {
    checks.push({ name: 'Claude API', status: 'healthy', latencyMs: Date.now() - claudeStart, detail: 'API key configured' });
  } else {
    checks.push({ name: 'Claude API', status: 'degraded', latencyMs: Date.now() - claudeStart, detail: 'API key not configured' });
  }

  // 4. smaXtec — "비밀번호가 입력돼 있는가"가 아니라 "실제로 연결돼 데이터가 들어오는가"
  //    예전에는 자격증명 존재만 보고 healthy 로 표시해, 인증 실패로 데이터가 0인 동안에도 정상으로 보였다.
  //    공개 엔드포인트라 원문 오류는 노출하지 않고 원인 분류만 알린다.
  const smaxtecStart = Date.now();
  const credentialsSet = Boolean(config.SMAXTEC_API_KEY || (config.SMAXTEC_EMAIL && config.SMAXTEC_PASSWORD));
  let smaxtecStatus: 'healthy' | 'degraded' | 'down' = 'degraded';
  let smaxtecDetail = 'Credentials not configured';
  if (credentialsSet) {
    try {
      const { getPipelineOrchestrator } = await import('../../pipeline/orchestrator.js');
      const pipeline = await getPipelineOrchestrator().getHealth();
      const conn = pipeline.connectors.find((c) => c.connectorId === 'smaxtec');
      const [latest] = await getDb().execute(sql`SELECT max(detected_at) AS last_event FROM smaxtec_events`) as unknown as Array<{ last_event: string | null }>;
      const lastEventAt = latest?.last_event ? new Date(latest.last_event) : null;
      const hoursSince = lastEventAt ? (Date.now() - lastEventAt.getTime()) / 3_600_000 : null;
      smaxtecDetail = describeSmaxtecHealth({
        running: pipeline.isRunning,
        connectorStatus: conn?.status ?? 'unknown',
        lastError: conn?.lastError ?? null,
        lastSyncAt: conn?.lastSyncAt ?? null,
        lastEventAt,
      });
      const connected = conn?.status === 'connected' || conn?.status === 'syncing';
      smaxtecStatus = pipeline.isRunning && connected && hoursSince !== null && hoursSince < 6 ? 'healthy' : 'degraded';
    } catch (err) {
      logger.warn({ err }, '[Health] smaXtec 상태 조회 실패');
      smaxtecDetail = 'Status check failed';
    }
  }
  checks.push({
    name: 'smaXtec Connector',
    status: smaxtecStatus,
    latencyMs: Date.now() - smaxtecStart,
    detail: smaxtecDetail,
  });

  const overallStatus = checks.every((c) => c.status === 'healthy')
    ? 'healthy'
    : checks.some((c) => c.status === 'down')
      ? 'down'
      : 'degraded';

  const httpStatus = overallStatus === 'down' ? 503 : 200;

  return {
    httpStatus,
    body: {
      success: overallStatus !== 'down',
      data: {
        status: overallStatus,
        version: COWTALK_VERSION,
        timestamp: new Date().toISOString(),
        totalLatencyMs: Date.now() - startTime,
        checks,
      },
    },
  };
}

/** 공개 헬스 응답용 smaXtec 상태 문구 — 원문 오류 대신 원인 분류 */
export function describeSmaxtecHealth(h: {
  readonly running: boolean;
  readonly connectorStatus: string;
  readonly lastError: string | null;
  readonly lastSyncAt: Date | null;
  readonly lastEventAt: Date | null;
}): string {
  const parts: string[] = [];
  if (!h.running) parts.push('pipeline not running');
  parts.push(`connector ${h.connectorStatus}`);
  if (h.lastError) {
    const e = h.lastError;
    const cause = /401|auth|인증/i.test(e) ? 'authentication failed'
      : /0곳|organisation/i.test(e) ? 'no organisations on account'
      : /미연결|not connected/i.test(e) ? 'not connected'
      : 'upstream error';
    parts.push(`cause: ${cause}`);
  }
  parts.push(`last sync: ${h.lastSyncAt ? h.lastSyncAt.toISOString() : 'never'}`);
  parts.push(`last event: ${h.lastEventAt ? h.lastEventAt.toISOString() : 'none'}`);
  return parts.join(' · ');
}
