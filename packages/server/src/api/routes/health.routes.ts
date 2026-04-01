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

// GET /health/deep — 전체 의존성 검증 (배포 후 확인용)
// eslint-disable-next-line @typescript-eslint/no-unused-vars
healthRouter.get('/deep', async (_req: Request, res: Response, _next: NextFunction) => {
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

  // 2. Redis 연결 확인 (ioredis ping)
  const redisStart = Date.now();
  try {
    const IORedis = await import('ioredis');
    const Redis = IORedis.default;
    const redis = new Redis({
      host: config.REDIS_HOST,
      port: config.REDIS_PORT,
      password: config.REDIS_PASSWORD || undefined,
      connectTimeout: 3000,
    });
    const pong = await redis.ping();
    await redis.quit();
    checks.push({
      name: 'Redis',
      status: pong === 'PONG' ? 'healthy' : 'degraded',
      latencyMs: Date.now() - redisStart,
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

  // 4. smaXtec 크레덴셜 확인
  const smaxtecStart = Date.now();
  const smaxtecReady = Boolean(config.SMAXTEC_EMAIL && config.SMAXTEC_PASSWORD);
  checks.push({
    name: 'smaXtec Connector',
    status: smaxtecReady ? 'healthy' : 'degraded',
    latencyMs: Date.now() - smaxtecStart,
    detail: smaxtecReady ? 'Credentials configured' : 'Credentials not configured',
  });

  const overallStatus = checks.every((c) => c.status === 'healthy')
    ? 'healthy'
    : checks.some((c) => c.status === 'down')
      ? 'down'
      : 'degraded';

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
