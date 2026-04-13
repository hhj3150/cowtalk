// 팅커벨 도구 실행기 — tool_use 요청을 받아 DB 쿼리 실행
// 각 도구는 JSON 문자열(최대 4000자)을 반환

import { getDb } from '../../config/database.js';
import {
  animals, farms, smaxtecEvents, breedingEvents,
  pregnancyChecks, sensorDailyAgg, sensorHourlyAgg, healthEvents, treatments,
  type TreatmentDetails,
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
import { WeatherConnector } from '../../pipeline/connectors/public-data/weather.connector.js';
import { getQuarantineDashboard } from '../../services/epidemiology/quarantine-dashboard.service.js';
import { getNationalSituation, getProvinceDetail } from '../../services/epidemiology/national-situation.service.js';
import { computeConceptionStats } from '../../services/breeding/breeding-feedback.service.js';
import { logger } from '../../lib/logger.js';
import {
  computeComparisonStats,
  computePersonalBaseline,
  assessAgainstBaseline,
  computeTimeOfDayAnalysis,
  computeAdjustedThresholds,
  type DailyAggRow,
} from './sensor-analysis.js';

const MAX_RESULT_LENGTH = 6000;

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
      case 'query_weather':
        result = await handleQueryWeather(input);
        break;
      case 'query_quarantine_dashboard':
        result = await handleQueryQuarantineDashboard(input);
        break;
      case 'query_national_situation':
        result = await handleQueryNationalSituation(input);
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
      case 'query_differential_diagnosis':
        result = await handleDifferentialDiagnosis(input);
        break;
      case 'confirm_treatment_outcome':
        result = await handleConfirmTreatmentOutcome(input);
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

const METRIC_TYPE_MAP: Readonly<Record<string, string>> = {
  temperature: 'temp',
  activity: 'act',
  rumination: 'rum',
  water_intake: 'water',
  ph: 'ph',
};

const METRIC_UNIT_MAP: Readonly<Record<string, string>> = {
  temperature: '°C',
  activity: 'index',
  rumination: '분/일',
  water_intake: 'L/일',
  ph: 'pH',
};

async function querySensorData(input: Record<string, unknown>): Promise<unknown> {
  const db = getDb();
  const animalId = input.animalId as string;
  const metric = (input.metric as string) || 'temperature';
  const requestedDays = Math.min(Number(input.days) || 7, 30);
  const includeHourly = input.includeHourlyPattern === true;

  if (!animalId) return { error: 'animalId는 필수입니다.' };

  const metricType = METRIC_TYPE_MAP[metric] ?? 'temp';
  // 항상 30일 조회 (기준선 계산용) — 반환은 요청 기간만
  const sinceDate30 = new Date(Date.now() - 30 * 86_400_000).toISOString().split('T')[0]!;

  // 병렬 조회: 일별 집계 + 개체 프로필
  const [allRows, animalRows] = await Promise.all([
    db.select({
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
      gte(sensorDailyAgg.date, sinceDate30),
    ))
    .orderBy(desc(sensorDailyAgg.date))
    .limit(30),

    db.select({
      breed: animals.breed,
      breedType: animals.breedType,
      parity: animals.parity,
      daysInMilk: animals.daysInMilk,
      lactationStatus: animals.lactationStatus,
    })
    .from(animals)
    .where(eq(animals.animalId, animalId))
    .limit(1),
  ]);

  if (allRows.length === 0) return { animalId, metric, message: '해당 기간 센서 데이터가 없습니다.' };

  const dailyRows: readonly DailyAggRow[] = allRows.map((r) => ({
    date: r.date,
    avg: Number(r.avg),
    min: Number(r.min),
    max: Number(r.max),
    count: r.count,
  }));

  // Phase 1: 비교 통계
  const comparison = computeComparisonStats(dailyRows);

  // Phase 2: 개체별 기준선
  const personalBaseline = dailyRows.length >= 7
    ? computePersonalBaseline(metric, dailyRows)
    : null;
  const todayAvg = dailyRows[0]!.avg;
  const baselineAssessment = personalBaseline
    ? assessAgainstBaseline(todayAvg, personalBaseline)
    : null;

  // Phase 4: 품종/산차/DIM 보정
  const animalProfile = animalRows[0];
  const adjustedThresholds = animalProfile
    ? computeAdjustedThresholds({
        breed: animalProfile.breed ?? 'holstein',
        breedType: animalProfile.breedType ?? 'dairy',
        parity: animalProfile.parity ?? 0,
        daysInMilk: animalProfile.daysInMilk ?? null,
        lactationStatus: animalProfile.lactationStatus ?? 'unknown',
      })
    : null;

  // Phase 3: 시간대별 패턴 (옵션)
  let timeOfDayAnalysis = null;
  if (includeHourly) {
    const sinceDate7 = new Date(Date.now() - 7 * 86_400_000);
    const hourlyRows = await db.select({
      hour: sensorHourlyAgg.hour,
      avg: sensorHourlyAgg.avg,
      min: sensorHourlyAgg.min,
      max: sensorHourlyAgg.max,
      count: sensorHourlyAgg.count,
    })
    .from(sensorHourlyAgg)
    .where(and(
      eq(sensorHourlyAgg.animalId, animalId),
      eq(sensorHourlyAgg.metricType, metricType),
      gte(sensorHourlyAgg.hour, sinceDate7),
    ))
    .orderBy(desc(sensorHourlyAgg.hour))
    .limit(168); // 7일 × 24시간

    if (hourlyRows.length > 0) {
      const todayDate = new Date().toISOString().split('T')[0]!;
      timeOfDayAnalysis = computeTimeOfDayAnalysis(
        hourlyRows.map((r) => ({
          hour: typeof r.hour === 'string' ? r.hour : new Date(r.hour).toISOString(),
          avg: Number(r.avg),
          min: Number(r.min),
          max: Number(r.max),
          count: r.count,
        })),
        todayDate,
      );
    }
  }

  // 요청 기간만큼 dataPoints 자르기
  const trimmedRows = dailyRows.slice(0, requestedDays);

  return {
    animalId,
    metric,
    unit: METRIC_UNIT_MAP[metric] ?? 'index',
    days: requestedDays,
    dataPoints: trimmedRows.map((r) => ({
      date: r.date,
      avg: Number(r.avg.toFixed(2)),
      min: Number(r.min.toFixed(2)),
      max: Number(r.max.toFixed(2)),
      readings: r.count,
    })),
    comparison,
    personalBaseline,
    baselineAssessment,
    adjustedThresholds,
    ...(timeOfDayAnalysis ? { timeOfDayAnalysis } : {}),
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
// 7e. 기상/THI 조회
// ===========================

let weatherConnector: WeatherConnector | null = null;

function getWeatherConnector(): WeatherConnector {
  if (!weatherConnector) {
    weatherConnector = new WeatherConnector();
  }
  return weatherConnector;
}

async function handleQueryWeather(input: Record<string, unknown>): Promise<unknown> {
  const db = getDb();
  const farmId = input.farmId as string | undefined;

  try {
    const connector = getWeatherConnector();
    await connector.connect();

    // 농장 좌표 조회
    if (farmId) {
      const farmRows = await db
        .select({ name: farms.name, lat: farms.lat, lng: farms.lng })
        .from(farms)
        .where(eq(farms.farmId, farmId))
        .limit(1);

      if (farmRows.length === 0) return { error: '농장을 찾을 수 없습니다.' };
      const farm = farmRows[0]!;

      const lat = Number(farm.lat) || 37.5;
      const lng = Number(farm.lng) || 127.0;

      const weather = await connector.fetchCurrentWeather(lat, lng);
      if (!weather) return { error: '기상 데이터를 조회할 수 없습니다.' };

      const thiInfo = WeatherConnector.thiLevel(weather.thi);

      return {
        farmId,
        farmName: farm.name,
        weather: {
          temperature: weather.temperature,
          humidity: weather.humidity,
          thi: weather.thi,
          thiLevel: thiInfo.level,
          thiLabel: thiInfo.label,
          observationTime: weather.observationTime,
        },
        recommendation: getThiRecommendation(thiInfo.level),
      };
    }

    // 전체 농장 대표 지점 (서울 기준)
    const weather = await connector.fetchCurrentWeather(37.5, 127.0);
    if (!weather) return { error: '기상 데이터를 조회할 수 없습니다.' };

    const thiInfo = WeatherConnector.thiLevel(weather.thi);

    return {
      farmId: '전체',
      weather: {
        temperature: weather.temperature,
        humidity: weather.humidity,
        thi: weather.thi,
        thiLevel: thiInfo.level,
        thiLabel: thiInfo.label,
        observationTime: weather.observationTime,
      },
      recommendation: getThiRecommendation(thiInfo.level),
    };
  } catch (error) {
    return { error: `기상 조회 실패: ${error instanceof Error ? error.message : String(error)}` };
  }
}

function getThiRecommendation(level: string): string {
  switch (level) {
    case 'emergency':
      return '긴급: 즉시 냉방 가동, 음수량 2배 확보, 사료 급여 시간 조정(새벽/야간), 착유 중단 검토';
    case 'danger':
      return '위험: 환기팬 + 스프링클러 가동, 음수 공급 점검, 착유우 일사량 차단, 밀사 방지';
    case 'warning':
      return '주의: 환기 상태 점검, 음수량 모니터링, 고온 시간대(12~16시) 방목 자제';
    default:
      return '정상: 특별 조치 불필요';
  }
}

// ===========================
// 7f. 방역 대시보드 조회
// ===========================

async function handleQueryQuarantineDashboard(_input: Record<string, unknown>): Promise<unknown> {
  try {
    const data = await getQuarantineDashboard();
    return {
      riskLevel: data.kpi.riskLevel,
      totalAnimals: data.kpi.totalAnimals,
      feverAnimals: data.kpi.feverAnimals,
      feverRate: Math.round(data.kpi.feverRate * 1000) / 10,
      sensorRate: Math.round(data.kpi.sensorRate * 1000) / 10,
      clusterFarms: data.kpi.clusterFarms,
      legalDiseaseSuspects: data.kpi.legalDiseaseSuspects,
      top5RiskFarms: data.top5RiskFarms.map((f) => ({
        farmName: f.farmName,
        riskScore: f.riskScore,
        feverCount: f.feverCount,
        clusterAlert: f.clusterAlert,
      })),
      activeAlerts: data.activeAlerts.slice(0, 10).map((a) => ({
        farmName: a.farmName,
        title: a.title,
        priority: a.priority,
      })),
      computedAt: data.computedAt,
    };
  } catch (error) {
    return { error: `방역 대시보드 조회 실패: ${error instanceof Error ? error.message : String(error)}` };
  }
}

// ===========================
// 7g. 전국 방역 현황 조회
// ===========================

async function handleQueryNationalSituation(input: Record<string, unknown>): Promise<unknown> {
  const province = input.province as string | undefined;

  try {
    if (province) {
      const districts = await getProvinceDetail(province);
      return {
        province,
        districts: districts.map((d) => ({
          district: d.district,
          farmCount: d.farmCount,
          totalAnimals: d.totalAnimals,
          feverAnimals: d.feverAnimals,
          feverRate: Math.round(d.feverRate * 1000) / 10,
          riskLevel: d.riskLevel,
        })),
      };
    }

    const data = await getNationalSituation();
    return {
      nationalSummary: {
        totalFarms: data.nationalSummary.totalFarms,
        totalAnimals: data.nationalSummary.totalAnimals,
        feverAnimals: data.nationalSummary.feverAnimals,
        nationalFeverRate: Math.round(data.nationalSummary.nationalFeverRate * 1000) / 10,
        highRiskProvinces: data.nationalSummary.highRiskProvinces,
        broadAlertActive: data.nationalSummary.broadAlertActive,
      },
      provinces: data.provinces.map((p) => ({
        province: p.province,
        farmCount: p.farmCount,
        totalAnimals: p.totalAnimals,
        feverAnimals: p.feverAnimals,
        feverRate: Math.round(p.feverRate * 1000) / 10,
        riskLevel: p.riskLevel,
      })),
    };
  } catch (error) {
    return { error: `전국 현황 조회 실패: ${error instanceof Error ? error.message : String(error)}` };
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

    // AI 성능 측정: 번식 추천을 predictions에 저장 (비동기)
    import('../../intelligence-loop/prediction-bridge.service.js')
      .then(({ saveBreedingAdviceAsPrediction }) => saveBreedingAdviceAsPrediction(advice))
      .catch(() => {});

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
        inbreedingReason: r.inbreedingReason,
        pastConceptionRate: r.pastConceptionRate,  // 목장 내 과거 수태율 (학습 근거)
        pastSampleSize: r.pastSampleSize,
        learningBonus: r.learningBonus,
        reasoning: r.reasoning,
      })),
      farmSettings: advice.farmSettings,
    };
  } catch (error) {
    return { error: `수정 적기 추천 실패: ${error instanceof Error ? error.message : String(error)}` };
  }
}

// ===========================
// 9. 치료 기록 (서비스 위임)
// ===========================

async function handleRecordTreatment(input: Record<string, unknown>): Promise<unknown> {
  const { recordTreatment } = await import('../../services/vet/treatment.service.js');
  return recordTreatment(input as unknown as Parameters<typeof recordTreatment>[0]);
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

// ===========================
// 11. 감별진단 (서비스 위임)
// ===========================

async function handleDifferentialDiagnosis(input: Record<string, unknown>): Promise<unknown> {
  const { getDifferentialDiagnosis } = await import('../../services/vet/differential-diagnosis.service.js');
  const { saveDifferentialDiagnosisAsPrediction } = await import('../../intelligence-loop/prediction-bridge.service.js');
  const animalId = input.animalId as string;
  if (!animalId) return { error: 'animalId는 필수입니다.' };
  const symptoms = Array.isArray(input.symptoms) ? input.symptoms as string[] : undefined;
  const result = await getDifferentialDiagnosis(animalId, symptoms);
  // AI 성능 측정: 감별진단 결과를 predictions에 저장 (비동기)
  saveDifferentialDiagnosisAsPrediction(result).catch(() => {});
  return result;
}

// ===========================
// 12. 치료 결과 확인 (서비스 위임)
// ===========================

async function handleConfirmTreatmentOutcome(input: Record<string, unknown>): Promise<unknown> {
  const db = getDb();
  const treatmentId = input.treatmentId as string;
  const outcome = input.outcome as string;

  if (!treatmentId || !outcome) return { error: 'treatmentId와 outcome은 필수입니다.' };

  const validOutcomes = ['recovered', 'relapsed', 'worsened'];
  if (!validOutcomes.includes(outcome)) return { error: `outcome은 ${validOutcomes.join('/')} 중 하나여야 합니다.` };

  try {
    const [existing] = await db.select().from(treatments).where(eq(treatments.treatmentId, treatmentId)).limit(1);
    if (!existing) return { error: '해당 치료 기록을 찾을 수 없습니다.' };

    const currentDetails = (existing.details ?? {}) as Record<string, unknown>;
    const updatedDetails = {
      ...currentDetails,
      outcomeStatus: outcome as 'recovered' | 'relapsed' | 'worsened',
      outcomeDate: new Date().toISOString(),
    } as TreatmentDetails;

    await db.update(treatments)
      .set({ details: updatedDetails })
      .where(eq(treatments.treatmentId, treatmentId));

    const outcomeLabel = outcome === 'recovered' ? '완치' : outcome === 'relapsed' ? '재발' : '악화';
    return {
      success: true,
      treatmentId,
      outcome,
      message: `치료 결과 '${outcomeLabel}'로 기록되었습니다.`,
    };
  } catch (error) {
    return { error: `결과 기록 실패: ${error instanceof Error ? error.message : String(error)}` };
  }
}
