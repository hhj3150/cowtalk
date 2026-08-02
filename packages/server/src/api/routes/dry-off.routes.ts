// 건유 전환 라우트 — /api/dry-off
// 건유 시작, 분만 예정일 자동 계산, 그룹 자동 이동

import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import { authenticate } from '../middleware/auth.js';
import { requirePermission } from '../middleware/rbac.js';
import { getDb } from '../../config/database.js';
import { dryOffRecords, animals, animalGroupMembers, animalGroups } from '../../db/schema.js';
import { eq, and, desc } from 'drizzle-orm';

export const dryOffRouter = Router();

dryOffRouter.use(authenticate);

// POST /dry-off/:animalId — 건유 전환 실행
dryOffRouter.post('/:animalId', requirePermission('animal', 'update'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const db = getDb();
    const animalId = req.params.animalId as string;
    const { dryOffDate, lastMilkingDate, medication, notes, dryOffMethod } = req.body as {
      dryOffDate: string;
      lastMilkingDate?: string;
      medication?: string;
      notes?: string;
      dryOffMethod?: string;
    };

    if (!dryOffDate) {
      res.status(400).json({ success: false, error: '건유 시작일이 필요합니다' });
      return;
    }

    // 개체 존재 확인
    const [animal] = await db
      .select({ animalId: animals.animalId, farmId: animals.farmId, earTag: animals.earTag })
      .from(animals)
      .where(eq(animals.animalId, animalId));

    if (!animal) {
      res.status(404).json({ success: false, error: '개체를 찾을 수 없습니다' });
      return;
    }

    // 분만 예정일 자동 계산 (건유일 + 60일)
    const dryDate = new Date(dryOffDate);
    const expectedCalving = new Date(dryDate.getTime() + 60 * 24 * 60 * 60 * 1000);

    // 건유 기록 생성
    const [record] = await db
      .insert(dryOffRecords)
      .values({
        animalId,
        dryOffDate,
        expectedCalvingDate: expectedCalving.toISOString().slice(0, 10),
        lastMilkingDate: lastMilkingDate ?? dryOffDate,
        dryOffMethod: dryOffMethod ?? 'gradual',
        medication: medication ?? null,
        notes: notes ?? null,
      })
      .returning();

    // animals.lactationStatus → 'dry'
    await db
      .update(animals)
      .set({ lactationStatus: 'dry', updatedAt: new Date() })
      .where(eq(animals.animalId, animalId));

    // 그룹 자동 이동: 착유군 → 건유군 (해당 농장에 건유군이 있으면)
    const [dryGroup] = await db
      .select({ groupId: animalGroups.groupId })
      .from(animalGroups)
      .where(
        and(
          eq(animalGroups.farmId, animal.farmId),
          eq(animalGroups.groupType, 'dry'),
        ),
      );

    if (dryGroup) {
      // 기존 그룹에서 제거
      await db
        .delete(animalGroupMembers)
        .where(eq(animalGroupMembers.animalId, animalId));

      // 건유군에 추가
      await db
        .insert(animalGroupMembers)
        .values({ animalId, groupId: dryGroup.groupId })
        .onConflictDoNothing();
    }

    res.status(201).json({
      success: true,
      data: {
        ...record,
        expectedCalvingDate: expectedCalving.toISOString().slice(0, 10),
        groupMoved: dryGroup ? true : false,
      },
    });
  } catch (error) {
    next(error);
  }
});

// GET /dry-off/farm/:farmId — 농장 건유 기록 목록
dryOffRouter.get('/farm/:farmId', requirePermission('farm', 'read'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const db = getDb();
    const farmId = req.params.farmId as string;

    const records = await db
      .select({
        recordId: dryOffRecords.recordId,
        animalId: dryOffRecords.animalId,
        earTag: animals.earTag,
        name: animals.name,
        dryOffDate: dryOffRecords.dryOffDate,
        expectedCalvingDate: dryOffRecords.expectedCalvingDate,
        lastMilkingDate: dryOffRecords.lastMilkingDate,
        dryOffMethod: dryOffRecords.dryOffMethod,
        medication: dryOffRecords.medication,
        notes: dryOffRecords.notes,
        createdAt: dryOffRecords.createdAt,
      })
      .from(dryOffRecords)
      .innerJoin(animals, eq(dryOffRecords.animalId, animals.animalId))
      .where(eq(animals.farmId, farmId))
      .orderBy(desc(dryOffRecords.dryOffDate))
      .limit(50);

    res.json({ success: true, data: records });
  } catch (error) {
    next(error);
  }
});

// GET /dry-off/:animalId/history — 개체별 건유 이력
dryOffRouter.get('/:animalId/history', requirePermission('animal', 'read'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const db = getDb();
    const animalId = req.params.animalId as string;

    const records = await db
      .select()
      .from(dryOffRecords)
      .where(eq(dryOffRecords.animalId, animalId))
      .orderBy(desc(dryOffRecords.dryOffDate));

    res.json({ success: true, data: records });
  } catch (error) {
    next(error);
  }
});
