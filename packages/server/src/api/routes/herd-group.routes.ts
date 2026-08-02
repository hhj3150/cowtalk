// 우군 그룹 관리 라우트 — /api/herd-groups
// 착유군, 건유군, 임신군 등 그룹 CRUD + 개체 멤버십 + 그룹 요약

import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import { authenticate } from '../middleware/auth.js';
import { requirePermission } from '../middleware/rbac.js';
import { getDb } from '../../config/database.js';
import { animalGroups, animalGroupMembers, animals, smaxtecEvents } from '../../db/schema.js';
import { eq, and, count, inArray, gte, desc, sql } from 'drizzle-orm';

export const herdGroupRouter = Router();

herdGroupRouter.use(authenticate);

// GET /herd-groups/farm/:farmId — 농장의 전체 그룹 목록 + 두수
herdGroupRouter.get('/farm/:farmId', requirePermission('farm', 'read'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const db = getDb();
    const farmId = req.params.farmId as string;

    const groups = await db
      .select({
        groupId: animalGroups.groupId,
        name: animalGroups.name,
        groupType: animalGroups.groupType,
        description: animalGroups.description,
        sortOrder: animalGroups.sortOrder,
        memberCount: count(animalGroupMembers.animalId),
      })
      .from(animalGroups)
      .leftJoin(animalGroupMembers, eq(animalGroups.groupId, animalGroupMembers.groupId))
      .where(eq(animalGroups.farmId, farmId))
      .groupBy(animalGroups.groupId)
      .orderBy(animalGroups.sortOrder);

    res.json({ success: true, data: groups });
  } catch (error) {
    next(error);
  }
});

// POST /herd-groups/farm/:farmId — 그룹 생성
herdGroupRouter.post('/farm/:farmId', requirePermission('farm', 'update'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const db = getDb();
    const farmId = req.params.farmId as string;
    const { name, groupType, description } = req.body as {
      name: string;
      groupType?: string;
      description?: string;
    };

    if (!name || name.trim().length === 0) {
      res.status(400).json({ success: false, error: '그룹 이름이 필요합니다' });
      return;
    }

    const [group] = await db
      .insert(animalGroups)
      .values({
        farmId,
        name: name.trim(),
        groupType: groupType ?? 'custom',
        description: description ?? null,
      })
      .returning();

    res.status(201).json({ success: true, data: group });
  } catch (error) {
    next(error);
  }
});

// PATCH /herd-groups/:groupId — 그룹 수정
herdGroupRouter.patch('/:groupId', requirePermission('farm', 'update'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const db = getDb();
    const groupId = req.params.groupId as string;
    const { name, description, sortOrder } = req.body as {
      name?: string;
      description?: string;
      sortOrder?: number;
    };

    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (name !== undefined) updates.name = name.trim();
    if (description !== undefined) updates.description = description;
    if (sortOrder !== undefined) updates.sortOrder = sortOrder;

    const [updated] = await db
      .update(animalGroups)
      .set(updates)
      .where(eq(animalGroups.groupId, groupId))
      .returning();

    if (!updated) {
      res.status(404).json({ success: false, error: '그룹을 찾을 수 없습니다' });
      return;
    }

    res.json({ success: true, data: updated });
  } catch (error) {
    next(error);
  }
});

// DELETE /herd-groups/:groupId — 그룹 삭제
herdGroupRouter.delete('/:groupId', requirePermission('farm', 'update'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const db = getDb();
    const groupId = req.params.groupId as string;

    // 멤버 먼저 삭제
    await db.delete(animalGroupMembers).where(eq(animalGroupMembers.groupId, groupId));
    await db.delete(animalGroups).where(eq(animalGroups.groupId, groupId));

    res.json({ success: true, data: { deleted: true } });
  } catch (error) {
    next(error);
  }
});

// POST /herd-groups/:groupId/members — 개체 추가
herdGroupRouter.post('/:groupId/members', requirePermission('animal', 'update'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const db = getDb();
    const groupId = req.params.groupId as string;
    const { animalIds } = req.body as { animalIds: string[] };

    if (!animalIds || animalIds.length === 0) {
      res.status(400).json({ success: false, error: '개체 ID가 필요합니다' });
      return;
    }

    const values = animalIds.map((animalId) => ({ animalId, groupId }));

    await db
      .insert(animalGroupMembers)
      .values(values)
      .onConflictDoNothing();

    res.json({ success: true, data: { added: animalIds.length } });
  } catch (error) {
    next(error);
  }
});

// POST /herd-groups/:groupId/members/remove — 개체 제거
herdGroupRouter.post('/:groupId/members/remove', requirePermission('animal', 'update'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const db = getDb();
    const groupId = req.params.groupId as string;
    const { animalIds } = req.body as { animalIds: string[] };

    if (!animalIds || animalIds.length === 0) {
      res.status(400).json({ success: false, error: '개체 ID가 필요합니다' });
      return;
    }

    await db
      .delete(animalGroupMembers)
      .where(
        and(
          eq(animalGroupMembers.groupId, groupId),
          inArray(animalGroupMembers.animalId, animalIds),
        ),
      );

    res.json({ success: true, data: { removed: animalIds.length } });
  } catch (error) {
    next(error);
  }
});

// POST /herd-groups/move — 개체 그룹 이동
herdGroupRouter.post('/move', requirePermission('animal', 'update'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const db = getDb();
    const { fromGroupId, toGroupId, animalIds } = req.body as {
      fromGroupId: string;
      toGroupId: string;
      animalIds: string[];
    };

    if (!toGroupId || !animalIds || animalIds.length === 0) {
      res.status(400).json({ success: false, error: '이동 대상 그룹과 개체가 필요합니다' });
      return;
    }

    // 기존 그룹에서 제거
    if (fromGroupId) {
      await db
        .delete(animalGroupMembers)
        .where(
          and(
            eq(animalGroupMembers.groupId, fromGroupId),
            inArray(animalGroupMembers.animalId, animalIds),
          ),
        );
    }

    // 새 그룹에 추가
    const values = animalIds.map((animalId) => ({ animalId, groupId: toGroupId }));
    await db
      .insert(animalGroupMembers)
      .values(values)
      .onConflictDoNothing();

    res.json({ success: true, data: { moved: animalIds.length, toGroupId } });
  } catch (error) {
    next(error);
  }
});

// GET /herd-groups/:groupId/summary — 그룹 요약 대시보드
herdGroupRouter.get('/:groupId/summary', requirePermission('farm', 'read'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const db = getDb();
    const groupId = req.params.groupId as string;
    const last24h = new Date(Date.now() - 24 * 60 * 60 * 1000);

    // 그룹 정보
    const [group] = await db
      .select()
      .from(animalGroups)
      .where(eq(animalGroups.groupId, groupId));

    if (!group) {
      res.status(404).json({ success: false, error: '그룹을 찾을 수 없습니다' });
      return;
    }

    // 소속 개체 목록
    const members = await db
      .select({
        animalId: animals.animalId,
        earTag: animals.earTag,
        name: animals.name,
        parity: animals.parity,
        daysInMilk: animals.daysInMilk,
        lactationStatus: animals.lactationStatus,
        status: animals.status,
      })
      .from(animalGroupMembers)
      .innerJoin(animals, eq(animalGroupMembers.animalId, animals.animalId))
      .where(eq(animalGroupMembers.groupId, groupId))
      .orderBy(animals.earTag);

    const animalIds = members.map((m) => m.animalId);

    // 그룹 내 알림 현황 (24시간)
    let alertStats = { total: 0, critical: 0, high: 0, medium: 0, low: 0 };
    let anomalies: { type: string; count: number }[] = [];

    if (animalIds.length > 0) {
      const alertRows = await db
        .select({
          severity: smaxtecEvents.severity,
          cnt: count(),
        })
        .from(smaxtecEvents)
        .where(
          and(
            inArray(smaxtecEvents.animalId, animalIds),
            gte(smaxtecEvents.detectedAt, last24h),
          ),
        )
        .groupBy(smaxtecEvents.severity);

      for (const row of alertRows) {
        const c = Number(row.cnt);
        alertStats = {
          ...alertStats,
          total: alertStats.total + c,
          [row.severity]: c,
        };
      }

      // 특이 개체: 이벤트 유형별
      const anomalyRows = await db
        .select({
          eventType: smaxtecEvents.eventType,
          uniqueAnimals: sql<number>`COUNT(DISTINCT ${smaxtecEvents.animalId})`,
        })
        .from(smaxtecEvents)
        .where(
          and(
            inArray(smaxtecEvents.animalId, animalIds),
            gte(smaxtecEvents.detectedAt, last24h),
          ),
        )
        .groupBy(smaxtecEvents.eventType)
        .orderBy(desc(sql`COUNT(DISTINCT ${smaxtecEvents.animalId})`))
        .limit(5);

      anomalies = anomalyRows.map((r) => ({
        type: r.eventType,
        count: Number(r.uniqueAnimals),
      }));
    }

    res.json({
      success: true,
      data: {
        group: {
          groupId: group.groupId,
          name: group.name,
          groupType: group.groupType,
          description: group.description,
        },
        members,
        memberCount: members.length,
        alertStats,
        anomalies,
      },
    });
  } catch (error) {
    next(error);
  }
});
