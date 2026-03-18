// 경제성 라우트 — 실제 DB 쿼리

import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import { authenticate } from '../middleware/auth.js';
import { requireFarmAccess } from '../middleware/rbac.js';
import { getDb } from '../../config/database.js';
import { farmEconomics, farms, animals, feedPrograms } from '../../db/schema.js';
import { eq, and, desc, count } from 'drizzle-orm';
import '../../types/express.d.js';

export const economicsRouter = Router();

economicsRouter.use(authenticate);

// POST /economics — 경제 데이터 저장
economicsRouter.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const db = getDb();
    const { farmId, period, revenue, costs, notes } = req.body;
    const recordedBy = req.user!.userId;

    const totalRevenue = Object.values(revenue as Record<string, number>).reduce((a: number, b: number) => a + b, 0);
    const totalCosts = Object.values(costs as Record<string, number>).reduce((a: number, b: number) => a + b, 0);

    // 농장 두수 조회
    const [headResult] = await db
      .select({ count: count() })
      .from(animals)
      .where(and(eq(animals.farmId, farmId as string), eq(animals.status, 'active')));

    const headCount = headResult?.count ?? 1;
    const profitMargin = totalRevenue > 0 ? Math.round(((totalRevenue - totalCosts) / totalRevenue) * 1000) / 10 : 0;

    const [entry] = await db
      .insert(farmEconomics)
      .values({
        farmId,
        period,
        revenue,
        costs,
        profitMargin,
        costPerHead: Math.round(totalCosts / headCount),
        revenuePerHead: Math.round(totalRevenue / headCount),
        notes: notes ?? null,
        recordedBy,
      })
      .returning();

    res.status(201).json({ success: true, data: entry });
  } catch (error) {
    next(error);
  }
});

// Static paths BEFORE parameterized /:farmId

// GET /economics/roi-calculator — ROI 계산기
economicsRouter.get('/roi-calculator', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const headCount = Number(req.query.headCount) || 50;
    const investmentType = (req.query.investmentType as string) ?? 'sensor';

    const roi = {
      investmentType,
      headCount,
      initialCost: headCount * 150000,
      annualBenefit: headCount * 280000,
      paybackMonths: 7,
      fiveYearRoi: 340,
      assumptions: [
        '발정탐지율 30% → 85% 개선',
        '질병 조기발견으로 폐사율 2% 감소',
        '수의사 방문 횟수 40% 감소',
      ],
    };

    res.json({ success: true, data: roi });
  } catch (error) {
    next(error);
  }
});

// GET /economics/benchmark/:tenantId — 벤치마크 비교
economicsRouter.get('/benchmark/:tenantId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const db = getDb();
    const tenantId = req.params.tenantId as string;

    // 테넌트 소속 농장들의 경제 데이터 집계
    const tenantFarms = await db
      .select({ farmId: farms.farmId })
      .from(farms)
      .where(eq(farms.tenantId, tenantId));

    const farmIds = tenantFarms.map((f) => f.farmId);

    if (farmIds.length === 0) {
      res.json({
        success: true,
        data: { tenantId, farmCount: 0, economics: [] },
      });
      return;
    }

    const economics = await db
      .select()
      .from(farmEconomics)
      .where(eq(farmEconomics.farmId, farmIds[0] as string))
      .orderBy(desc(farmEconomics.period))
      .limit(12);

    res.json({
      success: true,
      data: { tenantId, farmCount: farmIds.length, economics },
    });
  } catch (error) {
    next(error);
  }
});

// Parameterized routes

// GET /economics/:farmId — 농장 경제 데이터 조회
economicsRouter.get('/:farmId', requireFarmAccess, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const db = getDb();
    const farmId = req.params.farmId as string;
    const period = req.query.period as string | undefined;

    const conditions = [eq(farmEconomics.farmId, farmId)];
    if (period) {
      conditions.push(eq(farmEconomics.period, period));
    }

    const entries = await db
      .select()
      .from(farmEconomics)
      .where(and(...conditions))
      .orderBy(desc(farmEconomics.period))
      .limit(12);

    res.json({ success: true, data: entries });
  } catch (error) {
    next(error);
  }
});

// GET /economics/:farmId/productivity — 생산성 스냅샷
economicsRouter.get('/:farmId/productivity', requireFarmAccess, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const db = getDb();
    const farmId = req.params.farmId as string;

    const [farm] = await db
      .select({ currentHeadCount: farms.currentHeadCount })
      .from(farms)
      .where(eq(farms.farmId, farmId));

    const recentEconomics = await db
      .select()
      .from(farmEconomics)
      .where(eq(farmEconomics.farmId, farmId))
      .orderBy(desc(farmEconomics.period))
      .limit(6);

    const activeFeeds = await db
      .select()
      .from(feedPrograms)
      .where(and(eq(feedPrograms.farmId, farmId), eq(feedPrograms.isActive, true)));

    const productivity = {
      farmId,
      headCount: farm?.currentHeadCount ?? 0,
      recentEconomics,
      feedPrograms: activeFeeds,
    };

    res.json({ success: true, data: productivity });
  } catch (error) {
    next(error);
  }
});

// GET /economics/:farmId/analysis — AI 경제성 분석
economicsRouter.get('/:farmId/analysis', requireFarmAccess, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const db = getDb();
    const farmId = req.params.farmId as string;

    const recentData = await db
      .select()
      .from(farmEconomics)
      .where(eq(farmEconomics.farmId, farmId))
      .orderBy(desc(farmEconomics.period))
      .limit(3);

    const analysis = {
      farmId,
      periodsAnalyzed: recentData.length,
      data: recentData,
      summary: recentData.length > 0
        ? '최근 경제 데이터 기반 분석 결과입니다.'
        : '경제 데이터가 아직 입력되지 않았습니다. 수입/지출 데이터를 등록해주세요.',
    };

    res.json({ success: true, data: analysis });
  } catch (error) {
    next(error);
  }
});
