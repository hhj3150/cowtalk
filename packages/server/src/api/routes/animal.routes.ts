// 동물 라우트 — 실제 DB 쿼리

import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import { authenticate } from '../middleware/auth.js';
import { requirePermission } from '../middleware/rbac.js';
import { validate } from '../middleware/validate.js';
import { animalQuerySchema, createAnimalSchema } from '@cowtalk/shared';
import type { Role } from '@cowtalk/shared';
import { getAnimalDetail } from '../../serving/dashboard.service.js';
import { getDb } from '../../config/database.js';
import { animals, farms, smaxtecEvents, breedingEvents, pregnancyChecks, calvingEvents, dryOffRecords, vaccineRecords, vaccineSchedules } from '../../db/schema.js';
import { TraceabilityConnector } from '../../pipeline/connectors/public-data/traceability.connector.js';
import { GradeConnector } from '../../pipeline/connectors/public-data/grade.connector.js';
import { eq, and, sql, desc, count } from 'drizzle-orm';

// 이력추적 커넥터 싱글톤 (매 요청마다 생성하지 않음)
let traceConnector: TraceabilityConnector | null = null;
async function getTraceConnector(): Promise<TraceabilityConnector> {
  if (!traceConnector) {
    traceConnector = new TraceabilityConnector();
    await traceConnector.connect();
  }
  return traceConnector;
}

export const animalRouter = Router();

animalRouter.use(authenticate);

// GET /animals — 동물 목록 (실제 DB)
animalRouter.get('/', requirePermission('animal', 'read'), validate({ query: animalQuerySchema }), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const db = getDb();
    const page = Number(req.query.page) || 1;
    const limit = Math.min(Number(req.query.limit) || 20, 100);
    const offset = (page - 1) * limit;
    const farmId = req.query.farmId as string | undefined;
    const status = (req.query.status as string) || 'active';
    const search = req.query.search as string | undefined;

    const conditions = [eq(animals.status, status)];
    if (farmId) {
      conditions.push(eq(animals.farmId, farmId));
    }
    if (search) {
      conditions.push(
        sql`(${animals.name} ILIKE ${`%${search}%`} OR ${animals.earTag} ILIKE ${`%${search}%`} OR ${animals.traceId} ILIKE ${`%${search}%`})`,
      );
    }

    const animalList = await db
      .select({
        animalId: animals.animalId,
        externalId: animals.externalId,
        farmId: animals.farmId,
        farmName: farms.name,
        earTag: animals.earTag,
        traceId: animals.traceId,
        name: animals.name,
        breed: animals.breed,
        breedType: animals.breedType,
        sex: animals.sex,
        birthDate: animals.birthDate,
        parity: animals.parity,
        daysInMilk: animals.daysInMilk,
        lactationStatus: animals.lactationStatus,
        currentDeviceId: animals.currentDeviceId,
        status: animals.status,
        createdAt: animals.createdAt,
        updatedAt: animals.updatedAt,
      })
      .from(animals)
      .leftJoin(farms, eq(animals.farmId, farms.farmId))
      .where(and(...conditions))
      .orderBy(animals.name)
      .limit(limit)
      .offset(offset);

    const [totalResult] = await db
      .select({ count: count() })
      .from(animals)
      .where(and(...conditions));

    const total = totalResult?.count ?? 0;

    res.json({
      success: true,
      data: animalList,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (error) {
    next(error);
  }
});

// GET /animals/:animalId — 동물 상세 (AI 해석 포함)
animalRouter.get('/:animalId', requirePermission('animal', 'read'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const db = getDb();
    const animalId = req.params.animalId as string;

    // 기본 동물 정보
    const [animal] = await db
      .select({
        animalId: animals.animalId,
        externalId: animals.externalId,
        farmId: animals.farmId,
        farmName: farms.name,
        earTag: animals.earTag,
        traceId: animals.traceId,
        name: animals.name,
        breed: animals.breed,
        breedType: animals.breedType,
        sex: animals.sex,
        birthDate: animals.birthDate,
        parity: animals.parity,
        daysInMilk: animals.daysInMilk,
        lactationStatus: animals.lactationStatus,
        currentDeviceId: animals.currentDeviceId,
        status: animals.status,
      })
      .from(animals)
      .leftJoin(farms, eq(animals.farmId, farms.farmId))
      .where(eq(animals.animalId, animalId));

    if (!animal) {
      res.status(404).json({ success: false, error: '동물을 찾을 수 없습니다' });
      return;
    }

    // 최근 이벤트 (최근 10개)
    const recentEvents = await db
      .select({
        eventId: smaxtecEvents.eventId,
        eventType: smaxtecEvents.eventType,
        confidence: smaxtecEvents.confidence,
        severity: smaxtecEvents.severity,
        detectedAt: smaxtecEvents.detectedAt,
        details: smaxtecEvents.details,
      })
      .from(smaxtecEvents)
      .where(eq(smaxtecEvents.animalId, animalId))
      .orderBy(desc(smaxtecEvents.detectedAt))
      .limit(10);

    // AI 해석은 별도 엔드포인트로 분리 — 프로필 로딩 속도 우선
    res.json({
      success: true,
      data: {
        ...animal,
        recentEvents,
      },
    });
  } catch (error) {
    next(error);
  }
});

animalRouter.post('/', requirePermission('animal', 'create'), validate({ body: createAnimalSchema }), (_req, res) => {
  res.json({ success: true, data: null });
});

animalRouter.patch('/:animalId', requirePermission('animal', 'update'), (_req, res) => {
  res.json({ success: true, data: null });
});

// GET /animals/:animalId/interpretation — AI 해석 (별도 비동기 로드)
animalRouter.get('/:animalId/interpretation', requirePermission('animal', 'read'), async (req: Request, res: Response, _next: NextFunction) => {
  try {
    const animalId = req.params.animalId as string;
    const role = req.user?.role as Role;

    const aiPromise = getAnimalDetail(animalId, role);
    const timeoutPromise = new Promise<null>((resolve) => setTimeout(() => resolve(null), 8000));
    const interpretation = await Promise.race([aiPromise, timeoutPromise]);

    res.json({ success: true, data: interpretation });
  } catch {
    res.json({ success: true, data: null });
  }
});

// GET /animals/:animalId/trace — 축산물이력추적 (이동이력·도축정보)
animalRouter.get('/:animalId/trace', requirePermission('animal', 'read'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const db = getDb();
    const { animalId } = req.params as { animalId: string };

    // DB에서 traceId 조회
    const rows = await db
      .select({ traceId: animals.traceId, earTag: animals.earTag, farmName: farms.name })
      .from(animals)
      .leftJoin(farms, eq(animals.farmId, farms.farmId))
      .where(eq(animals.animalId, animalId))
      .limit(1);

    const row = rows[0];
    if (!row) {
      res.status(404).json({ success: false, message: '개체를 찾을 수 없습니다' });
      return;
    }

    if (!row.traceId) {
      res.json({ success: true, data: { traceId: null, available: false, reason: '이력제 번호 미등록' } });
      return;
    }

    const connector = await getTraceConnector();
    const record = await connector.fetchByTraceId(row.traceId);

    if (!record) {
      // API 키 없거나 조회 실패 → DB 기본 정보 + 이력번호로 fallback 표시
      const [animalInfo] = await db
        .select({
          breed: animals.breed,
          sex: animals.sex,
          birthDate: animals.birthDate,
          farmName: farms.name,
          farmAddress: farms.address,
        })
        .from(animals)
        .leftJoin(farms, eq(animals.farmId, farms.farmId))
        .where(eq(animals.animalId, animalId))
        .limit(1);

      res.json({
        success: true,
        data: {
          traceId: row.traceId,
          earTag: row.earTag,
          available: true,
          source: 'db_fallback',
          birthDate: animalInfo?.birthDate ?? null,
          sex: animalInfo?.sex ?? null,
          breed: animalInfo?.breed ?? null,
          farmName: animalInfo?.farmName ?? null,
          farmAddress: animalInfo?.farmAddress ?? null,
          movements: [],
          slaughterInfo: null,
          vaccinations: [],
          inspections: [],
        },
      });
      return;
    }

    res.json({ success: true, data: { ...record, available: true } });
  } catch (error) {
    next(error);
  }
});

// GET /animals/:animalId/breeding-timeline — 임신 관리 통합 타임라인
animalRouter.get('/:animalId/breeding-timeline', requirePermission('animal', 'read'), async (req: Request, res: Response, _next: NextFunction) => {
  try {
    const db = getDb();
    const animalId = req.params.animalId as string;

    // 번식 이벤트 (수정)
    const inseminations = await db
      .select({
        eventId: breedingEvents.eventId,
        eventDate: breedingEvents.eventDate,
        type: breedingEvents.type,
        semenInfo: breedingEvents.semenInfo,
        notes: breedingEvents.notes,
      })
      .from(breedingEvents)
      .where(eq(breedingEvents.animalId, animalId))
      .orderBy(desc(breedingEvents.eventDate))
      .limit(10);

    // 임신 검사
    const pregChecks = await db
      .select({
        checkId: pregnancyChecks.checkId,
        checkDate: pregnancyChecks.checkDate,
        result: pregnancyChecks.result,
        method: pregnancyChecks.method,
        daysPostInsemination: pregnancyChecks.daysPostInsemination,
        notes: pregnancyChecks.notes,
      })
      .from(pregnancyChecks)
      .where(eq(pregnancyChecks.animalId, animalId))
      .orderBy(desc(pregnancyChecks.checkDate))
      .limit(10);

    // 분만 이력
    const calvings = await db
      .select({
        eventId: calvingEvents.eventId,
        calvingDate: calvingEvents.calvingDate,
        calfSex: calvingEvents.calfSex,
        calfStatus: calvingEvents.calfStatus,
        complications: calvingEvents.complications,
        notes: calvingEvents.notes,
      })
      .from(calvingEvents)
      .where(eq(calvingEvents.animalId, animalId))
      .orderBy(desc(calvingEvents.calvingDate))
      .limit(10);

    // 건유 기록
    const dryOffs = await db
      .select()
      .from(dryOffRecords)
      .where(eq(dryOffRecords.animalId, animalId))
      .orderBy(desc(dryOffRecords.dryOffDate))
      .limit(10);

    // smaXtec 발정 이벤트
    const estrusEvents = await db
      .select({
        eventId: smaxtecEvents.eventId,
        detectedAt: smaxtecEvents.detectedAt,
        eventType: smaxtecEvents.eventType,
        confidence: smaxtecEvents.confidence,
      })
      .from(smaxtecEvents)
      .where(
        and(
          eq(smaxtecEvents.animalId, animalId),
          sql`${smaxtecEvents.eventType} IN ('estrus', 'estrus_dnb', 'heat')`,
        ),
      )
      .orderBy(desc(smaxtecEvents.detectedAt))
      .limit(10);

    // 통합 타임라인 생성 (시간순 정렬)
    interface TimelineEvent {
      readonly id: string;
      readonly type: string;
      readonly date: string;
      readonly label: string;
      readonly details: Record<string, unknown>;
    }

    const timeline: TimelineEvent[] = [];

    for (const e of estrusEvents) {
      timeline.push({
        id: e.eventId,
        type: 'estrus',
        date: e.detectedAt?.toISOString() ?? '',
        label: '발정 감지',
        details: { confidence: e.confidence, eventType: e.eventType },
      });
    }

    for (const e of inseminations) {
      timeline.push({
        id: e.eventId,
        type: 'insemination',
        date: e.eventDate?.toISOString() ?? '',
        label: '수정',
        details: { semenInfo: e.semenInfo, notes: e.notes },
      });
    }

    for (const e of pregChecks) {
      timeline.push({
        id: e.checkId,
        type: 'pregnancy_check',
        date: e.checkDate?.toISOString() ?? '',
        label: `임신 검사 (${e.result === 'positive' ? '양성' : e.result === 'negative' ? '음성' : '불확실'})`,
        details: { result: e.result, method: e.method, daysPostInsemination: e.daysPostInsemination },
      });
    }

    for (const e of dryOffs) {
      timeline.push({
        id: e.recordId,
        type: 'dry_off',
        date: e.dryOffDate ?? '',
        label: '건유 전환',
        details: { expectedCalvingDate: e.expectedCalvingDate, medication: e.medication },
      });
    }

    for (const e of calvings) {
      timeline.push({
        id: e.eventId,
        type: 'calving',
        date: e.calvingDate?.toISOString() ?? '',
        label: '분만',
        details: { calfSex: e.calfSex, calfStatus: e.calfStatus, complications: e.complications },
      });
    }

    // smaXtec 번식 관련 이벤트 (no_insemination 포함)
    const breedingSmxEvents = await db
      .select({
        eventId: smaxtecEvents.eventId,
        detectedAt: smaxtecEvents.detectedAt,
        eventType: smaxtecEvents.eventType,
        confidence: smaxtecEvents.confidence,
        details: smaxtecEvents.details,
      })
      .from(smaxtecEvents)
      .where(
        and(
          eq(smaxtecEvents.animalId, animalId),
          sql`${smaxtecEvents.eventType} IN ('insemination', 'pregnancy_result', 'no_insemination', 'abort', 'dry_off', 'calving_detection', 'calving_confirmation')`,
        ),
      )
      .orderBy(desc(smaxtecEvents.detectedAt))
      .limit(20);

    for (const e of breedingSmxEvents) {
      timeline.push({
        id: e.eventId,
        type: e.eventType,
        date: e.detectedAt?.toISOString() ?? '',
        label: e.eventType,
        details: { confidence: e.confidence, ...(typeof e.details === 'object' && e.details !== null ? e.details as Record<string, unknown> : {}) },
      });
    }

    // 시간 역순 정렬
    timeline.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    // 현재 단계 계산
    const latestInsemination = inseminations[0];
    const latestPregCheck = pregChecks[0];
    const latestDryOff = dryOffs[0];

    let currentStage = 'unknown';
    let nextAction: { stage: string; dueDate: string; daysRemaining: number; message: string } | null = null;

    if (latestInsemination) {
      const insemDate = new Date(latestInsemination.eventDate ?? '');
      const daysSinceInsem = Math.floor((Date.now() - insemDate.getTime()) / (24 * 60 * 60 * 1000));

      if (!latestPregCheck || new Date(latestPregCheck.checkDate ?? '') < insemDate) {
        // 수정 후 임신 검사 미실시
        if (daysSinceInsem >= 30 && daysSinceInsem <= 45) {
          currentStage = 'awaiting_pregnancy_check';
          nextAction = {
            stage: '임신 감정',
            dueDate: new Date(insemDate.getTime() + 35 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
            daysRemaining: 35 - daysSinceInsem,
            message: `수정 후 ${String(daysSinceInsem)}일 경과 — 임신 감정 시기입니다`,
          };
        } else if (daysSinceInsem < 30) {
          currentStage = 'post_insemination';
          nextAction = {
            stage: '임신 감정',
            dueDate: new Date(insemDate.getTime() + 35 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
            daysRemaining: 35 - daysSinceInsem,
            message: `수정 후 ${String(daysSinceInsem)}일 — 임신 감정까지 ${String(35 - daysSinceInsem)}일 남음`,
          };
        }
      } else if (latestPregCheck.result === 'positive') {
        // 임신 확인됨
        if (!latestDryOff || new Date(latestDryOff.dryOffDate ?? '') < insemDate) {
          // 건유 전환 미실시
          const expectedCalving = new Date(insemDate.getTime() + 280 * 24 * 60 * 60 * 1000);
          const daysToCalving = Math.floor((expectedCalving.getTime() - Date.now()) / (24 * 60 * 60 * 1000));

          if (daysToCalving <= 60 && daysToCalving > 0) {
            currentStage = 'awaiting_dry_off';
            nextAction = {
              stage: '건유 전환',
              dueDate: new Date(expectedCalving.getTime() - 60 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
              daysRemaining: daysToCalving - 60 > 0 ? daysToCalving - 60 : 0,
              message: `분만 예정일까지 ${String(daysToCalving)}일 — 건유 전환 시기입니다`,
            };
          } else {
            currentStage = 'pregnant';
            nextAction = {
              stage: '재확인 검사',
              dueDate: new Date(insemDate.getTime() + 60 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
              daysRemaining: Math.max(0, 60 - daysSinceInsem),
              message: `임신 확인됨 — 분만 예정: ${expectedCalving.toISOString().slice(0, 10)}`,
            };
          }
        } else {
          currentStage = 'dry';
          const expectedCalvingDate = latestDryOff.expectedCalvingDate;
          if (expectedCalvingDate) {
            const daysToCalving = Math.floor((new Date(expectedCalvingDate).getTime() - Date.now()) / (24 * 60 * 60 * 1000));
            nextAction = {
              stage: '분만',
              dueDate: expectedCalvingDate,
              daysRemaining: Math.max(0, daysToCalving),
              message: `건유 중 — 분만 예정: ${expectedCalvingDate} (${String(Math.max(0, daysToCalving))}일 후)`,
            };
          }
        }
      }
    }

    res.json({
      success: true,
      data: {
        animalId,
        timeline: timeline.slice(0, 20),
        currentStage,
        nextAction,
      },
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error('[breeding-timeline] degraded fallback:', { animalId: req.params.animalId, msg });
    res.json({
      success: true,
      data: {
        animalId: req.params.animalId,
        timeline: [],
        currentStage: 'unknown',
        nextAction: null,
      },
    });
  }
});

// GET /animals/:animalId/breeding-history — breeding-timeline 별칭 (CowProfilePage 호환)
animalRouter.get('/:animalId/breeding-history', requirePermission('animal', 'read'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const db = getDb();
    const animalId = req.params.animalId as string;

    const inseminations = await db
      .select({
        eventId: breedingEvents.eventId,
        eventDate: breedingEvents.eventDate,
        type: breedingEvents.type,
        semenInfo: breedingEvents.semenInfo,
        notes: breedingEvents.notes,
      })
      .from(breedingEvents)
      .where(eq(breedingEvents.animalId, animalId))
      .orderBy(desc(breedingEvents.eventDate))
      .limit(20);

    const pregChecks = await db
      .select({
        checkId: pregnancyChecks.checkId,
        checkDate: pregnancyChecks.checkDate,
        result: pregnancyChecks.result,
        method: pregnancyChecks.method,
        notes: pregnancyChecks.notes,
      })
      .from(pregnancyChecks)
      .where(eq(pregnancyChecks.animalId, animalId))
      .orderBy(desc(pregnancyChecks.checkDate))
      .limit(20);

    const calvings = await db
      .select({
        eventId: calvingEvents.eventId,
        calvingDate: calvingEvents.calvingDate,
        calfSex: calvingEvents.calfSex,
        calfStatus: calvingEvents.calfStatus,
        notes: calvingEvents.notes,
      })
      .from(calvingEvents)
      .where(eq(calvingEvents.animalId, animalId))
      .orderBy(desc(calvingEvents.calvingDate))
      .limit(20);

    res.json({
      success: true,
      data: {
        inseminations,
        pregnancyChecks: pregChecks,
        calvings,
      },
    });
  } catch (error) {
    next(error);
  }
});

// GET /animals/:animalId/vaccine-history — 백신접종이력 + 방역검사 통합 조회
// 공공데이터(이력추적) + 로컬 DB(접종기록) 병합
animalRouter.get('/:animalId/vaccine-history', requirePermission('animal', 'read'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const db = getDb();
    const { animalId } = req.params as { animalId: string };

    // DB에서 traceId + farmId 조회
    const [animalRow] = await db
      .select({ traceId: animals.traceId, farmId: animals.farmId, earTag: animals.earTag })
      .from(animals)
      .where(eq(animals.animalId, animalId))
      .limit(1);

    if (!animalRow) {
      res.status(404).json({ success: false, error: '개체를 찾을 수 없습니다' });
      return;
    }

    // 1) 공공데이터: 이력추적 API (백신접종 + 방역검사)
    let publicVaccinations: readonly { date: string; order: string; daysSince: string }[] = [];
    let publicInspections: readonly { inspectDate: string; result: string; tbcInspectDate: string; tbcResult: string }[] = [];

    if (animalRow.traceId) {
      try {
        const connector = await getTraceConnector();
        const traceData = await connector.fetchByTraceId(animalRow.traceId);
        if (traceData) {
          publicVaccinations = traceData.vaccinations;
          publicInspections = traceData.inspections;
        }
      } catch (err) {
        // 공공데이터 실패해도 로컬 데이터는 반환
        publicVaccinations = [];
        publicInspections = [];
      }
    }

    // 2) 로컬 DB: CowTalk 자체 접종 기록
    const localRecords = await db
      .select({
        recordId: vaccineRecords.recordId,
        vaccineName: vaccineRecords.vaccineName,
        batchNumber: vaccineRecords.batchNumber,
        administeredAt: vaccineRecords.administeredAt,
        notes: vaccineRecords.notes,
      })
      .from(vaccineRecords)
      .where(eq(vaccineRecords.animalId, animalId))
      .orderBy(desc(vaccineRecords.administeredAt));

    // 3) 로컬 DB: 백신 스케줄
    const schedules = await db
      .select({
        scheduleId: vaccineSchedules.scheduleId,
        vaccineName: vaccineSchedules.vaccineName,
        scheduledDate: vaccineSchedules.scheduledDate,
        status: vaccineSchedules.status,
        notes: vaccineSchedules.notes,
      })
      .from(vaccineSchedules)
      .where(eq(vaccineSchedules.animalId, animalId))
      .orderBy(vaccineSchedules.scheduledDate);

    res.json({
      success: true,
      data: {
        animalId,
        traceId: animalRow.traceId,
        earTag: animalRow.earTag,
        publicData: {
          vaccinations: publicVaccinations,
          inspections: publicInspections,
        },
        localRecords,
        schedules,
      },
    });
  } catch (error) {
    next(error);
  }
});

// GET /animals/:animalId/grade — 축산물등급판정 결과 조회
let gradeConnector: GradeConnector | null = null;
async function getGradeConnector(): Promise<GradeConnector> {
  if (!gradeConnector) {
    gradeConnector = new GradeConnector();
    await gradeConnector.connect();
  }
  return gradeConnector;
}

animalRouter.get('/:animalId/grade', requirePermission('animal', 'read'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const db = getDb();
    const { animalId } = req.params as { animalId: string };

    const [animal] = await db
      .select({ traceId: animals.traceId })
      .from(animals)
      .where(eq(animals.animalId, animalId))
      .limit(1);

    if (!animal?.traceId) {
      res.json({ success: true, data: { available: false, reason: '이력제 번호 미등록' } });
      return;
    }

    const connector = await getGradeConnector();
    const grade = await connector.fetchGradeByTraceId(animal.traceId);

    if (!grade) {
      res.json({ success: true, data: { available: false, traceId: animal.traceId, reason: '등급판정 결과 없음 (미출하 또는 API 미응답)' } });
      return;
    }

    res.json({ success: true, data: { ...grade, available: true } });
  } catch (error) {
    next(error);
  }
});
