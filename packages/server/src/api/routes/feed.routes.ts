// TMR 배합 라우트 — 원료 단가·급여량 → 두당 일 사료비
//
// 경제성 분석의 비용 축: 배합비가 있어야 "수입(유대) - 사료비 = 마진"이 계산된다.
// GET  /feed/programs?farmId=     — 농장 배합 목록 (활성)
// POST /feed/programs             — 생성/수정 (dailyCostPerHead 서버 계산)
// DELETE /feed/programs/:id       — 비활성화 (이력 보존)

import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import { authenticate } from '../middleware/auth.js';
import { requireFarmAccess } from '../middleware/rbac.js';
import { getDb } from '../../config/database.js';
import { feedPrograms } from '../../db/schema.js';
import { and, eq } from 'drizzle-orm';
import { computeDailyFeedCost } from '@cowtalk/shared';
import type { FeedIngredient } from '@cowtalk/shared';
import { BadRequestError, ForbiddenError } from '../../lib/errors.js';

export const feedRouter = Router();

feedRouter.use(authenticate);

const TARGET_GROUPS = new Set(['lactating', 'dry', 'heifer', 'calf']);

/** 농장 쓰기 권한 — 배정 농장의 farmer/vet + 행정관리자 */
function assertFarmWrite(req: Request, farmId: string): void {
  const user = req.user!;
  if (user.role === 'government_admin' || user.isMaster) return;
  const farmIds = user.farmIds ?? [];
  if (!farmIds.includes(farmId)) {
    throw new ForbiddenError('접근 권한이 없는 농장입니다');
  }
}

function validateIngredients(raw: unknown): FeedIngredient[] {
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > 50) {
    throw new BadRequestError('원료는 1~50개 배열이어야 합니다');
  }
  return raw.map((r, i) => {
    const name = typeof (r as { name?: unknown }).name === 'string' ? ((r as { name: string }).name).trim() : '';
    const amountKgPerDay = Number((r as { amountKgPerDay?: unknown }).amountKgPerDay);
    const costPerKg = Number((r as { costPerKg?: unknown }).costPerKg);
    if (!name) throw new BadRequestError(`${i + 1}번 원료: 이름이 필요합니다`);
    if (!Number.isFinite(amountKgPerDay) || amountKgPerDay <= 0 || amountKgPerDay > 100) {
      throw new BadRequestError(`${i + 1}번 원료(${name}): 급여량은 0~100kg/일 범위여야 합니다`);
    }
    if (!Number.isFinite(costPerKg) || costPerKg < 0 || costPerKg > 100000) {
      throw new BadRequestError(`${i + 1}번 원료(${name}): 단가는 0~100,000원/kg 범위여야 합니다`);
    }
    return { name, amountKgPerDay, costPerKg };
  });
}

// GET /feed/programs?farmId=
feedRouter.get('/programs', requireFarmAccess, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const farmId = req.query.farmId as string | undefined;
    if (!farmId) {
      throw new BadRequestError('farmId가 필요합니다');
    }
    const db = getDb();
    const programs = await db
      .select()
      .from(feedPrograms)
      .where(and(eq(feedPrograms.farmId, farmId), eq(feedPrograms.isActive, true)))
      .orderBy(feedPrograms.targetGroup);
    res.json({ success: true, data: programs });
  } catch (error) {
    next(error);
  }
});

// POST /feed/programs — 생성/수정 (programId 있으면 수정)
feedRouter.post('/programs', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { programId, farmId, name, targetGroup, ingredients } = req.body as {
      programId?: string;
      farmId?: string;
      name?: string;
      targetGroup?: string;
      ingredients?: unknown;
    };
    if (!farmId) throw new BadRequestError('farmId가 필요합니다');
    assertFarmWrite(req, farmId);
    if (!name || name.trim().length === 0 || name.length > 200) {
      throw new BadRequestError('배합 이름이 필요합니다 (200자 이내)');
    }
    if (!targetGroup || !TARGET_GROUPS.has(targetGroup)) {
      throw new BadRequestError('targetGroup은 lactating/dry/heifer/calf 중 하나여야 합니다');
    }
    const validated = validateIngredients(ingredients);
    const dailyCostPerHead = computeDailyFeedCost(validated);

    const db = getDb();
    if (programId) {
      const [updated] = await db
        .update(feedPrograms)
        .set({ name: name.trim(), targetGroup, ingredients: validated, dailyCostPerHead, updatedAt: new Date() })
        .where(and(eq(feedPrograms.programId, programId), eq(feedPrograms.farmId, farmId)))
        .returning();
      if (!updated) throw new BadRequestError('수정할 배합을 찾을 수 없습니다');
      res.json({ success: true, data: updated });
      return;
    }

    const [created] = await db
      .insert(feedPrograms)
      .values({
        farmId,
        name: name.trim(),
        targetGroup,
        ingredients: validated,
        dailyCostPerHead,
        createdBy: req.user!.userId,
      })
      .returning();
    res.status(201).json({ success: true, data: created });
  } catch (error) {
    next(error);
  }
});

// DELETE /feed/programs/:id?farmId= — 비활성화
feedRouter.delete('/programs/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const farmId = req.query.farmId as string | undefined;
    if (!farmId) throw new BadRequestError('farmId가 필요합니다');
    assertFarmWrite(req, farmId);
    const db = getDb();
    await db
      .update(feedPrograms)
      .set({ isActive: false, updatedAt: new Date() })
      .where(and(eq(feedPrograms.programId, req.params.id as string), eq(feedPrograms.farmId, farmId)));
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});
