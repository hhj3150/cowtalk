// 팅커벨 기억 라우트 — 사용자가 AI의 기억을 보고·고치고·지운다.
//
// 이 화면이 없으면 기억은 블랙박스가 된다. 잘못 기억한 사실이 조용히 답변을 오염시키는 것을
// 사용자가 발견할 방법이 있어야 한다 — 그래서 목록·수정·삭제는 기능이 아니라 신뢰의 전제다.

import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { authenticate } from '../middleware/auth.js';
import { scopedFarmIds } from '../middleware/rbac.js';
import {
  listMemories,
  createManualMemory,
  updateMemory,
  forgetMemoryById,
  runMemoryDecay,
} from '../../chat/memory/memory.service.js';
import { ForbiddenError } from '../../lib/errors.js';
import { getDb } from '../../config/database.js';
import { animals } from '../../db/schema.js';
import { eq } from 'drizzle-orm';

export const memoryRouter = Router();

memoryRouter.use(authenticate);

const MEMORY_CATEGORIES = [
  'farm_fact', 'protocol', 'preference', 'constraint',
  'equipment', 'economics', 'person', 'goal', 'animal_fact',
] as const;

const createSchema = z.object({
  farmId: z.string().uuid().nullable().optional(),
  animalId: z.string().uuid().nullable().optional(),
  category: z.enum(MEMORY_CATEGORIES),
  subject: z.string().min(1).max(120),
  content: z.string().min(4).max(300),
  importance: z.number().int().min(1).max(5).optional(),
});

const updateSchema = z.object({
  subject: z.string().min(1).max(120).optional(),
  content: z.string().min(4).max(300).optional(),
  importance: z.number().int().min(1).max(5).optional(),
});

// GET /memory — 내 스코프의 기억 목록
memoryRouter.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const status = typeof req.query['status'] === 'string' ? req.query['status'] : 'active';
    const rows = await listMemories({
      userId: req.user?.userId ?? null,
      farmIds: scopedFarmIds(req),
      status,
    });
    res.json({ success: true, data: rows });
  } catch (error) {
    next(error);
  }
});

// POST /memory — 기억 직접 추가 (수동 입력은 감쇠 면제)
memoryRouter.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ success: false, error: parsed.error.issues[0]?.message ?? '입력이 올바르지 않습니다' });
      return;
    }
    const body = parsed.data;
    const scope = scopedFarmIds(req);
    if (body.farmId && scope !== null && !scope.includes(body.farmId)) {
      throw new ForbiddenError('해당 농장의 기억을 추가할 권한이 없습니다');
    }
    // 개체 기억은 그 개체가 속한 농장 권한으로 판정된다 — 개체가 지정 농장 소속인지 확인.
    // (확인 없이 저장하면 남의 농장 개체에 기억이 붙고, 그 농장 사람들에게 보인다)
    if (body.animalId) {
      if (!body.farmId) {
        res.status(400).json({ success: false, error: '개체 기억에는 farmId가 함께 필요합니다' });
        return;
      }
      const db = getDb();
      const [animal] = await db
        .select({ farmId: animals.farmId })
        .from(animals)
        .where(eq(animals.animalId, body.animalId))
        .limit(1);
      if (!animal || animal.farmId !== body.farmId) {
        throw new ForbiddenError('해당 개체의 기억을 추가할 권한이 없습니다');
      }
    }

    const memoryId = await createManualMemory({
      userId: req.user!.userId,
      farmId: body.farmId ?? null,
      animalId: body.animalId ?? null,
      category: body.category,
      subject: body.subject,
      content: body.content,
      importance: body.importance ?? 4,
    });
    if (!memoryId) {
      res.status(409).json({ success: false, error: '같은 주제의 기억이 이미 있습니다. 기존 기억을 수정하세요.' });
      return;
    }
    res.status(201).json({ success: true, data: { memoryId } });
  } catch (error) {
    next(error);
  }
});

// PATCH /memory/:id — 기억 수정 (수정은 재확인으로 간주 — 감쇠 시계 리셋)
memoryRouter.patch('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsed = updateSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ success: false, error: parsed.error.issues[0]?.message ?? '입력이 올바르지 않습니다' });
      return;
    }
    const memoryId = String(req.params['id']);
    const ok = await ensureMemoryAccess(req, memoryId);
    if (!ok) {
      res.status(404).json({ success: false, error: '기억을 찾을 수 없습니다' });
      return;
    }
    const updated = await updateMemory(memoryId, parsed.data);
    res.json({ success: updated, data: { memoryId } });
  } catch (error) {
    next(error);
  }
});

// DELETE /memory/:id — 기억 삭제 (soft: status=rejected, 이력 보존)
memoryRouter.delete('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const memoryId = String(req.params['id']);
    const ok = await ensureMemoryAccess(req, memoryId);
    if (!ok) {
      res.status(404).json({ success: false, error: '기억을 찾을 수 없습니다' });
      return;
    }
    const removed = await forgetMemoryById(memoryId);
    res.json({ success: removed, data: { memoryId } });
  } catch (error) {
    next(error);
  }
});

// POST /memory/decay — 감쇠 배치 수동 실행 (운영·검증용)
memoryRouter.post('/decay', async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (req.user?.role !== 'government_admin') {
      throw new ForbiddenError('감쇠 배치는 관리자만 실행할 수 있습니다');
    }
    const result = await runMemoryDecay();
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
});

/** 대상 기억이 이 사용자의 스코프 안에 있는지 — 목록 쿼리를 재사용해 스코프 규칙을 한 곳에 유지 */
async function ensureMemoryAccess(req: Request, memoryId: string): Promise<boolean> {
  const rows = await listMemories({
    userId: req.user?.userId ?? null,
    farmIds: scopedFarmIds(req),
    status: 'all',
    limit: 500,
  });
  return rows.some((r) => r.memoryId === memoryId);
}
