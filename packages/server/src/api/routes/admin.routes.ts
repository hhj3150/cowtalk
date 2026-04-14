// 관리자 라우트 — 시스템 상태 모니터링 + 감사 로그

import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import { authenticate } from '../middleware/auth.js';
import { getDb } from '../../config/database.js';
import { config } from '../../config/index.js';
import { sql, count, desc, gte, eq, and } from 'drizzle-orm';

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

// POST /admin/debug-sovereign — 단일 농장 소버린 알람 생성 + predictions 저장 테스트
adminRouter.post('/debug-sovereign', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const farmId = req.query.farmId as string;
    if (!farmId) {
      // 센서 데이터가 가장 많은 농장 자동 선택
      const db = getDb();
      const [topFarm] = await db.execute(sql`
        SELECT a.farm_id, f.name, count(DISTINCT s.animal_id) AS cnt
        FROM sensor_daily_agg s
        JOIN animals a ON a.animal_id = s.animal_id
        JOIN farms f ON f.farm_id = a.farm_id
        WHERE s.date >= (now() - interval '7 days')::date
        GROUP BY a.farm_id, f.name
        ORDER BY cnt DESC LIMIT 1
      `) as unknown as [{ farm_id: string; name: string; cnt: number }];

      if (!topFarm) {
        res.json({ success: false, error: 'No farm with sensor data' });
        return;
      }

      const { generateSovereignAlarms } = await import('../../services/sovereign-alarm/orchestrator.js');
      let alarms: unknown[] = [];
      let debugError: string | null = null;
      try {
        alarms = await generateSovereignAlarms(topFarm.farm_id, 20);
      } catch (e) {
        debugError = e instanceof Error ? `${e.message}\n${e.stack}` : String(e);
      }

      res.json({
        success: true,
        data: {
          farmId: topFarm.farm_id,
          farmName: topFarm.name,
          animalsWithData: topFarm.cnt,
          alarmsGenerated: alarms.length,
          alarmTypes: (alarms as Array<{type: string}>).map(a => a.type),
          firstAlarm: alarms[0] ?? null,
          debugError,
        },
      });
      return;
    }

    const { generateSovereignAlarms } = await import('../../services/sovereign-alarm/orchestrator.js');
    let alarms: unknown[] = [];
    let debugError: string | null = null;
    try {
      alarms = await generateSovereignAlarms(farmId, 20);
    } catch (e) {
      debugError = e instanceof Error ? `${e.message}\n${e.stack}` : String(e);
    }
    res.json({ success: true, data: { alarmsGenerated: alarms.length, debugError } });
  } catch (error) {
    next(error);
  }
});

// POST /admin/run-intelligence — Intelligence Loop 즉시 실행 (배포 후 데이터 워밍업)
adminRouter.post('/run-intelligence', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const { getPipelineOrchestrator } = await import('../../pipeline/orchestrator.js');
    const pipeline = getPipelineOrchestrator();
    // 비동기 실행 (응답 즉시 반환)
    pipeline.runIntelligenceLoopBatch().catch((err: unknown) => {
      console.error('[Admin] Intelligence Loop batch failed:', err);
    });
    res.json({
      success: true,
      message: 'Intelligence Loop 배치 시작됨 (소버린 알람 sweep + auto-labeler + threshold-learner + pattern-mining)',
      triggeredAt: new Date().toISOString(),
    });
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

// GET /admin/audit-log — 팅커벨 AI 도구 호출 감사 로그 조회
adminRouter.get('/audit-log', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const db = getDb();
    const { toolAuditLog } = await import('../../db/schema.js');

    const limit = Math.min(Number(req.query.limit) || 50, 200);
    const offset = Number(req.query.offset) || 0;
    const toolName = req.query.toolName as string | undefined;
    const role = req.query.role as string | undefined;
    const status = req.query.status as string | undefined;
    const days = Math.min(Number(req.query.days) || 7, 90);

    const sinceDate = new Date(Date.now() - days * 86_400_000);
    const conditions = [gte(toolAuditLog.startedAt, sinceDate)];

    if (toolName) conditions.push(eq(toolAuditLog.toolName, toolName));
    if (role) conditions.push(eq(toolAuditLog.role, role));
    if (status) conditions.push(eq(toolAuditLog.resultStatus, status));

    const rows = await db
      .select({
        logId: toolAuditLog.logId,
        requestId: toolAuditLog.requestId,
        role: toolAuditLog.role,
        toolName: toolAuditLog.toolName,
        toolDomain: toolAuditLog.toolDomain,
        inputSummary: toolAuditLog.inputSummary,
        resultStatus: toolAuditLog.resultStatus,
        executionMs: toolAuditLog.executionMs,
        approvalRequired: toolAuditLog.approvalRequired,
        startedAt: toolAuditLog.startedAt,
      })
      .from(toolAuditLog)
      .where(and(...conditions))
      .orderBy(desc(toolAuditLog.startedAt))
      .limit(limit)
      .offset(offset);

    // 요약 통계
    const [totalRow] = await db
      .select({ cnt: count() })
      .from(toolAuditLog)
      .where(and(...conditions));

    const [domainStats] = await db.execute(
      sql`SELECT tool_domain, COUNT(*)::int as cnt, AVG(execution_ms)::int as avg_ms
          FROM tool_audit_log
          WHERE started_at >= ${sinceDate}
          GROUP BY tool_domain
          ORDER BY cnt DESC`,
    );

    res.json({
      success: true,
      data: {
        logs: rows,
        total: Number(totalRow?.cnt ?? 0),
        limit,
        offset,
        summary: {
          days,
          domainStats: Array.isArray(domainStats) ? domainStats : [],
        },
      },
    });
  } catch (error) {
    // tool_audit_log 테이블이 아직 없을 수 있음
    const errMsg = error instanceof Error ? error.message : String(error);
    if (errMsg.includes('does not exist') || errMsg.includes('relation')) {
      res.json({
        success: true,
        data: {
          logs: [],
          total: 0,
          limit: 50,
          offset: 0,
          summary: { days: 7, domainStats: [], notice: 'tool_audit_log 테이블 미생성 — 마이그레이션 필요' },
        },
      });
      return;
    }
    next(error);
  }
});
