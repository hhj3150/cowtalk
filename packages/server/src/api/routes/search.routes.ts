// 검색 라우트 — 통합 검색 + 자동완성 (실제 DB 쿼리)

import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import { authenticate } from '../middleware/auth.js';
import { getDb } from '../../config/database.js';
import { animals, farms } from '../../db/schema.js';
import { sql, or, eq } from 'drizzle-orm';
import '../../types/express.d.js';

export const searchRouter = Router();

searchRouter.use(authenticate);

// GET /search — 통합 검색
searchRouter.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const db = getDb();
    const query = (req.query.q as string) ?? '';
    const type = req.query.type as string | undefined;
    const limit = Math.min(Number(req.query.limit) || 20, 50);

    if (!query || query.length < 2) {
      res.json({ success: true, data: { animals: [], farms: [], total: 0 } });
      return;
    }

    const pattern = `%${query}%`;

    // 동물 검색
    let animalResults: Array<Record<string, unknown>> = [];
    if (!type || type === 'animal') {
      animalResults = await db
        .select({
          type: sql<string>`'animal'`,
          id: animals.animalId,
          label: sql<string>`COALESCE(${animals.name}, ${animals.earTag})`,
          subLabel: farms.name,
          earTag: animals.earTag,
          farmName: farms.name,
          traceId: animals.traceId,
        })
        .from(animals)
        .leftJoin(farms, eq(animals.farmId, farms.farmId))
        .where(or(
          sql`${animals.name} ILIKE ${pattern}`,
          sql`${animals.earTag} ILIKE ${pattern}`,
          sql`${animals.traceId} ILIKE ${pattern}`,
          sql`${animals.externalId} ILIKE ${pattern}`,
        ))
        .limit(limit);
    }

    // 농장 검색
    let farmResults: Array<Record<string, unknown>> = [];
    if (!type || type === 'farm') {
      farmResults = await db
        .select({
          type: sql<string>`'farm'`,
          id: farms.farmId,
          label: farms.name,
          subLabel: farms.address,
          earTag: sql<string | null>`null`,
          farmName: farms.name,
          traceId: sql<string | null>`null`,
        })
        .from(farms)
        .where(or(
          sql`${farms.name} ILIKE ${pattern}`,
          sql`${farms.address} ILIKE ${pattern}`,
          sql`${farms.ownerName} ILIKE ${pattern}`,
        ))
        .limit(limit);
    }

    res.json({
      success: true,
      data: {
        animals: animalResults,
        farms: farmResults,
        total: animalResults.length + farmResults.length,
      },
    });
  } catch (error) {
    next(error);
  }
});

// GET /search/autocomplete — 자동완성
searchRouter.get('/autocomplete', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const db = getDb();
    const query = (req.query.q as string) ?? '';

    if (query.length < 2) {
      res.json({ success: true, data: [] });
      return;
    }

    const pattern = `%${query}%`;
    const limit = 10;

    // 동물 + 농장 합쳐서 자동완성
    const animalSuggestions = await db
      .select({
        type: sql<string>`'animal'`,
        id: animals.animalId,
        label: sql<string>`COALESCE(${animals.name}, ${animals.earTag})`,
        subLabel: farms.name,
      })
      .from(animals)
      .leftJoin(farms, eq(animals.farmId, farms.farmId))
      .where(or(
        sql`${animals.name} ILIKE ${pattern}`,
        sql`${animals.earTag} ILIKE ${pattern}`,
        sql`${animals.traceId} ILIKE ${pattern}`,
      ))
      .limit(limit);

    const farmSuggestions = await db
      .select({
        type: sql<string>`'farm'`,
        id: farms.farmId,
        label: farms.name,
        subLabel: farms.address,
      })
      .from(farms)
      .where(or(
        sql`${farms.name} ILIKE ${pattern}`,
        sql`${farms.address} ILIKE ${pattern}`,
      ))
      .limit(limit);

    res.json({
      success: true,
      data: [...animalSuggestions, ...farmSuggestions].slice(0, limit),
    });
  } catch (error) {
    next(error);
  }
});
