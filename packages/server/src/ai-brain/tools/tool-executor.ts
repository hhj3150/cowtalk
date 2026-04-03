// 팅커벨 도구 실행기 — tool_use 요청을 받아 DB 쿼리 실행
// 각 도구는 JSON 문자열(최대 4000자)을 반환

import { getDb } from '../../config/database.js';
import {
  animals, farms, smaxtecEvents, breedingEvents,
  pregnancyChecks, sensorDailyAgg, healthEvents, treatments,
} from '../../db/schema.js';
import { eq, and, desc, gte, ilike, inArray, isNull } from 'drizzle-orm';
import { getBreedingPipeline } from '../../services/breeding/breeding-pipeline.service.js';
import {
  getBreedingAdvice,
  recordInsemination,
  recordPregnancyCheck,
} from '../../services/breeding/breeding-advisor.service.js';
import { TraceabilityConnector } from '../../pipeline/connectors/public-data/traceability.connector.js';
import { GradeConnector } from '../../pipeline/connectors/public-data/grade.connector.js';
import { SemenConnector } from '../../pipeline/connectors/public-data/semen.connector.js';
import { computeConceptionStats } from '../../services/breeding/breeding-feedback.service.js';
import { logger } from '../../lib/logger.js';

const MAX_RESULT_LENGTH = 4000;

// ===========================
// 메인 디스패처
// ===========================

export async function executeTool(
  name: string,
  input: Record<string, unknown>,
): Promise<string> {
  const startTime = Date.now();

  try {
    let result: unknown;

    switch (name) {
      case 'query_animal':
        result = await queryAnimal(input);
        break;
      case 'query_animal_events':
        result = await queryAnimalEvents(input);
        break;
      case 'query_farm_summary':
        result = await queryFarmSummary(input);
        break;
      case 'query_breeding_stats':
        result = await queryBreedingStats(input);
        break;
      case 'query_sensor_data':
        result = await querySensorData(input);
        break;
      case 'query_conception_stats':
        result = await handleQueryConceptionStats(input);
        break;
      case 'query_traceability':
        result = await handleQueryTraceability(input);
        break;
      case 'query_grade':
        result = await handleQueryGrade(input);
        break;
      case 'query_auction_prices':
        result = await handleQueryAuctionPrices(input);
        break;
      case 'query_sire_info':
        result = await handleQuerySireInfo(input);
        break;
      case 'record_insemination':
        result = await handleRecordInsemination(input);
        break;
      case 'record_pregnancy_check':
        result = await handleRecordPregnancyCheck(input);
        break;
      case 'recommend_insemination_window':
        result = await handleRecommendInseminationWindow(input);
        break;
      case 'record_treatment':
        result = await handleRecordTreatment(input);
        break;
      case 'get_farm_kpis':
        result = await handleGetFarmKpis(input);
        break;
      default:
        result = { error: `알 수 없는 도구: ${name}` };
    }

    const json = JSON.stringify(result);
    const truncated = json.length > MAX_RESULT_LENGTH
      ? `${json.slice(0, MAX_RESULT_LENGTH)}... (${json.length}자 중 ${MAX_RESULT_LENGTH}자 표시)`
      : json;

    logger.info({ tool: name, durationMs: Date.now() - startTime, resultLength: json.length }, '[ToolExecutor] 도구 실행 완료');
    return truncated;
  } catch (error) {
    logger.error({ tool: name, error }, '[ToolExecutor] 도구 실행 실패');
    return JSON.stringify({ error: `도구 실행 실패: ${error instanceof Error ? error.message : String(error)}` });
  }
}

// ===========================
// 1. 개체 조회
// ===========================

async function queryAnimal(input: Record<string, unknown>): Promise<unknown> {
  const db = getDb();
  const earTag = input.earTag as string | undefined;
  const traceId = input.traceId as string | undefined;
  const animalId = input.animalId as string | undefined;

  if (!earTag && !traceId && !animalId) {
    return { error: '귀번호(earTag), 이력번호(traceId), 또는 animalId 중 하나를 지정하세요.' };
  }

  const conditions = [eq(animals.status, 'active'), isNull(animals.deletedAt)];
  if (animalId) conditions.push(eq(animals.animalId, animalId));
  else if (traceId) conditions.push(eq(animals.traceId, traceId));
  else if (earTag) conditions.push(eq(animals.earTag, earTag));

  const rows = await db
    .select({
      animalId: animals.animalId,
      earTag: animals.earTag,
      traceId: animals.traceId,
      name: animals.name,
      farmId: animals.farmId,
      breed: animals.breed,
      sex: animals.sex,
      parity: animals.parity,
      daysInMilk: animals.daysInMilk,
      lactationStatus: animals.lactationStatus,
      birthDate: animals.birthDate,
    })
    .from(animals)
    .where(and(...conditions))
    .limit(5);

  if (rows.length === 0) return { error: '해당 개체를 찾을 수 없습니다.' };

  const animal = rows[0]!;

  // 농장명
  const farmRow = await db
    .select({ name: farms.name })
    .from(farms)
    .where(eq(farms.farmId, animal.farmId))
    .limit(1);

  // 최근 이벤트 5건
  const recentEvents = await db
    .select({
      eventType: smaxtecEvents.eventType,
      detectedAt: smaxtecEvents.detectedAt,
      severity: smaxtecEvents.severity,
    })
    .from(smaxtecEvents)
    .where(eq(smaxtecEvents.animalId, animal.animalId))
    .orderBy(desc(smaxtecEvents.detectedAt))
    .limit(5);

  return {
    ...animal,
    farmName: farmRow[0]?.name ?? '미상',
    recentEvents: recentEvents.map((e) => ({
      type: e.eventType,
      date: e.detectedAt,
      severity: e.severity,
    })),
    matchCount: rows.length,
  };
}

// ===========================
// 2. 개체 이벤트 이력
// ===========================

async function queryAnimalEvents(input: Record<string, unknown>): Promise<unknown> {
  const db = getDb();
  const animalId = input.animalId as string;
  const eventTypes = input.eventTypes as string[] | undefined;
  const limit = Math.min(Number(input.limit) || 20, 50);

  if (!animalId) return { error: 'animalId는 필수입니다.' };

  const conditions = [eq(smaxtecEvents.animalId, animalId)];
  if (eventTypes && eventTypes.length > 0) {
    conditions.push(inArray(smaxtecEvents.eventType, eventTypes));
  }

  const events = await db
    .select({
      eventType: smaxtecEvents.eventType,
      detectedAt: smaxtecEvents.detectedAt,
      severity: smaxtecEvents.severity,
      confidence: smaxtecEvents.confidence,
      details: smaxtecEvents.details,
    })
    .from(smaxtecEvents)
    .where(and(...conditions))
    .orderBy(desc(smaxtecEvents.detectedAt))
    .limit(limit);

  // 번식 이벤트 보완
  const breedingEvts = await db
    .select({
      type: breedingEvents.type,
      eventDate: breedingEvents.eventDate,
      semenInfo: breedingEvents.semenInfo,
      technicianName: breedingEvents.technicianName,
    })
    .from(breedingEvents)
    .where(eq(breedingEvents.animalId, animalId))
    .orderBy(desc(breedingEvents.eventDate))
    .limit(10);

  // 임신감정 결과
  const pregChecks = await db
    .select({
      result: pregnancyChecks.result,
      checkDate: pregnancyChecks.checkDate,
      method: pregnancyChecks.method,
    })
    .from(pregnancyChecks)
    .where(eq(pregnancyChecks.animalId, animalId))
    .orderBy(desc(pregnancyChecks.checkDate))
    .limit(5);

  return {
    animalId,
    smaxtecEvents: events.map((e) => ({
      type: e.eventType,
      date: e.detectedAt,
      severity: e.severity,
      confidence: e.confidence,
    })),
    breedingEvents: breedingEvts,
    pregnancyChecks: pregChecks,
    totalSmaxtecEvents: events.length,
  };
}

// ===========================
// 3. 농장 요약
// ===========================

async function queryFarmSummary(input: Record<string, unknown>): Promise<unknown> {
  const db = getDb();
  const farmId = input.farmId as string | undefined;
  const farmName = input.farmName as string | undefined;

  let targetFarm: { farmId: string; name: string } | undefined;

  if (farmId) {
    const rows = await db.select({ farmId: farms.farmId, name: farms.name }).from(farms).where(eq(farms.farmId, farmId)).limit(1);
    targetFarm = rows[0];
  } else if (farmName) {
    const rows = await db.select({ farmId: farms.farmId, name: farms.name }).from(farms).where(ilike(farms.name, `%${farmName}%`)).limit(5);
    if (rows.length === 0) return { error: `'${farmName}' 농장을 찾을 수 없습니다.` };
    if (rows.length > 1) return { message: '여러 농장이 검색됨', farms: rows };
    targetFarm = rows[0];
  } else {
    return { error: 'farmId 또는 farmName을 지정하세요.' };
  }

  if (!targetFarm) return { error: '농장을 찾을 수 없습니다.' };

  // 두수
  const animalRows = await db
    .select({ animalId: animals.animalId, sex: animals.sex, lactationStatus: animals.lactationStatus })
    .from(animals)
    .where(and(eq(animals.farmId, targetFarm.farmId), eq(animals.status, 'active'), isNull(animals.deletedAt)));

  const totalHead = animalRows.length;
  const milking = animalRows.filter((a) => a.lactationStatus === 'milking').length;
  const dry = animalRows.filter((a) => a.lactationStatus === 'dry').length;

  // 최근 24시간 알림 수
  const since24h = new Date(Date.now() - 86_400_000);
  const alertRows = await db
    .select({ eventId: smaxtecEvents.eventId })
    .from(smaxtecEvents)
    .where(and(
      eq(smaxtecEvents.farmId, targetFarm.farmId),
      gte(smaxtecEvents.detectedAt, since24h),
    ));

  return {
    farmId: targetFarm.farmId,
    farmName: targetFarm.name,
    totalHead,
    milking,
    dry,
    heifer: totalHead - milking - dry,
    alertsLast24h: alertRows.length,
  };
}

// ===========================
// 4. 번식 통계
// ===========================

async function queryBreedingStats(input: Record<string, unknown>): Promise<unknown> {
  const farmId = input.farmId as string | undefined;

  try {
    const pipeline = await getBreedingPipeline(farmId);
    return {
      farmId: farmId ?? '전체',
      kpis: pipeline.kpis,
      totalAnimals: pipeline.totalAnimals,
      stageDistribution: pipeline.pipeline.map((s) => ({
        stage: s.stage,
        label: s.label,
        count: s.count,
      })),
      urgentActionsCount: pipeline.urgentActions.length,
      topUrgent: pipeline.urgentActions.slice(0, 5).map((a) => ({
        earTag: a.earTag,
        action: a.actionType,
        description: a.description,
      })),
    };
  } catch (error) {
    return { error: `번식 통계 조회 실패: ${error instanceof Error ? error.message : String(error)}` };
  }
}

// ===========================
// 5. 센서 데이터
// ===========================

async function querySensorData(input: Record<string, unknown>): Promise<unknown> {
  const db = getDb();
  const animalId = input.animalId as string;
  const metric = (input.metric as string) || 'temperature';
  const days = Math.min(Number(input.days) || 7, 30);

  if (!animalId) return { error: 'animalId는 필수입니다.' };

  const metricType = metric === 'activity' ? 'act' : 'temp';
  const sinceDate = new Date(Date.now() - days * 86_400_000).toISOString().split('T')[0]!;

  const rows = await db
    .select({
      date: sensorDailyAgg.date,
      avg: sensorDailyAgg.avg,
      min: sensorDailyAgg.min,
      max: sensorDailyAgg.max,
      count: sensorDailyAgg.count,
    })
    .from(sensorDailyAgg)
    .where(and(
      eq(sensorDailyAgg.animalId, animalId),
      eq(sensorDailyAgg.metricType, metricType),
      gte(sensorDailyAgg.date, sinceDate),
    ))
    .orderBy(desc(sensorDailyAgg.date))
    .limit(days);

  if (rows.length === 0) return { animalId, metric, message: '해당 기간 센서 데이터가 없습니다.' };

  return {
    animalId,
    metric,
    unit: metric === 'temperature' ? '°C' : 'index',
    days,
    dataPoints: rows.map((r) => ({
      date: r.date,
      avg: Number(r.avg.toFixed(2)),
      min: Number(r.min.toFixed(2)),
      max: Number(r.max.toFixed(2)),
      readings: r.count,
    })),
  };
}

// ===========================
// 6. 수태율 통계
// ===========================

async function handleQueryConceptionStats(input: Record<string, unknown>): Promise<unknown> {
  const farmId = input.farmId as string | undefined;

  try {
    const stats = await computeConceptionStats(farmId);
    return {
      farmId: stats.farmId ?? '전체',
      farmName: stats.farmName,
      overall: stats.overall,
      topSemen: stats.bySemen.slice(0, 10),
      topAnimals: stats.byAnimal.slice(0, 10),
    };
  } catch (error) {
    return { error: `수태율 통계 조회 실패: ${error instanceof Error ? error.message : String(error)}` };
  }
}

// ===========================
// 7. 이력제 조회 (공공데이터)
// ===========================

let traceConnector: TraceabilityConnector | null = null;

function getTraceConnector(): TraceabilityConnector {
  if (!traceConnector) {
    traceConnector = new TraceabilityConnector();
  }
  return traceConnector;
}

async function handleQueryTraceability(input: Record<string, unknown>): Promise<unknown> {
  const traceId = input.traceId as string;
  if (!traceId) return { error: '이력번호(traceId)는 필수입니다.' };
  if (traceId.length !== 12 && traceId.length !== 15) {
    return { error: '이력번호는 12자리 또는 15자리여야 합니다.' };
  }

  try {
    const connector = getTraceConnector();
    await connector.connect();
    const record = await connector.fetchByTraceId(traceId);

    if (!record) {
      return { traceId, message: '이력제 정보를 찾을 수 없습니다. API 키 미설정 또는 해당 이력번호 없음.' };
    }

    return {
      traceId: record.traceId,
      earTag: record.earTag,
      birthDate: record.birthDate,
      sex: record.sex,
      breed: record.breed,
      farmName: record.farmName,
      farmAddress: record.farmAddress,
      movements: record.movements.slice(0, 10),
      vaccinations: record.vaccinations.slice(0, 10),
      inspections: record.inspections.slice(0, 5),
      slaughterInfo: record.slaughterInfo,
    };
  } catch (error) {
    return { error: `이력제 조회 실패: ${error instanceof Error ? error.message : String(error)}` };
  }
}

// ===========================
// 7b. 등급판정 조회 (공공데이터)
// ===========================

let gradeConnector: GradeConnector | null = null;

function getGradeConnector(): GradeConnector {
  if (!gradeConnector) {
    gradeConnector = new GradeConnector();
  }
  return gradeConnector;
}

async function handleQueryGrade(input: Record<string, unknown>): Promise<unknown> {
  const traceId = input.traceId as string;
  if (!traceId) return { error: '이력번호(traceId)는 필수입니다.' };
  if (traceId.length !== 12 && traceId.length !== 15) {
    return { error: '이력번호는 12자리 또는 15자리여야 합니다.' };
  }

  try {
    const connector = getGradeConnector();
    await connector.connect();
    const record = await connector.fetchGradeByTraceId(traceId);

    if (!record) {
      return { traceId, message: '등급판정 정보를 찾을 수 없습니다. 도축 전이거나 등급판정 대상이 아닐 수 있습니다.' };
    }

    return {
      traceId: record.cattleNo,
      grade: record.grade,
      qualityGrade: record.qualityGrade,
      yieldGrade: record.yieldGrade,
      weight: record.weight,
      judgeDate: record.judgeYmd,
      abattoir: record.abattNm,
    };
  } catch (error) {
    return { error: `등급판정 조회 실패: ${error instanceof Error ? error.message : String(error)}` };
  }
}

// ===========================
// 7c. 경락가격 조회 (공공데이터)
// ===========================

async function handleQueryAuctionPrices(input: Record<string, unknown>): Promise<unknown> {
  const startDate = input.startDate as string | undefined;
  const endDate = input.endDate as string | undefined;
  const breed = input.breed as string | undefined;

  // 기본값: 최근 7일
  const now = new Date();
  const defaultEnd = now.toISOString().slice(0, 10).replace(/-/g, '');
  const defaultStart = new Date(now.getTime() - 7 * 86_400_000).toISOString().slice(0, 10).replace(/-/g, '');

  const breedCodeMap: Record<string, string> = { '한우': '1', '육우': '2', '젖소': '3' };

  try {
    const connector = getGradeConnector();
    await connector.connect();
    const prices = await connector.fetchAuctionPrices({
      startYmd: startDate ?? defaultStart,
      endYmd: endDate ?? defaultEnd,
      breedCd: breed ? breedCodeMap[breed] : undefined,
    });

    if (prices.length === 0) {
      return { message: '해당 기간 경락가격 데이터가 없습니다.', startDate: startDate ?? defaultStart, endDate: endDate ?? defaultEnd };
    }

    return {
      period: { start: startDate ?? defaultStart, end: endDate ?? defaultEnd },
      breed: breed ?? '전체',
      prices: prices.slice(0, 20).map((p) => ({
        date: p.judgeYmd,
        breed: p.breedNm,
        grade: p.gradeNm,
        avgPrice: p.avgPrice,
        maxPrice: p.maxPrice,
        minPrice: p.minPrice,
        headCount: p.totalQty,
      })),
      totalRecords: prices.length,
    };
  } catch (error) {
    return { error: `경락가격 조회 실패: ${error instanceof Error ? error.message : String(error)}` };
  }
}

// ===========================
// 7d. 씨수소 정보 조회 (공공데이터)
// ===========================

let semenConnector: SemenConnector | null = null;

function getSemenConnector(): SemenConnector {
  if (!semenConnector) {
    semenConnector = new SemenConnector();
  }
  return semenConnector;
}

async function handleQuerySireInfo(_input: Record<string, unknown>): Promise<unknown> {
  try {
    const connector = getSemenConnector();
    await connector.connect();
    const result = await connector.fetch();

    if (result.count === 0) {
      return { message: '씨수소 정보를 조회할 수 없습니다. API 키 미설정 또는 데이터 없음.' };
    }

    return {
      totalBulls: result.count,
      bulls: result.data.slice(0, 20).map((b) => ({
        bullNo: b.bullNo,
        bullName: b.bullName,
        birthDate: b.birthDate,
        fatherNo: b.fatherNo,
        motherNo: b.motherNo,
        inbreedingCoeff: b.inbreedingCoeff,
        isAlive: b.isAlive,
        breed: b.breed,
      })),
      note: '한우 종모우만 포함. 젖소 종모우는 별도 조회 필요.',
    };
  } catch (error) {
    return { error: `씨수소 정보 조회 실패: ${error instanceof Error ? error.message : String(error)}` };
  }
}

// ===========================
// 8. 수정 기록
// ===========================

async function handleRecordInsemination(input: Record<string, unknown>): Promise<unknown> {
  const animalId = input.animalId as string;
  const farmId = input.farmId as string;

  if (!animalId || !farmId) return { error: 'animalId와 farmId는 필수입니다.' };

  try {
    const result = await recordInsemination({
      animalId,
      farmId,
      semenId: input.semenId as string | undefined,
      semenInfo: input.semenInfo as string | undefined,
      technicianName: input.technicianName as string | undefined,
      notes: input.notes as string | undefined,
    });

    return {
      success: true,
      eventId: result.eventId,
      message: '수정 기록이 저장되었습니다.',
    };
  } catch (error) {
    return { error: `수정 기록 실패: ${error instanceof Error ? error.message : String(error)}` };
  }
}

// ===========================
// 7. 임신감정 기록
// ===========================

async function handleRecordPregnancyCheck(input: Record<string, unknown>): Promise<unknown> {
  const animalId = input.animalId as string;
  const result = input.result as string;

  if (!animalId || !result) return { error: 'animalId와 result는 필수입니다.' };
  if (result !== 'pregnant' && result !== 'open') return { error: "result는 'pregnant' 또는 'open'이어야 합니다." };

  try {
    const check = await recordPregnancyCheck({
      animalId,
      checkDate: new Date().toISOString(),
      result: result as 'pregnant' | 'open',
      method: (input.method as 'ultrasound' | 'manual' | 'blood') ?? 'ultrasound',
      daysPostInsemination: input.daysPostInsemination as number | undefined,
      notes: input.notes as string | undefined,
    });

    return {
      success: true,
      checkId: check.checkId,
      result,
      message: result === 'pregnant' ? '임신 확인되었습니다.' : '미임신(공태)으로 기록되었습니다.',
    };
  } catch (error) {
    return { error: `임신감정 기록 실패: ${error instanceof Error ? error.message : String(error)}` };
  }
}

// ===========================
// 8. 수정 적기 추천
// ===========================

async function handleRecommendInseminationWindow(input: Record<string, unknown>): Promise<unknown> {
  const animalId = input.animalId as string;
  if (!animalId) return { error: 'animalId는 필수입니다.' };

  const heatDetectedAt = input.heatDetectedAt
    ? new Date(input.heatDetectedAt as string)
    : undefined;

  try {
    const advice = await getBreedingAdvice(animalId, heatDetectedAt);
    if (!advice) return { error: '해당 개체의 번식 정보를 조회할 수 없습니다.' };

    return {
      animalId: advice.animalId,
      earTag: advice.earTag,
      farmName: advice.farmName,
      heatDetectedAt: advice.heatDetectedAt,
      optimalInseminationTime: advice.optimalInseminationTime,
      optimalTimeLabel: advice.optimalTimeLabel,
      windowStart: advice.windowStartTime,
      windowEnd: advice.windowEndTime,
      warnings: advice.warnings,
      recommendations: advice.recommendations.slice(0, 3).map((r) => ({
        bullName: r.bullName,
        score: r.score,
        inbreedingRisk: r.inbreedingRisk,
        reasoning: r.reasoning,
      })),
      farmSettings: advice.farmSettings,
    };
  } catch (error) {
    return { error: `수정 적기 추천 실패: ${error instanceof Error ? error.message : String(error)}` };
  }
}

// ===========================
// 9. 치료 기록
// ===========================

async function handleRecordTreatment(input: Record<string, unknown>): Promise<unknown> {
  const db = getDb();
  const animalId = input.animalId as string;
  const diagnosis = input.diagnosis as string;

  if (!animalId || !diagnosis) return { error: 'animalId와 diagnosis는 필수입니다.' };

  // 개체 확인
  const animalRows = await db
    .select({ animalId: animals.animalId, farmId: animals.farmId })
    .from(animals)
    .where(and(eq(animals.animalId, animalId), eq(animals.status, 'active')))
    .limit(1);

  if (animalRows.length === 0) return { error: '해당 개체를 찾을 수 없습니다.' };

  try {
    // 1. healthEvent 생성
    const severity = (input.severity as string) ?? 'medium';
    const [healthEvent] = await db.insert(healthEvents).values({
      animalId,
      eventDate: new Date(),
      diagnosis,
      severity,
      notes: input.notes as string | undefined,
    }).returning({ eventId: healthEvents.eventId });

    if (!healthEvent) return { error: '건강 이벤트 생성 실패' };

    // 2. treatment 기록 (약물 정보가 있는 경우)
    const drug = input.drug as string | undefined;
    let treatmentId: string | undefined;

    if (drug) {
      const [treatment] = await db.insert(treatments).values({
        healthEventId: healthEvent.eventId,
        drug,
        dosage: (input.dosage as string) ?? null,
        withdrawalDays: (input.withdrawalDays as number) ?? 0,
        administeredAt: new Date(),
      }).returning({ treatmentId: treatments.treatmentId });

      treatmentId = treatment?.treatmentId;
    }

    return {
      success: true,
      healthEventId: healthEvent.eventId,
      treatmentId,
      diagnosis,
      severity,
      drug: drug ?? '미투약',
      message: `치료 기록이 저장되었습니다. ${drug ? `약물: ${drug}` : '투약 없음'}`,
    };
  } catch (error) {
    return { error: `치료 기록 실패: ${error instanceof Error ? error.message : String(error)}` };
  }
}

// ===========================
// 10. 농장 KPI
// ===========================

async function handleGetFarmKpis(input: Record<string, unknown>): Promise<unknown> {
  const db = getDb();
  const farmId = input.farmId as string;
  if (!farmId) return { error: 'farmId는 필수입니다.' };

  // 농장 확인
  const farmRows = await db
    .select({ farmId: farms.farmId, name: farms.name })
    .from(farms)
    .where(eq(farms.farmId, farmId))
    .limit(1);

  if (farmRows.length === 0) return { error: '농장을 찾을 수 없습니다.' };
  const farm = farmRows[0]!;

  // 두수
  const animalRows = await db
    .select({ lactationStatus: animals.lactationStatus })
    .from(animals)
    .where(and(eq(animals.farmId, farmId), eq(animals.status, 'active'), isNull(animals.deletedAt)));

  const totalHead = animalRows.length;
  const milking = animalRows.filter((a) => a.lactationStatus === 'milking').length;
  const dry = animalRows.filter((a) => a.lactationStatus === 'dry').length;

  // 번식 KPI
  let breedingKpis: unknown = null;
  try {
    const pipeline = await getBreedingPipeline(farmId);
    breedingKpis = pipeline.kpis;
  } catch {
    breedingKpis = { error: '번식 KPI 조회 실패' };
  }

  // 최근 7일 건강 이벤트 수
  const since7d = new Date(Date.now() - 7 * 86_400_000);
  const healthRows = await db
    .select({ eventId: healthEvents.eventId, severity: healthEvents.severity })
    .from(healthEvents)
    .innerJoin(animals, eq(healthEvents.animalId, animals.animalId))
    .where(and(
      eq(animals.farmId, farmId),
      gte(healthEvents.eventDate, since7d),
    ));

  const criticalCount = healthRows.filter((h) => h.severity === 'critical' || h.severity === 'high').length;

  // 최근 24시간 알림 수
  const since24h = new Date(Date.now() - 86_400_000);
  const alertRows = await db
    .select({ eventId: smaxtecEvents.eventId })
    .from(smaxtecEvents)
    .where(and(
      eq(smaxtecEvents.farmId, farmId),
      gte(smaxtecEvents.detectedAt, since24h),
    ));

  return {
    farmId,
    farmName: farm.name,
    headcount: { total: totalHead, milking, dry, heifer: totalHead - milking - dry },
    breedingKpis,
    health: {
      eventsLast7d: healthRows.length,
      criticalOrHigh: criticalCount,
    },
    alertsLast24h: alertRows.length,
  };
}
