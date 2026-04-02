// 팅커벨 도구 실행기 — tool_use 요청을 받아 DB 쿼리 실행
// 각 도구는 JSON 문자열(최대 4000자)을 반환

import { getDb } from '../../config/database.js';
import {
  animals, farms, smaxtecEvents, breedingEvents,
  pregnancyChecks, sensorDailyAgg,
} from '../../db/schema.js';
import { eq, and, desc, gte, ilike, inArray, isNull } from 'drizzle-orm';
import { getBreedingPipeline } from '../../services/breeding/breeding-pipeline.service.js';
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
