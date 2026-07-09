// 온톨로지 그래프 라우트 — 관계의 단일 조회 계층
// GET /ontology/graph?anchor=animal:<id>|farm:<id>&days=90

import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import { authenticate } from '../middleware/auth.js';
import { scopedFarmIds } from '../middleware/rbac.js';
import { resolveAnimalGraph, resolveFarmGraph } from '../../services/ontology/graph-resolver.service.js';
import { getDb } from '../../config/database.js';
import { animals } from '../../db/schema.js';
import { eq } from 'drizzle-orm';

export const ontologyRouter = Router();

ontologyRouter.use(authenticate);

ontologyRouter.get('/graph', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const anchor = typeof req.query.anchor === 'string' ? req.query.anchor : '';
    const [kind, entityId] = anchor.split(':');
    if (!entityId || (kind !== 'animal' && kind !== 'farm')) {
      res.status(400).json({ success: false, error: 'anchor는 animal:<id> 또는 farm:<id> 형식이어야 합니다' });
      return;
    }

    const daysRaw = Number(req.query.days);
    const windowDays = Number.isFinite(daysRaw) && daysRaw > 0 ? daysRaw : 90;

    // 농장 스코핑 — 소속 농장 밖 개체/농장 그래프 열람 차단 (광역 역할은 scope=null → 전체)
    const scope = scopedFarmIds(req);
    if (scope !== null) {
      const targetFarmId = kind === 'farm'
        ? entityId
        : (await getDb()
            .select({ farmId: animals.farmId })
            .from(animals)
            .where(eq(animals.animalId, entityId))
            .limit(1))[0]?.farmId;
      if (!targetFarmId || !scope.includes(targetFarmId)) {
        res.status(403).json({ success: false, error: '해당 대상에 대한 접근 권한이 없습니다' });
        return;
      }
    }

    const graph = kind === 'animal'
      ? await resolveAnimalGraph(entityId, { windowDays })
      : await resolveFarmGraph(entityId, { windowDays });

    if (!graph) {
      res.status(404).json({ success: false, error: '대상을 찾을 수 없습니다' });
      return;
    }

    res.json({ success: true, data: graph });
  } catch (error) {
    next(error);
  }
});
