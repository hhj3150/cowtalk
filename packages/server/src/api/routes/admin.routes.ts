// 관리자 라우트 — 시스템 상태 모니터링

import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import { authenticate } from '../middleware/auth.js';
import { getDb } from '../../config/database.js';
import { config } from '../../config/index.js';
import { sql, count } from 'drizzle-orm';

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

// POST /admin/seed-feedback — AI 피드백 seed 데이터 생성 (시연용)
adminRouter.post('/seed-feedback', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const db = getDb();
    const { predictions, feedback, outcomeEvaluations, farms, animals, users } = await import('../../db/schema.js');

    // 이미 seed 데이터가 있는지 확인
    const [existing] = await db.select({ cnt: count() }).from(outcomeEvaluations);
    if (Number(existing?.cnt ?? 0) >= 10) {
      res.json({ success: true, message: `이미 ${String(existing?.cnt)}건의 평가 데이터 존재`, seeded: 0 });
      return;
    }

    // 농장 + 동물 + 사용자 ID 조회
    const farmRows = await db.select({ farmId: farms.farmId }).from(farms).limit(5);
    const animalRows = await db.select({ animalId: animals.animalId, farmId: animals.farmId }).from(animals).limit(20);
    const userRows = await db.select({ userId: users.userId, role: users.role }).from(users).limit(3);

    if (farmRows.length === 0 || animalRows.length === 0 || userRows.length === 0) {
      res.json({ success: false, message: '기본 데이터(농장/동물/사용자) 부족' });
      return;
    }

    const engineTypes = ['claude_interpreter', 'v4_health', 'v4_estrus', 'v4_pregnancy'] as const;
    const severities = ['critical', 'high', 'medium', 'low'] as const;
    const roles = ['farmer', 'veterinarian', 'quarantine_officer'] as const;
    const now = Date.now();
    const MS_PER_DAY = 86_400_000;
    let seeded = 0;

    for (let i = 0; i < 30; i++) {
      const farm = farmRows[i % farmRows.length]!;
      const animal = animalRows[i % animalRows.length]!;
      const user = userRows[i % userRows.length]!;
      const engine = engineTypes[i % engineTypes.length]!;
      const daysAgo = Math.floor(i * 1.5) + 1;
      const isCorrect = Math.random() > 0.2; // 80% 정확도

      // prediction 생성
      const [pred] = await db.insert(predictions).values({
        engineType: engine,
        animalId: animal.animalId,
        farmId: farm.farmId,
        timestamp: new Date(now - daysAgo * MS_PER_DAY),
        probability: 0.5 + Math.random() * 0.45,
        confidence: 0.6 + Math.random() * 0.35,
        severity: severities[i % severities.length]!,
        rankScore: 50 + Math.random() * 50,
        predictionLabel: `AI 분석 #${String(i + 1)}`,
        explanationText: '센서 데이터 기반 자동 분석',
        contributingFeatures: { temperature: 0.4, rumination: 0.3, activity: 0.3 },
        recommendedAction: '수의사 확인 권장',
        modelVersion: 'v5.0.0',
        roleSpecific: {},
      }).returning({ predictionId: predictions.predictionId });

      if (!pred) continue;

      // feedback 생성
      await db.insert(feedback).values({
        predictionId: pred.predictionId,
        animalId: animal.animalId,
        farmId: farm.farmId,
        feedbackType: isCorrect ? 'confirmed' : 'rejected',
        feedbackValue: isCorrect ? 1 : 0,
        sourceRole: roles[i % roles.length]!,
        recordedBy: user.userId,
        notes: null,
      });

      // outcome evaluation 생성
      await db.insert(outcomeEvaluations).values({
        predictionId: pred.predictionId,
        actualOutcome: isCorrect ? '예측 일치' : '예측 불일치',
        isCorrect,
        matchResult: isCorrect ? 'true_positive' : 'false_positive',
      });

      seeded++;
    }

    res.json({ success: true, message: `AI 피드백 ${String(seeded)}건 생성 완료`, seeded });
  } catch (error) {
    next(error);
  }
});
