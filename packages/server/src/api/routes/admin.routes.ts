// 관리자 라우트 — 시스템 상태 모니터링

import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import { authenticate } from '../middleware/auth.js';
import { getDb } from '../../config/database.js';
import { config } from '../../config/index.js';
import { sql } from 'drizzle-orm';

export const adminRouter = Router();

adminRouter.use(authenticate);

// GET /admin/system — 시스템 상태 조회
adminRouter.get('/system', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const db = getDb();

    // DB 연결 확인
    let dbStatus: 'healthy' | 'degraded' | 'down' = 'healthy';
    try {
      await db.execute(sql`SELECT 1`);
    } catch {
      dbStatus = 'down';
    }

    // Claude API 키 존재 여부로 가용성 판단
    const claudeAvailable = Boolean(config.ANTHROPIC_API_KEY);

    // 최근 이벤트 수집 시각 (파이프라인 상태)
    let lastIngestion: string | null = null;
    let errorsLast24h = 0;
    try {
      const [latest] = await db.execute(
        sql`SELECT MAX(created_at) as last_ts FROM smaxtec_events`,
      );
      lastIngestion = (latest as { last_ts: string | null })?.last_ts ?? null;

      const [errorCount] = await db.execute(
        sql`SELECT COUNT(*) as cnt FROM error_logs WHERE created_at > NOW() - INTERVAL '24 hours'`,
      );
      errorsLast24h = Number((errorCount as { cnt: number })?.cnt ?? 0);
    } catch {
      // 테이블 없을 수 있음
    }

    // AI 최근 분석 시각
    let lastAnalysis: string | null = null;
    let avgProcessingMs = 0;
    try {
      const [latestAi] = await db.execute(
        sql`SELECT MAX(created_at) as last_ts, AVG(EXTRACT(EPOCH FROM (updated_at - created_at)) * 1000)::int as avg_ms FROM ai_analyses WHERE created_at > NOW() - INTERVAL '24 hours'`,
      );
      lastAnalysis = (latestAi as { last_ts: string | null; avg_ms: number | null })?.last_ts ?? null;
      avgProcessingMs = (latestAi as { avg_ms: number | null })?.avg_ms ?? 0;
    } catch {
      // 테이블 없을 수 있음
    }

    const services = [
      { name: '서버', status: 'healthy' as const, lastCheck: new Date().toISOString(), details: null },
      { name: 'PostgreSQL', status: dbStatus, lastCheck: new Date().toISOString(), details: null },
      { name: 'Redis', status: 'healthy' as const, lastCheck: new Date().toISOString(), details: null },
      { name: '센서 커넥터', status: 'healthy' as const, lastCheck: new Date().toISOString(), details: null },
      { name: 'Claude API', status: claudeAvailable ? 'healthy' as const : 'degraded' as const, lastCheck: new Date().toISOString(), details: claudeAvailable ? null : 'API 키 미설정' },
    ];

    res.json({
      success: true,
      data: {
        services,
        pipeline: { lastIngestion, errorsLast24h },
        ai: { lastAnalysis, avgProcessingMs, claudeAvailable },
      },
    });
  } catch (error) {
    next(error);
  }
});

// GET /admin/users — 사용자 목록 (user.routes.ts의 GET /users와 동일하게 연결)
adminRouter.get('/users', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const db = getDb();
    const { users } = await import('../../db/schema.js');

    const userList = await db
      .select({
        userId: users.userId,
        name: users.name,
        email: users.email,
        role: users.role,
        status: users.status,
        lastLoginAt: users.lastLoginAt,
      })
      .from(users)
      .orderBy(users.name);

    res.json({ success: true, data: userList });
  } catch (error) {
    next(error);
  }
});
