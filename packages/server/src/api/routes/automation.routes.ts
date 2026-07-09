// 자동화 룰 라우트 — 알람→조치 룰 CRUD + 실행 이력
// 스코프: 농장주는 소속 농장 룰만, 관리 역할은 전체. 도구는 AUTOMATABLE_TOOLS 허용 목록만.

import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { authenticate } from '../middleware/auth.js';
import { scopedFarmIds } from '../middleware/rbac.js';
import { getDb } from '../../config/database.js';
import { animals, automationRules, automationRuleRuns } from '../../db/schema.js';
import { and, desc, eq, inArray, isNull, or, type SQL } from 'drizzle-orm';
import { AUTOMATABLE_TOOLS } from '../../services/automation/rule-engine.service.js';
import { ROLE_TOOL_ACCESS } from '../../ai-brain/tools/tool-gateway.js';

export const automationRouter = Router();

automationRouter.use(authenticate);

const triggerSchema = z.object({
  source: z.enum(['alert', 'smaxtec_event']),
  eventTypes: z.array(z.string().min(1).max(60)).max(20),
  minPriority: z.enum(['low', 'medium', 'high', 'critical']).optional(),
  minConfidence: z.number().min(0).max(1).optional(),
});

const actionSchema = z.object({
  toolName: z.string().min(1),
  params: z.record(z.string(), z.union([z.string().max(500), z.number(), z.boolean()])),
});

const createRuleSchema = z.object({
  farmId: z.string().uuid().nullable().optional(),
  name: z.string().min(2).max(200),
  description: z.string().max(1000).nullable().optional(),
  trigger: triggerSchema,
  action: actionSchema,
  cooldownHours: z.number().int().min(1).max(24 * 30).optional(),
});

const updateRuleSchema = z.object({
  name: z.string().min(2).max(200).optional(),
  description: z.string().max(1000).nullable().optional(),
  enabled: z.boolean().optional(),
  trigger: triggerSchema.optional(),
  action: actionSchema.optional(),
  cooldownHours: z.number().int().min(1).max(24 * 30).optional(),
});

/** 액션 도구 검증 — 허용 목록 + 생성자 역할의 도구 접근권 (거부될 룰을 만들지 않게) */
function validateActionTool(toolName: string, role: string): string | null {
  if (!AUTOMATABLE_TOOLS.includes(toolName)) {
    return `자동화에 허용되지 않는 도구입니다: ${toolName} (허용: ${AUTOMATABLE_TOOLS.join(', ')})`;
  }
  const allowed = ROLE_TOOL_ACCESS[role];
  if (allowed && !allowed.includes(toolName)) {
    return `역할 '${role}'은 '${toolName}' 도구를 사용할 수 없습니다.`;
  }
  return null;
}

/** 룰 스코프 조건 — 농장주는 소속 농장 룰 + 본인 생성 룰만 */
function ruleScopeCondition(req: Request): SQL | undefined {
  const scope = scopedFarmIds(req);
  if (scope === null) return undefined; // 관리 역할 — 전체
  return or(
    inArray(automationRules.farmId, [...scope]),
    eq(automationRules.createdBy, req.user!.userId),
  );
}

// GET /automation/rules — 룰 목록
automationRouter.get('/rules', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const db = getDb();
    const condition = ruleScopeCondition(req);
    const rows = await db
      .select()
      .from(automationRules)
      .where(condition)
      .orderBy(desc(automationRules.createdAt))
      .limit(200);
    res.json({ success: true, data: rows });
  } catch (error) {
    next(error);
  }
});

// POST /automation/rules — 룰 생성
automationRouter.post('/rules', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsed = createRuleSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ success: false, error: parsed.error.issues[0]?.message ?? '잘못된 요청입니다' });
      return;
    }
    const body = parsed.data;
    const role = req.user!.role;

    const toolError = validateActionTool(body.action.toolName, role);
    if (toolError) {
      res.status(400).json({ success: false, error: toolError });
      return;
    }

    // 농장 스코프: 배정 스코프가 있으면 farmId 필수 + 스코프 내
    const scope = scopedFarmIds(req);
    const farmId = body.farmId ?? null;
    if (scope !== null) {
      if (!farmId) {
        res.status(400).json({ success: false, error: '농장을 지정해야 합니다.' });
        return;
      }
      if (!scope.includes(farmId)) {
        res.status(403).json({ success: false, error: '소속 농장에만 룰을 만들 수 있습니다.' });
        return;
      }
    }

    const db = getDb();
    const [created] = await db
      .insert(automationRules)
      .values({
        farmId,
        name: body.name,
        description: body.description ?? null,
        trigger: body.trigger,
        action: body.action,
        cooldownHours: body.cooldownHours ?? 24,
        createdBy: req.user!.userId,
        actorRole: role,
      })
      .returning();
    res.status(201).json({ success: true, data: created });
  } catch (error) {
    next(error);
  }
});

// PATCH /automation/rules/:ruleId — 수정 (생성자 또는 행정관)
automationRouter.patch('/rules/:ruleId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const ruleId = req.params.ruleId as string;
    const parsed = updateRuleSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ success: false, error: parsed.error.issues[0]?.message ?? '잘못된 요청입니다' });
      return;
    }
    const body = parsed.data;

    const db = getDb();
    const [rule] = await db.select().from(automationRules).where(eq(automationRules.ruleId, ruleId)).limit(1);
    if (!rule) {
      res.status(404).json({ success: false, error: '룰을 찾을 수 없습니다.' });
      return;
    }
    const isOwner = rule.createdBy === req.user!.userId;
    if (!isOwner && req.user!.role !== 'government_admin') {
      res.status(403).json({ success: false, error: '본인이 만든 룰만 수정할 수 있습니다.' });
      return;
    }
    if (body.action) {
      // 액션 변경 시 룰의 실행 역할(actorRole) 기준으로 재검증
      const toolError = validateActionTool(body.action.toolName, rule.actorRole);
      if (toolError) {
        res.status(400).json({ success: false, error: toolError });
        return;
      }
    }

    const [updated] = await db
      .update(automationRules)
      .set({
        ...(body.name !== undefined ? { name: body.name } : {}),
        ...(body.description !== undefined ? { description: body.description } : {}),
        ...(body.enabled !== undefined ? { enabled: body.enabled } : {}),
        ...(body.trigger !== undefined ? { trigger: body.trigger } : {}),
        ...(body.action !== undefined ? { action: body.action } : {}),
        ...(body.cooldownHours !== undefined ? { cooldownHours: body.cooldownHours } : {}),
        updatedAt: new Date(),
      })
      .where(eq(automationRules.ruleId, ruleId))
      .returning();
    res.json({ success: true, data: updated });
  } catch (error) {
    next(error);
  }
});

// DELETE /automation/rules/:ruleId — 삭제 (생성자 또는 행정관, 실행 기록도 cascade)
automationRouter.delete('/rules/:ruleId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const ruleId = req.params.ruleId as string;
    const db = getDb();
    const [rule] = await db.select().from(automationRules).where(eq(automationRules.ruleId, ruleId)).limit(1);
    if (!rule) {
      res.status(404).json({ success: false, error: '룰을 찾을 수 없습니다.' });
      return;
    }
    if (rule.createdBy !== req.user!.userId && req.user!.role !== 'government_admin') {
      res.status(403).json({ success: false, error: '본인이 만든 룰만 삭제할 수 있습니다.' });
      return;
    }
    await db.delete(automationRules).where(eq(automationRules.ruleId, ruleId));
    res.json({ success: true, data: { ruleId } });
  } catch (error) {
    next(error);
  }
});

// GET /automation/runs?ruleId=&limit= — 실행 이력 (룰명·귀표 조인)
automationRouter.get('/runs', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const db = getDb();
    const ruleId = typeof req.query.ruleId === 'string' && req.query.ruleId ? req.query.ruleId : null;
    const limitRaw = Number(req.query.limit);
    const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(limitRaw, 200) : 50;

    const scope = scopedFarmIds(req);
    const conditions: SQL[] = [];
    if (ruleId) conditions.push(eq(automationRuleRuns.ruleId, ruleId));
    if (scope !== null) {
      conditions.push(or(
        inArray(automationRuleRuns.farmId, [...scope]),
        isNull(automationRuleRuns.farmId),
      )!);
    }

    const rows = await db
      .select({
        runId: automationRuleRuns.runId,
        ruleId: automationRuleRuns.ruleId,
        ruleName: automationRules.name,
        sourceType: automationRuleRuns.sourceType,
        sourceId: automationRuleRuns.sourceId,
        animalId: automationRuleRuns.animalId,
        earTag: animals.earTag,
        farmId: automationRuleRuns.farmId,
        status: automationRuleRuns.status,
        resultSummary: automationRuleRuns.resultSummary,
        executedAt: automationRuleRuns.executedAt,
      })
      .from(automationRuleRuns)
      .leftJoin(automationRules, eq(automationRuleRuns.ruleId, automationRules.ruleId))
      .leftJoin(animals, eq(automationRuleRuns.animalId, animals.animalId))
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(automationRuleRuns.executedAt))
      .limit(limit);

    res.json({ success: true, data: rows });
  } catch (error) {
    next(error);
  }
});
