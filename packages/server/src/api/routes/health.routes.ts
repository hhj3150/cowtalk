// 헬스체크 라우트 — 기본 ping + 딥 체크 (DB, Redis, Claude API)

import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import { COWTALK_VERSION } from '@cowtalk/shared';
import { getDb } from '../../config/database.js';
import { config } from '../../config/index.js';
import { sql } from 'drizzle-orm';
import { logger } from '../../lib/logger.js';
import { getRedisSettings } from '../../lib/redis-settings.js';
import type { RedisSettings, RedisConnectionOptions } from '../../lib/redis-settings.js';

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

// GET /health/deep — 전체 의존성 검증 (배포 후 확인용)
// eslint-disable-next-line @typescript-eslint/no-unused-vars
healthRouter.get('/deep', async (_req: Request, res: Response, _next: NextFunction) => {
  const startTime = Date.now();
  const checks: HealthCheck[] = [];

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

  // 2. Redis — 꺼져 있거나 접속 정보가 없으면 'skipped', 연결 실패는 'degraded' (캐시 없이 동작 가능 — DB 장애와 같은 등급이 아니다)
  checks.push(await checkRedis(getRedisSettings(), pingRedis));

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
      // 미래 시각 행(타임존 오파싱 등)은 '마지막 이벤트'에서 제외 — 섞이면 수집이 멈춰도 최대 9시간 healthy 로 보인다.
      // (10분은 시계 오차 허용) 대신 그 건수를 따로 노출해 데이터 무결성 문제를 숨기지 않는다. (detected_at 인덱스 범위 스캔)
      const [latest] = await getDb().execute(sql`
        SELECT
          (SELECT max(detected_at) FROM smaxtec_events WHERE detected_at <= now() + interval '10 minutes') AS last_event,
          (SELECT count(*) FROM smaxtec_events WHERE detected_at > now() + interval '10 minutes') AS future_events
      `) as unknown as Array<{ last_event: string | null; future_events: string | number | null }>;
      const lastEventAt = latest?.last_event ? new Date(latest.last_event) : null;
      const futureEvents = Number(latest?.future_events ?? 0);
      const hoursSince = lastEventAt ? (Date.now() - lastEventAt.getTime()) / 3_600_000 : null;
      smaxtecDetail = describeSmaxtecHealth({
        running: pipeline.isRunning,
        connectorStatus: conn?.status ?? 'unknown',
        lastError: conn?.lastError ?? null,
        lastSyncAt: conn?.lastSyncAt ?? null,
        lastEventAt,
        futureEvents,
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

  const overallStatus = summarizeHealth(checks);

  const httpStatus = overallStatus === 'down' ? 503 : 200;

  res.status(httpStatus).json({
    success: overallStatus !== 'down',
    data: {
      status: overallStatus,
      version: COWTALK_VERSION,
      timestamp: new Date().toISOString(),
      totalLatencyMs: Date.now() - startTime,
      checks,
    },
  });
});

export interface HealthCheck {
  name: string;
  status: 'healthy' | 'degraded' | 'down' | 'skipped';
  latencyMs: number;
  detail?: string;
}

/** 전체 판정 — 'skipped'(의도적으로 쓰지 않는 구성요소)는 판정에서 뺀다 */
export function summarizeHealth(checks: readonly HealthCheck[]): 'healthy' | 'degraded' | 'down' {
  const counted = checks.filter((c) => c.status !== 'skipped');
  if (counted.some((c) => c.status === 'down')) return 'down';
  if (counted.every((c) => c.status === 'healthy')) return 'healthy';
  return 'degraded';
}

/** Redis 점검 — 설정 판정 + ping 함수를 받아 결과만 만든다 (테스트 가능) */
export async function checkRedis(
  settings: RedisSettings,
  ping: (conn: RedisConnectionOptions) => Promise<string>,
): Promise<HealthCheck> {
  if (settings.state === 'disabled' || settings.state === 'not_configured') {
    return { name: 'Redis', status: 'skipped', latencyMs: 0, detail: `${settings.detail} — running without cache` };
  }
  if (settings.state === 'invalid') {
    return { name: 'Redis', status: 'degraded', latencyMs: 0, detail: `${settings.detail} — running without cache` };
  }
  const start = Date.now();
  try {
    const pong = await ping(settings.connection);
    return {
      name: 'Redis',
      status: pong === 'PONG' ? 'healthy' : 'degraded',
      latencyMs: Date.now() - start,
      detail: settings.detail,
    };
  } catch {
    return { name: 'Redis', status: 'degraded', latencyMs: Date.now() - start, detail: 'Connection failed — running without cache' };
  }
}

/** 1회용 ping — 재연결하지 않고, 성공·실패 모두 연결을 닫는다 (예전: 실패 시 연결이 남아 재시도 로그가 쌓였다) */
async function pingRedis(conn: RedisConnectionOptions): Promise<string> {
  const IORedis = await import('ioredis');
  const Redis = IORedis.default;
  const redis = new Redis({
    ...conn,
    lazyConnect: true,
    connectTimeout: 2000,
    maxRetriesPerRequest: 0,
    retryStrategy: () => null,
  });
  redis.on('error', () => { /* 결과는 호출부가 degraded 로 기록 */ });
  try {
    await redis.connect();
    return await redis.ping();
  } finally {
    redis.disconnect();
  }
}

/** 공개 헬스 응답용 smaXtec 상태 문구 — 원문 오류 대신 원인 분류 */
export function describeSmaxtecHealth(h: {
  readonly running: boolean;
  readonly connectorStatus: string;
  readonly lastError: string | null;
  readonly lastSyncAt: Date | null;
  readonly lastEventAt: Date | null;
  readonly futureEvents?: number;
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
  if (h.futureEvents && h.futureEvents > 0) parts.push(`future-dated events: ${String(h.futureEvents)}`);
  return parts.join(' · ');
}
