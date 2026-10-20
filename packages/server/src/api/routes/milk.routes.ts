// 유량 기록 라우트 — 경제 레이어 원료 데이터의 첫 쓰기 경로
// POST /milk/records | POST /milk/records/bulk | GET /milk/records/:animalId

import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import { authenticate } from '../middleware/auth.js';
import { requirePermission, scopedFarmIds } from '../middleware/rbac.js';
import { requireAnimalAccess, requireScopedIds } from '../middleware/animal-access.js';
import { recordMilkYield, type RecordMilkYieldInput } from '../../services/milk/milk-record.service.js';
import { getDb } from '../../config/database.js';
import { milkRecords, farmMilkSummary } from '../../db/schema.js';
import { and, eq, gte, desc } from 'drizzle-orm';

export const milkRouter = Router();

/**
 * SEC-09: 클라이언트 본문을 그대로 넘기지 않는다 — 허용 필드만 골라 담고, 허용 목장(allowedFarmIds)은
 * 서버가 계정 권한으로 채운다. 예전엔 본문에 allowedFarmIds 를 넣어 남의 목장 소에 기록할 수 있었다.
 */
export function toMilkInput(raw: unknown, scope: readonly string[] | null): RecordMilkYieldInput {
  const b = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const str = (v: unknown): string | undefined => (typeof v === 'string' && v !== '' ? v : undefined);
  const num = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);
  return {
    animalId: str(b.animalId),
    earTag: str(b.earTag),
    farmId: str(b.farmId),
    yieldL: typeof b.yieldL === 'number' ? b.yieldL : Number.NaN,
    date: str(b.date),
    fat: num(b.fat),
    protein: num(b.protein),
    lactose: num(b.lactose),
    scc: num(b.scc),
    allowedFarmIds: scope,
  };
}

milkRouter.use(authenticate);

// POST /milk/records — 단건 기록 (같은 날짜는 갱신)
milkRouter.post(
  '/records',
  requirePermission('animal', 'update'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await recordMilkYield(toMilkInput(req.body, scopedFarmIds(req)));
      res.status(result.success ? 200 : 400).json({ success: result.success, data: result });
    } catch (error) {
      next(error);
    }
  },
);

// POST /milk/records/bulk — 다두 일괄 기록 (최대 200건)
milkRouter.post(
  '/records/bulk',
  requirePermission('animal', 'update'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { records } = req.body as { records: unknown[] };
      if (!Array.isArray(records) || records.length === 0) {
        res.status(400).json({ success: false, error: 'records 배열이 필요합니다' });
        return;
      }
      if (records.length > 200) {
        res.status(400).json({ success: false, error: '한 번에 최대 200건까지 기록할 수 있습니다' });
        return;
      }
      const results = [];
      const scope = scopedFarmIds(req);
      for (const r of records) {
        results.push(await recordMilkYield(toMilkInput(r, scope)));
      }
      const succeeded = results.filter((r) => r.success).length;
      res.json({
        success: succeeded > 0,
        data: { total: records.length, succeeded, failed: records.length - succeeded, results },
      });
    } catch (error) {
      next(error);
    }
  },
);

// ===========================
// 우군(농장) 단위 기록 — 벌크탱크 기준 평균 성적
// ===========================

function optRange(v: unknown, min: number, max: number): number | null | 'invalid' {
  if (v == null || v === '') return null;
  const n = Number(v);
  if (!Number.isFinite(n) || n < min || n > max) return 'invalid';
  return n;
}

// POST /milk/farm-summary — 우군 일별 기록 (같은 농장+날짜는 갱신)
// body: { farmId, date, milkingCount?, totalYieldL?, avgYieldPerCowL?, avgFat?, avgProtein?, avgLactose?, avgScc?, priceKrwPerL?, note? }
milkRouter.post(
  '/farm-summary',
  requirePermission('animal', 'update'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const b = req.body as Record<string, unknown>;
      const farmId = typeof b.farmId === 'string' ? b.farmId : '';
      const dateStr = typeof b.date === 'string' ? b.date : '';
      if (!farmId || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
        res.status(400).json({ success: false, error: 'farmId와 date(YYYY-MM-DD)가 필요합니다' });
        return;
      }
      // 농장 쓰기 스코프 — 배정 우선 규칙(scopedFarmIds). 예전엔 배정이 걸린 행정관도 모든 농장에 기록 가능했다
      const scope = scopedFarmIds(req);
      if (scope !== null && !scope.includes(farmId)) {
        res.status(403).json({ success: false, error: '접근 권한이 없는 농장입니다' });
        return;
      }

      const fields = {
        milkingCount: optRange(b.milkingCount, 0, 100000),
        totalYieldL: optRange(b.totalYieldL, 0, 1000000),
        avgYieldPerCowL: optRange(b.avgYieldPerCowL, 0, 100),
        avgFat: optRange(b.avgFat, 0, 10),
        avgProtein: optRange(b.avgProtein, 0, 10),
        avgLactose: optRange(b.avgLactose, 0, 10),
        avgScc: optRange(b.avgScc, 0, 10000),
        priceKrwPerL: optRange(b.priceKrwPerL, 0, 100000),
        selfProcessedYieldL: optRange(b.selfProcessedYieldL, 0, 1000000),
      };
      const invalid = Object.entries(fields).filter(([, v]) => v === 'invalid').map(([k]) => k);
      if (invalid.length > 0) {
        res.status(400).json({ success: false, error: `값 범위 이상: ${invalid.join(', ')}` });
        return;
      }
      if (fields.totalYieldL === null && fields.avgYieldPerCowL === null) {
        res.status(400).json({ success: false, error: '총 유량 또는 두당 평균 유량 중 하나는 입력해야 합니다' });
        return;
      }

      // 두당 평균은 파생값 — 총 유량과 착유두수가 있으면 자동 계산 (수기 입력보다 우선)
      if (fields.totalYieldL !== null && typeof fields.milkingCount === 'number' && fields.milkingCount > 0) {
        fields.avgYieldPerCowL = Math.round(((fields.totalYieldL as number) / fields.milkingCount) * 10) / 10;
      }

      const db = getDb();
      const values = {
        farmId,
        date: dateStr,
        milkingCount: fields.milkingCount as number | null,
        totalYieldL: fields.totalYieldL as number | null,
        avgYieldPerCowL: fields.avgYieldPerCowL as number | null,
        avgFat: fields.avgFat as number | null,
        avgProtein: fields.avgProtein as number | null,
        avgLactose: fields.avgLactose as number | null,
        avgScc: fields.avgScc as number | null,
        priceKrwPerL: fields.priceKrwPerL as number | null,
        selfProcessedYieldL: fields.selfProcessedYieldL as number | null,
        note: typeof b.note === 'string' ? b.note.slice(0, 500) : null,
        createdBy: req.user!.userId,
      };

      const [existing] = await db
        .select({ summaryId: farmMilkSummary.summaryId })
        .from(farmMilkSummary)
        .where(and(eq(farmMilkSummary.farmId, farmId), eq(farmMilkSummary.date, dateStr)))
        .limit(1);

      if (existing) {
        await db.update(farmMilkSummary)
          .set({ ...values, updatedAt: new Date() })
          .where(eq(farmMilkSummary.summaryId, existing.summaryId));
      } else {
        await db.insert(farmMilkSummary).values(values);
      }

      res.json({ success: true, data: { farmId, date: dateStr, updated: Boolean(existing) } });
    } catch (error) {
      next(error);
    }
  },
);

// GET /milk/farm-summary?farmId=&days=31 — 우군 기록 조회 (최근순)
milkRouter.get(
  '/farm-summary',
  requirePermission('animal', 'read'),
  requireScopedIds([{ source: 'query', field: 'farmId', kind: 'farm' }]),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const farmId = req.query.farmId as string | undefined;
      if (!farmId) {
        res.status(400).json({ success: false, error: 'farmId가 필요합니다' });
        return;
      }
      const daysRaw = Number(req.query.days);
      const days = Number.isFinite(daysRaw) && daysRaw > 0 ? Math.min(daysRaw, 365) : 31;
      const sinceStr = new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);

      const db = getDb();
      const rows = await db
        .select()
        .from(farmMilkSummary)
        .where(and(eq(farmMilkSummary.farmId, farmId), gte(farmMilkSummary.date, sinceStr)))
        .orderBy(desc(farmMilkSummary.date))
        .limit(365);

      res.json({ success: true, data: rows });
    } catch (error) {
      next(error);
    }
  },
);

// GET /milk/records/:animalId?days=30 — 개체 유량 이력
milkRouter.get(
  '/records/:animalId',
  requirePermission('animal', 'read'),
  requireAnimalAccess(),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const db = getDb();
      const animalId = req.params.animalId as string;
      const daysRaw = Number(req.query.days);
      const days = Number.isFinite(daysRaw) && daysRaw > 0 ? Math.min(daysRaw, 365) : 30;
      const sinceStr = new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);

      const rows = await db
        .select()
        .from(milkRecords)
        .where(and(eq(milkRecords.animalId, animalId), gte(milkRecords.date, sinceStr)))
        .orderBy(desc(milkRecords.date))
        .limit(365);

      res.json({ success: true, data: { animalId, days, records: rows } });
    } catch (error) {
      next(error);
    }
  },
);
