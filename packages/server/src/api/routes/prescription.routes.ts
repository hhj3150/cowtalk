// 처방전 라우트 — 실제 DB 쿼리

import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import { authenticate } from '../middleware/auth.js';
import { requireRole } from '../middleware/rbac.js';
import { getDb } from '../../config/database.js';
import { prescriptions, prescriptionItems, drugDatabase, users } from '../../db/schema.js';
import { eq, desc } from 'drizzle-orm';

export const prescriptionRouter = Router();

prescriptionRouter.use(authenticate);

// GET /prescriptions/drugs — 약품 카탈로그
prescriptionRouter.get('/drugs', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const db = getDb();

    const drugs = await db
      .select()
      .from(drugDatabase)
      .where(eq(drugDatabase.isActive, true))
      .orderBy(drugDatabase.name);

    res.json({ success: true, data: drugs });
  } catch (error) {
    next(error);
  }
});

// POST /prescriptions — 처방전 생성
prescriptionRouter.post(
  '/',
  requireRole('veterinarian'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const db = getDb();
      const { animalId, farmId, diagnosis, items, notes } = req.body;
      const vetId = req.user!.userId;

      const [prescription] = await db
        .insert(prescriptions)
        .values({
          animalId,
          farmId,
          vetId,
          diagnosis,
          notes: notes ?? null,
          status: 'active',
        })
        .returning();

      if (!prescription) {
        res.status(500).json({ success: false, error: '처방전 생성 실패' });
        return;
      }

      if (items && Array.isArray(items) && items.length > 0) {
        const itemValues = (items as Array<{
          drugId: string;
          dosage: string;
          frequency: string;
          durationDays: number;
          route?: string;
          notes?: string;
        }>).map((item) => ({
          prescriptionId: prescription.prescriptionId,
          drugId: item.drugId,
          dosage: item.dosage,
          frequency: item.frequency,
          durationDays: item.durationDays,
          route: item.route ?? 'oral',
          notes: item.notes ?? null,
        }));

        await db.insert(prescriptionItems).values(itemValues);
      }

      res.status(201).json({ success: true, data: prescription });
    } catch (error) {
      next(error);
    }
  },
);

// GET /prescriptions/animal/:animalId — 개체별 처방 이력
prescriptionRouter.get('/animal/:animalId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const db = getDb();
    const animalId = req.params.animalId as string;

    const prescriptionList = await db
      .select({
        prescriptionId: prescriptions.prescriptionId,
        animalId: prescriptions.animalId,
        farmId: prescriptions.farmId,
        diagnosis: prescriptions.diagnosis,
        vetName: users.name,
        status: prescriptions.status,
        prescribedAt: prescriptions.prescribedAt,
        notes: prescriptions.notes,
      })
      .from(prescriptions)
      .innerJoin(users, eq(prescriptions.vetId, users.userId))
      .where(eq(prescriptions.animalId, animalId))
      .orderBy(desc(prescriptions.prescribedAt));

    const result = await Promise.all(
      prescriptionList.map(async (rx) => {
        const items = await db
          .select({
            itemId: prescriptionItems.itemId,
            drugName: drugDatabase.name,
            dosage: prescriptionItems.dosage,
            frequency: prescriptionItems.frequency,
            durationDays: prescriptionItems.durationDays,
            route: prescriptionItems.route,
            withdrawalMilkDays: drugDatabase.withdrawalMilkDays,
            withdrawalMeatDays: drugDatabase.withdrawalMeatDays,
          })
          .from(prescriptionItems)
          .innerJoin(drugDatabase, eq(prescriptionItems.drugId, drugDatabase.drugId))
          .where(eq(prescriptionItems.prescriptionId, rx.prescriptionId));

        return { ...rx, items };
      }),
    );

    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
});

// GET /prescriptions/:prescriptionId/pdf — 처방전 PDF
prescriptionRouter.get('/:prescriptionId/pdf', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const prescriptionId = req.params.prescriptionId as string;

    // TODO: PDF 생성 구현
    res.json({
      success: true,
      data: { url: `/api/prescriptions/${prescriptionId}/pdf/download`, prescriptionId },
    });
  } catch (error) {
    next(error);
  }
});
