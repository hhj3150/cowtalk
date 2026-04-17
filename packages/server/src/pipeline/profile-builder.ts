// 통합 프로파일 생성기 — CowTalk의 핵심
// 개체별로 모든 데이터를 하나의 통합 프로파일로 결합
// 이 프로파일이 Claude AI에게 전달되어 해석/액션 생성

import { eq, and, desc, gte, lte, isNull, count } from 'drizzle-orm';
import { getDb } from '../config/database.js';
import {
  animals, farms, regions, smaxtecEvents,
  sensorMeasurements, breedingEvents, pregnancyChecks, healthEvents,
  diseaseClusters, clusterFarmMemberships,
} from '../db/schema.js';
import { resolveBreedType } from '@cowtalk/shared';
import type {
  AnimalProfile, FarmProfile, RegionalProfile,
  LatestSensorReading, SensorSnapshot, SmaxtecEvent,
  BreedingRecord, HealthRecord, DairyProduction, BeefGrowth,
  FarmSummaryInProfile,
  BreedType,
} from '@cowtalk/shared';
import { getBreedingFeedback } from '../services/breeding/breeding-advisor.service.js';
import type { ClusterSignal } from '@cowtalk/shared';
import { logger } from '../lib/logger.js';

// ===========================
// buildAnimalProfile
// ===========================

export async function buildAnimalProfile(animalId: string): Promise<AnimalProfile | null> {
  const db = getDb();

  // 1. 기본 정보
  const [animal] = await db
    .select()
    .from(animals)
    .where(and(eq(animals.animalId, animalId), isNull(animals.deletedAt)));

  if (!animal) return null;

  // 2. 농장 + 지역 정보
  const [farm] = await db
    .select()
    .from(farms)
    .where(eq(farms.farmId, animal.farmId));

  const [region] = farm
    ? await db.select().from(regions).where(eq(regions.regionId, farm.regionId))
    : [null];

  const breedType: BreedType = resolveBreedType(animal.breed);

  // 3~6: 병렬 조회
  const now = new Date();
  const h24ago = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const d7ago = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const d30ago = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const [latestSensors, sensorHistory24h, sensorHistory7d, sensorHistory30d, activeEvents, breedingRecords, healthRecords, pregStatus, feedbackRaw] = await Promise.all([
    // 최신 센서값 (각 메트릭별 최신 1건)
    getLatestSensorReadings(db, animalId),
    // 24시간 센서 히스토리
    getSensorHistory(db, animalId, h24ago),
    // 7일 센서 히스토리
    getSensorHistory(db, animalId, d7ago),
    // 30일 센서 히스토리 (장기 추세·만성 패턴 분석)
    getSensorHistory(db, animalId, d30ago),
    // 활성 smaXtec 이벤트
    getActiveSmaxtecEvents(db, animalId),
    // 번식 이력
    getBreedingHistory(db, animalId),
    // 건강 이력
    getHealthHistory(db, animalId),
    // 임신상태 자동계산
    computePregnancyStatus(db, animalId),
    // 번식 피드백 (수정→임신감정 성적)
    getBreedingFeedback(animalId).catch(() => null),
  ]);

  return {
    animalId: animal.animalId,
    earTag: animal.earTag,
    traceId: animal.traceId ?? null,
    breedType,
    breed: animal.breed,
    birthDate: animal.birthDate ? new Date(animal.birthDate) : null,
    sex: animal.sex,
    parity: animal.parity,
    sire: null, // 혈통 커넥터에서 연동 시 채움
    dam: null,

    farmId: animal.farmId,
    farmName: farm?.name ?? '',
    region: region ? `${region.province} ${region.district}` : '',
    tenantId: farm?.tenantId ?? null,

    latestSensor: latestSensors,
    sensorHistory24h,
    sensorHistory7d,
    sensorHistory30d,
    activeEvents,
    breedingHistory: breedingRecords,
    pregnancyStatus: pregStatus.status as AnimalProfile['pregnancyStatus'],
    daysSinceInsemination: pregStatus.daysSince,
    breedingFeedback: feedbackRaw ? {
      conceptionRate: feedbackRaw.conceptionRate,
      totalInseminations: feedbackRaw.totalInseminations,
      pregnantCount: feedbackRaw.pregnantCount,
      openCount: feedbackRaw.openCount,
      pendingCount: feedbackRaw.pendingCount,
      recentOutcomes: feedbackRaw.entries.slice(0, 5).map((e) => ({
        date: e.inseminationDate,
        bullName: e.bullName,
        result: e.pregnancyResult,
      })),
    } : null,
    healthHistory: healthRecords,
    production: breedType === 'dairy' ? getEmptyDairyProduction() : null,
    growth: breedType === 'beef' ? getEmptyBeefGrowth() : null,
    environment: null, // 기상 커넥터에서 연동 시 채움
    regionalContext: null, // 방역 커넥터에서 연동 시 채움
  };
}

// ===========================
// buildFarmProfile
// ===========================

export async function buildFarmProfile(farmId: string): Promise<FarmProfile | null> {
  const db = getDb();

  const [farm] = await db
    .select()
    .from(farms)
    .where(and(eq(farms.farmId, farmId), isNull(farms.deletedAt)));

  if (!farm) return null;

  const [region] = await db
    .select()
    .from(regions)
    .where(eq(regions.regionId, farm.regionId));

  // 이 농장의 모든 동물
  const farmAnimals = await db
    .select()
    .from(animals)
    .where(and(eq(animals.farmId, farmId), isNull(animals.deletedAt)));

  // 축종 구성
  const breedComposition: Record<BreedType, number> = { dairy: 0, beef: 0 };
  for (const a of farmAnimals) {
    const bt = resolveBreedType(a.breed);
    breedComposition[bt]++;
  }

  // 활성 smaXtec 이벤트 (이 농장)
  const activeEvents = await db
    .select()
    .from(smaxtecEvents)
    .where(
      and(
        eq(smaxtecEvents.farmId, farmId),
        eq(smaxtecEvents.acknowledged, false),
      ),
    )
    .orderBy(desc(smaxtecEvents.detectedAt))
    .limit(50);

  // animalId → earTag 룩업 (프롬프트·알람에서 UUID 대신 #번호 표시용)
  // 전체 farmAnimals 기반 (animalProfiles 50개 제한보다 넓은 커버리지)
  const animalIdToEarTag: Record<string, string> = {};
  for (const a of farmAnimals) {
    if (a.earTag) animalIdToEarTag[a.animalId] = a.earTag;
  }

  // 개별 동물 프로파일 빌드 (최대 50개)
  const profileIds = farmAnimals.slice(0, 50).map((a) => a.animalId);
  const animalProfiles = (
    await Promise.all(profileIds.map(buildAnimalProfile))
  ).filter((p): p is AnimalProfile => p !== null);

  // 최근 30일 이벤트 타임라인 (질병 패턴 분석용 — acknowledged 여부 무관)
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const timelineRows = await db
    .select({
      detectedAt: smaxtecEvents.detectedAt,
      eventType: smaxtecEvents.eventType,
      earTag: animals.earTag,
      severity: smaxtecEvents.severity,
      details: smaxtecEvents.details,
    })
    .from(smaxtecEvents)
    .innerJoin(animals, eq(smaxtecEvents.animalId, animals.animalId))
    .where(
      and(
        eq(smaxtecEvents.farmId, farmId),
        gte(smaxtecEvents.detectedAt, thirtyDaysAgo),
      ),
    )
    .orderBy(desc(smaxtecEvents.detectedAt))
    .limit(200);

  const eventTimeline = timelineRows.map((r) => ({
    date: r.detectedAt?.toISOString() ?? '',
    eventType: r.eventType,
    earTag: r.earTag ?? '',
    severity: r.severity ?? 'medium',
    details: (r.details as Record<string, unknown>)?.message as string ?? r.eventType,
  }));

  return {
    farmId: farm.farmId,
    name: farm.name,
    address: farm.address,
    lat: farm.lat,
    lng: farm.lng,
    region: region ? `${region.province} ${region.district}` : '',
    tenantId: farm.tenantId ?? null,
    totalAnimals: farmAnimals.length,
    breedComposition,
    activeSmaxtecEvents: activeEvents.map(mapDbEventToSmaxtecEvent),
    animalProfiles,
    farmHealthScore: null, // Intelligence Loop에서 계산
    todayActions: [],
    eventTimeline,
    animalIdToEarTag,
  };
}

// ===========================
// buildGlobalContext — 전체 농장 횡단 요약
// smaXtec 알람 유형별 동물 목록 + 센서 실측값
// ===========================

export interface AlarmAnimal {
  readonly earTag: string;
  readonly farmName: string;
  readonly severity: string;
  readonly detectedAt: Date;
  readonly confidence: number;
  readonly details: Record<string, unknown>;
}

export interface SensorAnomaly {
  readonly earTag: string;
  readonly farmName: string;
  readonly metric: string;
  readonly value: number;
  readonly measuredAt: Date;
}

// smaXtec 알람 유형
const ALARM_TYPES = [
  'temperature_warning',
  'rumination_warning',
  'activity_warning',
  'drinking_warning',
  'feeding_warning',
  'health_warning',
  'estrus',
  'calving',
] as const;

export type AlarmType = typeof ALARM_TYPES[number];

export interface GlobalContext {
  readonly totalFarms: number;
  readonly totalAnimals: number;
  // 알람 유형별 동물 목록 (핵심)
  readonly alarmsByType: Readonly<Record<string, readonly AlarmAnimal[]>>;
  readonly farmAlertRanking: readonly {
    readonly farmName: string;
    readonly alertCount: number;
  }[];
  // 센서 실측값 보조
  readonly sensorAnomalies: {
    readonly highTemp: readonly SensorAnomaly[];
    readonly lowRumination: readonly SensorAnomaly[];
    readonly highActivity: readonly SensorAnomaly[];
    readonly abnormalPh: readonly SensorAnomaly[];
  };
}

export async function buildGlobalContext(): Promise<GlobalContext> {
  const db = getDb();

  // 1. 전체 농장/동물 수
  const [farmCount] = await db
    .select({ count: count() })
    .from(farms)
    .where(isNull(farms.deletedAt));

  const [animalCount] = await db
    .select({ count: count() })
    .from(animals)
    .where(isNull(animals.deletedAt));

  // 2. smaXtec 알람 유형별 동물 목록 (미확인, 최신순 각 50건)
  const alarmSelect = {
    earTag: animals.earTag,
    farmName: farms.name,
    severity: smaxtecEvents.severity,
    detectedAt: smaxtecEvents.detectedAt,
    confidence: smaxtecEvents.confidence,
    details: smaxtecEvents.details,
  };

  const alarmQueries = ALARM_TYPES.map((type) =>
    db.select(alarmSelect)
      .from(smaxtecEvents)
      .innerJoin(animals, eq(smaxtecEvents.animalId, animals.animalId))
      .innerJoin(farms, eq(smaxtecEvents.farmId, farms.farmId))
      .where(and(
        eq(smaxtecEvents.eventType, type),
        eq(smaxtecEvents.acknowledged, false),
      ))
      .orderBy(desc(smaxtecEvents.detectedAt))
      .limit(50),
  );

  // 3. 농장별 알림 순위
  const farmAlertsQuery = db
    .select({
      farmName: farms.name,
      alertCount: count(),
    })
    .from(smaxtecEvents)
    .innerJoin(farms, eq(smaxtecEvents.farmId, farms.farmId))
    .where(eq(smaxtecEvents.acknowledged, false))
    .groupBy(farms.name)
    .orderBy(desc(count()))
    .limit(20);

  // 4. 센서 실측값 이상 동물 (최근 24시간)
  const h24ago = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const baseSensorSelect = {
    earTag: animals.earTag,
    farmName: farms.name,
    value: sensorMeasurements.value,
    measuredAt: sensorMeasurements.timestamp,
  } as const;

  // 모든 쿼리 병렬 실행
  const [
    ...alarmResults
  ] = await Promise.all([
    ...alarmQueries,
  ]);

  const [farmAlerts, highTempRows, lowRuminationRows, highActivityRows, abnormalPhRows] = await Promise.all([
    farmAlertsQuery,
    db.select(baseSensorSelect)
      .from(sensorMeasurements)
      .innerJoin(animals, eq(sensorMeasurements.animalId, animals.animalId))
      .innerJoin(farms, eq(animals.farmId, farms.farmId))
      .where(and(
        eq(sensorMeasurements.metricType, 'temperature'),
        gte(sensorMeasurements.timestamp, h24ago),
        gte(sensorMeasurements.value, 39.5),
      ))
      .orderBy(desc(sensorMeasurements.value))
      .limit(30),
    db.select(baseSensorSelect)
      .from(sensorMeasurements)
      .innerJoin(animals, eq(sensorMeasurements.animalId, animals.animalId))
      .innerJoin(farms, eq(animals.farmId, farms.farmId))
      .where(and(
        eq(sensorMeasurements.metricType, 'rumination'),
        gte(sensorMeasurements.timestamp, h24ago),
        lte(sensorMeasurements.value, 200),
      ))
      .orderBy(sensorMeasurements.value)
      .limit(30),
    db.select(baseSensorSelect)
      .from(sensorMeasurements)
      .innerJoin(animals, eq(sensorMeasurements.animalId, animals.animalId))
      .innerJoin(farms, eq(animals.farmId, farms.farmId))
      .where(and(
        eq(sensorMeasurements.metricType, 'activity'),
        gte(sensorMeasurements.timestamp, h24ago),
        gte(sensorMeasurements.value, 150),
      ))
      .orderBy(desc(sensorMeasurements.value))
      .limit(30),
    db.select(baseSensorSelect)
      .from(sensorMeasurements)
      .innerJoin(animals, eq(sensorMeasurements.animalId, animals.animalId))
      .innerJoin(farms, eq(animals.farmId, farms.farmId))
      .where(and(
        eq(sensorMeasurements.metricType, 'ph'),
        gte(sensorMeasurements.timestamp, h24ago),
        lte(sensorMeasurements.value, 5.5),
      ))
      .orderBy(sensorMeasurements.value)
      .limit(30),
  ]);

  // 알람 유형별 매핑
  const alarmsByType: Record<string, readonly AlarmAnimal[]> = {};
  for (let i = 0; i < ALARM_TYPES.length; i++) {
    const type = ALARM_TYPES[i] as string;
    const rows = alarmResults[i] ?? [];
    alarmsByType[type] = rows.map((r) => ({
      earTag: r.earTag,
      farmName: r.farmName,
      severity: r.severity,
      detectedAt: r.detectedAt,
      confidence: r.confidence,
      details: (r.details ?? {}) as Record<string, unknown>,
    }));
  }

  const mapSensorRows = (rows: typeof highTempRows, metric: string): readonly SensorAnomaly[] =>
    rows.map((r) => ({
      earTag: r.earTag,
      farmName: r.farmName,
      metric,
      value: r.value,
      measuredAt: r.measuredAt,
    }));

  return {
    totalFarms: farmCount?.count ?? 0,
    totalAnimals: animalCount?.count ?? 0,
    alarmsByType,
    farmAlertRanking: farmAlerts.map((f) => ({
      farmName: f.farmName,
      alertCount: f.alertCount,
    })),
    sensorAnomalies: {
      highTemp: mapSensorRows(highTempRows, 'temperature'),
      lowRumination: mapSensorRows(lowRuminationRows, 'rumination'),
      highActivity: mapSensorRows(highActivityRows, 'activity'),
      abnormalPh: mapSensorRows(abnormalPhRows, 'ph'),
    },
  };
}

// ===========================
// buildRegionalProfile
// ===========================

export async function buildRegionalProfile(
  regionId: string,
): Promise<RegionalProfile | null> {
  const db = getDb();

  const [region] = await db
    .select()
    .from(regions)
    .where(eq(regions.regionId, regionId));

  if (!region) return null;

  const regionFarms = await db
    .select()
    .from(farms)
    .where(and(eq(farms.regionId, regionId), isNull(farms.deletedAt)));

  const farmSummaries: FarmSummaryInProfile[] = [];
  let totalAnimals = 0;
  let activeAlerts = 0;

  for (const farm of regionFarms) {
    const animalCount = farm.currentHeadCount;
    totalAnimals += animalCount;

    const eventCount = await db
      .select()
      .from(smaxtecEvents)
      .where(
        and(
          eq(smaxtecEvents.farmId, farm.farmId),
          eq(smaxtecEvents.acknowledged, false),
        ),
      );

    const farmAlerts = eventCount.length;
    activeAlerts += farmAlerts;

    farmSummaries.push({
      farmId: farm.farmId,
      name: farm.name,
      totalAnimals: animalCount,
      activeAlerts: farmAlerts,
      healthScore: null,
    });
  }

  // 활성 질병 클러스터 조회 → clusterSignals 생성
  const clusterSignals = await getClusterSignalsForRegion(db, regionId, regionFarms.map((f) => f.farmId));

  return {
    regionId,
    tenantId: null,
    farms: farmSummaries,
    totalAnimals,
    activeAlerts,
    clusterSignals,
    summary: `${region.province} ${region.district}: ${String(regionFarms.length)}개 농장, ${String(totalAnimals)}두`,
  };
}

// ===========================
// buildTenantProfile
// ===========================

export async function buildTenantProfile(
  tenantId: string,
): Promise<RegionalProfile> {
  const db = getDb();

  const tenantFarms = await db
    .select()
    .from(farms)
    .where(and(eq(farms.tenantId, tenantId), isNull(farms.deletedAt)));

  const farmSummaries: FarmSummaryInProfile[] = [];
  let totalAnimals = 0;
  let activeAlerts = 0;

  for (const farm of tenantFarms) {
    totalAnimals += farm.currentHeadCount;
    farmSummaries.push({
      farmId: farm.farmId,
      name: farm.name,
      totalAnimals: farm.currentHeadCount,
      activeAlerts: 0,
      healthScore: null,
    });
  }

  return {
    regionId: null,
    tenantId,
    farms: farmSummaries,
    totalAnimals,
    activeAlerts,
    clusterSignals: [],
    summary: `Tenant ${tenantId}: ${String(tenantFarms.length)}개 농장, ${String(totalAnimals)}두`,
  };
}

// ===========================
// 헬퍼 함수
// ===========================

type DB = ReturnType<typeof getDb>;

async function getLatestSensorReadings(db: DB, animalId: string): Promise<LatestSensorReading> {
  const metrics = ['temperature', 'rumination', 'activity', 'water_intake', 'ph'] as const;
  const result: Record<string, number | null> = {};
  let measuredAt: Date | null = null;

  for (const metric of metrics) {
    const [row] = await db
      .select()
      .from(sensorMeasurements)
      .where(
        and(
          eq(sensorMeasurements.animalId, animalId),
          eq(sensorMeasurements.metricType, metric),
        ),
      )
      .orderBy(desc(sensorMeasurements.timestamp))
      .limit(1);

    result[metric] = row?.value ?? null;
    if (row && (!measuredAt || row.timestamp > measuredAt)) {
      measuredAt = row.timestamp;
    }
  }

  return {
    temperature: result.temperature ?? null,
    rumination: result.rumination ?? null,
    activity: result.activity ?? null,
    waterIntake: result.water_intake ?? null,
    ph: result.ph ?? null,
    measuredAt,
  };
}

async function getSensorHistory(
  db: DB,
  animalId: string,
  since: Date,
): Promise<readonly SensorSnapshot[]> {
  const rows = await db
    .select()
    .from(sensorMeasurements)
    .where(
      and(
        eq(sensorMeasurements.animalId, animalId),
        gte(sensorMeasurements.timestamp, since),
      ),
    )
    .orderBy(desc(sensorMeasurements.timestamp))
    .limit(500);

  // 타임스탬프별로 그룹핑
  const byTimestamp = new Map<string, Record<string, number | null>>();
  for (const row of rows) {
    const key = row.timestamp.toISOString();
    const existing = byTimestamp.get(key) ?? {};
    byTimestamp.set(key, { ...existing, [row.metricType]: row.value });
  }

  return Array.from(byTimestamp.entries()).map(([ts, values]) => ({
    timestamp: new Date(ts),
    temperature: values.temperature ?? null,
    rumination: values.rumination ?? null,
    activity: values.activity ?? null,
    waterIntake: values.water_intake ?? null,
    ph: values.ph ?? null,
  }));
}

async function getActiveSmaxtecEvents(
  db: DB,
  animalId: string,
): Promise<readonly SmaxtecEvent[]> {
  const rows = await db
    .select()
    .from(smaxtecEvents)
    .where(
      and(
        eq(smaxtecEvents.animalId, animalId),
        eq(smaxtecEvents.acknowledged, false),
      ),
    )
    .orderBy(desc(smaxtecEvents.detectedAt))
    .limit(20);

  return rows.map(mapDbEventToSmaxtecEvent);
}

function mapDbEventToSmaxtecEvent(row: typeof smaxtecEvents.$inferSelect): SmaxtecEvent {
  return {
    eventId: row.eventId,
    type: row.eventType as SmaxtecEvent['type'],
    animalId: row.animalId,
    detectedAt: row.detectedAt,
    confidence: row.confidence,
    severity: row.severity as SmaxtecEvent['severity'],
    stage: row.stage ?? undefined,
    details: (row.details ?? {}) as Record<string, unknown>,
    rawData: (row.rawData ?? {}) as Record<string, unknown>,
  };
}

async function getBreedingHistory(
  db: DB,
  animalId: string,
): Promise<readonly BreedingRecord[]> {
  const rows = await db
    .select()
    .from(breedingEvents)
    .where(eq(breedingEvents.animalId, animalId))
    .orderBy(desc(breedingEvents.eventDate))
    .limit(10);

  return rows.map((r) => ({
    date: r.eventDate,
    semenType: r.semenInfo,
    technician: null,
    result: 'unknown' as const,
  }));
}

// 임신상태 자동계산 — breedingEvents + pregnancyChecks 기반
async function computePregnancyStatus(
  db: DB,
  animalId: string,
): Promise<{ readonly status: string | null; readonly daysSince: number | null }> {
  const MS_PER_DAY = 86_400_000;

  // 최신 수정 기록 조회
  const [latestInsem] = await db
    .select({ eventDate: breedingEvents.eventDate })
    .from(breedingEvents)
    .where(and(eq(breedingEvents.animalId, animalId), eq(breedingEvents.type, 'insemination')))
    .orderBy(desc(breedingEvents.eventDate))
    .limit(1);

  if (!latestInsem) return { status: null, daysSince: null };

  const daysSince = Math.floor((Date.now() - latestInsem.eventDate.getTime()) / MS_PER_DAY);

  // 최신 임신감정 결과 조회
  const [latestCheck] = await db
    .select({ result: pregnancyChecks.result, checkDate: pregnancyChecks.checkDate })
    .from(pregnancyChecks)
    .where(eq(pregnancyChecks.animalId, animalId))
    .orderBy(desc(pregnancyChecks.checkDate))
    .limit(1);

  // 감정 결과가 수정일 이후인 경우에만 유효
  if (latestCheck && latestCheck.checkDate >= latestInsem.eventDate) {
    const isPregnant = latestCheck.result === 'pregnant' || latestCheck.result === 'positive';
    if (isPregnant) {
      return { status: daysSince > 210 ? 'late_gestation' : 'confirmed', daysSince };
    }
    return { status: 'open', daysSince };
  }

  // 감정 미실시
  return { status: 'inseminated', daysSince };
}

async function getHealthHistory(
  db: DB,
  animalId: string,
): Promise<readonly HealthRecord[]> {
  const rows = await db
    .select()
    .from(healthEvents)
    .where(eq(healthEvents.animalId, animalId))
    .orderBy(desc(healthEvents.eventDate))
    .limit(10);

  return rows.map((r) => ({
    date: r.eventDate,
    diagnosis: r.diagnosis ?? '',
    treatment: r.notes,
    vet: null,
  }));
}

function getEmptyDairyProduction(): DairyProduction {
  return { milkYield: null, fat: null, protein: null, scc: null, testDate: null };
}

function getEmptyBeefGrowth(): BeefGrowth {
  return { weight: null, dailyGain: null, gradeEstimate: null, measureDate: null };
}

async function getClusterSignalsForRegion(
  db: DB,
  regionId: string,
  regionFarmIds: readonly string[],
): Promise<readonly ClusterSignal[]> {
  try {
    const activeClusters = await db
      .select()
      .from(diseaseClusters)
      .where(eq(diseaseClusters.status, 'active'));

    if (activeClusters.length === 0) return [];

    const regionFarmIdSet = new Set(regionFarmIds);
    const signals: ClusterSignal[] = [];

    for (const cluster of activeClusters) {
      const memberships = await db
        .select({ farmId: clusterFarmMemberships.farmId })
        .from(clusterFarmMemberships)
        .where(eq(clusterFarmMemberships.clusterId, cluster.clusterId));

      const affectedFarmIds = memberships
        .map((m) => m.farmId)
        .filter((fid) => regionFarmIdSet.has(fid));

      if (affectedFarmIds.length === 0) continue;

      signals.push({
        signalType: cluster.diseaseType,
        description: `${cluster.diseaseType} 클러스터 (${String(cluster.farmCount)}개 농장, ${cluster.level} 수준)`,
        affectedFarms: affectedFarmIds,
        severity: cluster.level === 'outbreak' ? 'critical' : cluster.level === 'warning' ? 'high' : 'medium',
      });
    }

    return signals;
  } catch (error) {
    logger.warn({ regionId, error }, 'Failed to load cluster signals for region');
    return [];
  }
}
