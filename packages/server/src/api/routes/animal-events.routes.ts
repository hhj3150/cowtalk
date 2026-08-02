// 개체 이벤트 통합 CRUD
// GET  /animal-events/:animalId        — 개체별 이벤트 목록
// POST /animal-events/:animalId        — 이벤트 기록 + 사이드이펙트

import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import { eq, and, desc } from 'drizzle-orm';
import { z } from 'zod';
import { authenticate } from '../middleware/auth.js';
import { getDb } from '../../config/database.js';
import { animalEvents, animals } from '../../db/schema.js';

export const animalEventsRouter = Router();

animalEventsRouter.use(authenticate);

// ── 이벤트 타입별 details 스키마 ──

const CalvingDetails = z.object({
  calfSex:        z.enum(['female', 'male', 'unknown']).default('unknown'),
  calfStatus:     z.enum(['alive', 'stillborn', 'weak']).default('alive'),
  calfEarTag:     z.string().max(50).optional(),
  complications:  z.string().max(500).optional(),
  calvingEase:    z.coerce.number().int().min(1).max(5).optional(), // 1=쉬움 5=난산
});

const InseminationDetails = z.object({
  semenId:        z.string().max(100).optional(),
  semenBull:      z.string().max(100).optional(),
  technicianName: z.string().max(100).optional(),
  heatScore:      z.coerce.number().int().min(0).max(3).optional(),
  method:         z.enum(['fresh', 'frozen', 'sexed']).default('frozen'),
});

const PregnancyCheckDetails = z.object({
  result:               z.enum(['pregnant', 'open', 'uncertain']),
  method:               z.enum(['rectal', 'ultrasound']).default('rectal'),
  daysPostInsemination: z.coerce.number().int().optional(),
  fetusAge:             z.coerce.number().int().optional(), // 태령(일)
});

const TreatmentDetails = z.object({
  diagnosis:    z.string().max(200),
  medications:  z.array(z.object({
    name: z.string().max(100),
    dose: z.string().max(50).optional(),
    route: z.string().max(50).optional(),
  })).default([]),
  vetName:       z.string().max(100).optional(),
  withdrawalDays: z.coerce.number().int().min(0).default(0), // 휴약기간
  bodyTemp:       z.coerce.number().optional(),
});

const DryOffDetails = z.object({
  dryOffReason:        z.string().max(200).optional(),
  expectedCalvingDate: z.string().optional(), // ISO date
  milkYieldAtDryOff:   z.coerce.number().optional(), // L/day
});

const DhiDetails = z.object({
  milkKg:      z.coerce.number().optional(),
  fatPct:      z.coerce.number().optional(),
  proteinPct:  z.coerce.number().optional(),
  scc:         z.coerce.number().int().optional(), // 체세포수 (천 개/mL)
  urea:        z.coerce.number().optional(),
  dim:         z.coerce.number().int().optional(),
});

const CullDetails = z.object({
  reason:      z.enum(['disease', 'injury', 'low_production', 'age', 'reproductive', 'other']),
  destination: z.enum(['slaughter', 'sold', 'euthanasia', 'death']).default('slaughter'),
  weight:      z.coerce.number().optional(), // kg
  price:       z.coerce.number().optional(), // 원
});

const VaccinationDetails = z.object({
  vaccineName:  z.string().max(100),
  vaccineType:  z.string().max(100).optional(),
  batchNo:      z.string().max(50).optional(),
  doseCount:    z.coerce.number().int().min(1).default(1),
  nextDueDate:  z.string().optional(), // ISO date
});

const HerdMoveDetails = z.object({
  fromGroup: z.string().max(100).optional(),
  toGroup:   z.string().max(100),
  reason:    z.string().max(200).optional(),
});

const DETAILS_SCHEMA: Record<string, z.ZodType> = {
  calving:          CalvingDetails,
  insemination:     InseminationDetails,
  pregnancy_check:  PregnancyCheckDetails,
  treatment:        TreatmentDetails,
  dry_off:          DryOffDetails,
  dhi:              DhiDetails,
  cull:             CullDetails,
  vaccination:      VaccinationDetails,
  herd_move:        HerdMoveDetails,
};

const EventCreateSchema = z.object({
  eventType:       z.enum(['calving','insemination','pregnancy_check','treatment','dry_off','dhi','cull','vaccination','herd_move']),
  eventDate:       z.string().datetime({ offset: true }).or(z.string().date()),
  notes:           z.string().max(1000).optional(),
  recordedByName:  z.string().max(100).optional(),
  details:         z.record(z.unknown()).default({}),
});

// ── GET /:animalId ──

animalEventsRouter.get('/:animalId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const db = getDb();
    const { animalId } = req.params as { animalId: string };
    const limit = Math.min(Number(req.query.limit) || 50, 200);
    const offset = Number(req.query.offset) || 0;
    const typeFilter = req.query.eventType as string | undefined;

    const conditions = [eq(animalEvents.animalId, animalId)];
    if (typeFilter) {
      conditions.push(eq(animalEvents.eventType, typeFilter));
    }

    const rows = await db
      .select()
      .from(animalEvents)
      .where(and(...conditions))
      .orderBy(desc(animalEvents.eventDate))
      .limit(limit)
      .offset(offset);

    res.json({ success: true, data: rows });
  } catch (error) {
    next(error);
  }
});

// ── POST /:animalId ──

animalEventsRouter.post('/:animalId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const db = getDb();
    const { animalId } = req.params as { animalId: string };
    const userId = req.user!.userId;

    // 개체 존재 확인 + farmId 취득
    const [animal] = await db
      .select({ farmId: animals.farmId, status: animals.status, parity: animals.parity })
      .from(animals)
      .where(eq(animals.animalId, animalId));

    if (!animal) {
      res.status(404).json({ success: false, error: '개체를 찾을 수 없습니다' });
      return;
    }

    // 입력 검증
    const parsed = EventCreateSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ success: false, error: parsed.error.flatten().fieldErrors });
      return;
    }

    const { eventType, eventDate, notes, recordedByName, details } = parsed.data;

    // details 타입별 검증
    const detailsSchema = DETAILS_SCHEMA[eventType];
    const detailsParsed = detailsSchema ? detailsSchema.safeParse(details) : { success: true, data: details };
    if (!detailsParsed.success) {
      res.status(400).json({ success: false, error: 'details 필드 오류', detail: (detailsParsed as { success: false; error: z.ZodError }).error.flatten() });
      return;
    }

    const [created] = await db
      .insert(animalEvents)
      .values({
        animalId,
        farmId: animal.farmId,
        eventType,
        eventDate: new Date(eventDate),
        recordedBy: userId,
        recordedByName: recordedByName ?? null,
        details: detailsParsed.data as Record<string, unknown>,
        notes: notes ?? null,
      })
      .returning();

    // ── 사이드이펙트 ──
    if (eventType === 'calving') {
      // 산차 +1, 착유우로 상태 변경
      await db
        .update(animals)
        .set({ parity: (animal.parity ?? 0) + 1, lactationStatus: 'milking', daysInMilk: 0 })
        .where(eq(animals.animalId, animalId));
    } else if (eventType === 'dry_off') {
      await db
        .update(animals)
        .set({ lactationStatus: 'dry' })
        .where(eq(animals.animalId, animalId));
    } else if (eventType === 'cull') {
      await db
        .update(animals)
        .set({ status: 'culled' })
        .where(eq(animals.animalId, animalId));
    }

    res.status(201).json({ success: true, data: created });
  } catch (error) {
    next(error);
  }
});
