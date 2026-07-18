// 경제성 라우트 — 실제 DB 쿼리

import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import { authenticate } from '../middleware/auth.js';
import { requireFarmAccess } from '../middleware/rbac.js';
import { getDb } from '../../config/database.js';
import { farmEconomics, farms, animals, feedPrograms } from '../../db/schema.js';
import { eq, and, desc, count } from 'drizzle-orm';
import {
  listEconomicParams,
  upsertEconomicParam,
  deleteEconomicParamOverride,
  validateParameterValue,
  getEconomicParamValues,
} from '../../services/economics/economic-params.service.js';
import { computeSensorRoi } from '../../services/economics/roi.service.js';
import { isEconomicParameterKey } from '@cowtalk/shared';
import { ForbiddenError, BadRequestError } from '../../lib/errors.js';

export const economicsRouter = Router();

economicsRouter.use(authenticate);

// ===========================
// 경제 파라미터 (기본값 + 글로벌/농장 오버라이드)
// 정적 경로 — /:farmId 보다 먼저 등록해야 한다
// ===========================

/** 파라미터 쓰기 권한: 글로벌 = 행정관리자만, 농장별 = 소속 농장주/수의사 + 행정관리자 */
function assertParamWriteAccess(req: Request, farmId: string | undefined): void {
  const user = req.user!;
  if (user.role === 'government_admin') return;
  if (!farmId) {
    throw new ForbiddenError('글로벌 경제 파라미터는 행정관리자만 수정할 수 있습니다');
  }
  if (user.role !== 'farmer' && user.role !== 'veterinarian') {
    throw new ForbiddenError('농장 경제 파라미터 수정 권한이 없습니다');
  }
  const farmIds = user.farmIds ?? [];
  if (farmIds.length > 0 && !farmIds.includes(farmId)) {
    throw new ForbiddenError('접근 권한이 없는 농장입니다');
  }
}

// GET /economics/parameters?farmId= — 유효 파라미터 목록 (정의+값+출처)
economicsRouter.get('/parameters', requireFarmAccess, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const farmId = (req.query.farmId as string | undefined) || undefined;
    const parameters = await listEconomicParams(farmId);
    res.json({ success: true, data: { farmId: farmId ?? null, parameters } });
  } catch (error) {
    next(error);
  }
});

// PUT /economics/parameters — 오버라이드 저장 { key, value, farmId? }
economicsRouter.put('/parameters', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { key, value, farmId } = req.body as { key?: string; value?: number; farmId?: string };
    const verdict = validateParameterValue(String(key), Number(value));
    if (!verdict.ok) {
      throw new BadRequestError(verdict.reason);
    }
    assertParamWriteAccess(req, farmId);
    await upsertEconomicParam({
      key: verdict.key,
      value: Number(value),
      farmId: farmId || undefined,
      userId: req.user!.userId,
    });
    const parameters = await listEconomicParams(farmId || undefined);
    res.json({ success: true, data: { farmId: farmId ?? null, parameters } });
  } catch (error) {
    next(error);
  }
});

// DELETE /economics/parameters/:key?farmId= — 오버라이드 제거 (상위 값으로 복귀)
economicsRouter.delete('/parameters/:key', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const key = req.params.key as string;
    if (!isEconomicParameterKey(key)) {
      throw new BadRequestError(`알 수 없는 파라미터 키: ${key}`);
    }
    const farmId = (req.query.farmId as string | undefined) || undefined;
    assertParamWriteAccess(req, farmId);
    await deleteEconomicParamOverride(key, farmId);
    const parameters = await listEconomicParams(farmId);
    res.json({ success: true, data: { farmId: farmId ?? null, parameters } });
  } catch (error) {
    next(error);
  }
});

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

// GET /economics/roi-calculator — ROI 계산기 (경제 파라미터 기반 실계산)
// headCount 미지정 + farmId 지정 시 농장 활성 두수 사용
economicsRouter.get('/roi-calculator', requireFarmAccess, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const farmId = (req.query.farmId as string | undefined) || undefined;
    const investmentType = (req.query.investmentType as string) ?? 'sensor';

    let headCount = Number(req.query.headCount);
    if (!Number.isFinite(headCount) || headCount <= 0) {
      if (farmId) {
        const db = getDb();
        const [headResult] = await db
          .select({ count: count() })
          .from(animals)
          .where(and(eq(animals.farmId, farmId), eq(animals.status, 'active')));
        headCount = headResult?.count ?? 0;
      }
      if (!Number.isFinite(headCount) || headCount <= 0) headCount = 50;
    }

    const params = await getEconomicParamValues(farmId);
    const roi = computeSensorRoi(headCount, params, investmentType);
    if (!roi) {
      throw new BadRequestError('headCount는 1~100,000 범위의 숫자여야 합니다');
    }

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
