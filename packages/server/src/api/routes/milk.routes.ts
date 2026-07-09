// 유량 기록 라우트 — 경제 레이어 원료 데이터의 첫 쓰기 경로
// POST /milk/records | POST /milk/records/bulk | GET /milk/records/:animalId

import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import { authenticate } from '../middleware/auth.js';
import { requirePermission } from '../middleware/rbac.js';
import { recordMilkYield, type RecordMilkYieldInput } from '../../services/milk/milk-record.service.js';
import { getDb } from '../../config/database.js';
import { milkRecords } from '../../db/schema.js';
import { and, eq, gte, desc } from 'drizzle-orm';

export const milkRouter = Router();

milkRouter.use(authenticate);

// POST /milk/records — 단건 기록 (같은 날짜는 갱신)
milkRouter.post(
  '/records',
  requirePermission('animal', 'update'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await recordMilkYield(req.body as RecordMilkYieldInput);
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
      const { records } = req.body as { records: RecordMilkYieldInput[] };
      if (!Array.isArray(records) || records.length === 0) {
        res.status(400).json({ success: false, error: 'records 배열이 필요합니다' });
        return;
      }
      if (records.length > 200) {
        res.status(400).json({ success: false, error: '한 번에 최대 200건까지 기록할 수 있습니다' });
        return;
      }
      const results = [];
      for (const r of records) {
        results.push(await recordMilkYield(r));
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

// GET /milk/records/:animalId?days=30 — 개체 유량 이력
milkRouter.get(
  '/records/:animalId',
  requirePermission('animal', 'read'),
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
