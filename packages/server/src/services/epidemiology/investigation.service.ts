// 역학 조사 지원 서비스
// 6항목 자동 수집 → 보고서 양식 자동 완성
// 기존 radius-analyzer, contact-tracer, weather 재활용

import { getDb } from '../../config/database.js';
import { farms, animals, sensorMeasurements } from '../../db/schema.js';
import { eq, and, gte } from 'drizzle-orm';
import { analyzeRadius } from './radius-analyzer.js';
import { buildContactNetwork } from './contact-tracer.js';
import { logger } from '../../lib/logger.js';

// ===========================
// 타입
// ===========================

export type InvestigationStatus =
  | 'draft'
  | 'pending_submit'
  | 'kahis_submitted';

export interface FeverAnimalDetail {
  readonly animalId: string;
  readonly earTag: string;
  readonly name: string | null;
  readonly currentTemp: number | null;
  readonly feverStartAt: string | null;   // ISO
  readonly dsiScore: number;
  readonly tempHistory: readonly { ts: string; value: number }[];
}

export interface InvestigationData {
  readonly investigationId: string;
  readonly farmId: string;
  readonly farm: {
    readonly name: string;
    readonly address: string;
    readonly ownerName: string | null;
    readonly phone: string | null;
    readonly lat: number;
    readonly lng: number;
    readonly currentHeadCount: number;
  };
  readonly feverAnimals: readonly FeverAnimalDetail[];
  readonly radiusSummary: {
    readonly zone500m: { farmCount: number; headCount: number };
    readonly zone1km: { farmCount: number; headCount: number };
    readonly zone3km: { farmCount: number; headCount: number };
  };
  readonly contactNetwork: {
    readonly nodeCount: number;
    readonly edgeCount: number;
    readonly directContacts: number;   // 1-hop 농장 수
  };
  readonly weather: {
    readonly temperature: number | null;
    readonly windDeg: number | null;
    readonly windSpeed: number | null;
    readonly description: string;
  };
  readonly nearbyAbnormalFarms: number;  // 주변 발열 이상 농장 수
  readonly status: InvestigationStatus;
  readonly fieldObservations: string;    // 방역관 현장 소견
  readonly createdAt: string;
  readonly updatedAt: string;
}

// 인메모리 저장소 (데모용 — 프로덕션은 investigations 테이블 필요)
const investigationStore = new Map<string, InvestigationData>();

// ===========================
// 발열 개체 상세 조회
// ===========================

async function fetchFeverAnimals(farmId: string): Promise<readonly FeverAnimalDetail[]> {
  const db = getDb();
  const since48h = new Date(Date.now() - 48 * 60 * 60 * 1000);
  const FEVER_THRESHOLD = 39.2;

  const farmAnimals = await db
    .select({ animalId: animals.animalId, earTag: animals.earTag, name: animals.name })
    .from(animals)
    .where(and(eq(animals.farmId, farmId), eq(animals.status, 'active')));

  const feverAnimals: FeverAnimalDetail[] = [];

  for (const animal of farmAnimals) {
    const tempRows = await db
      .select({ value: sensorMeasurements.value, ts: sensorMeasurements.timestamp })
      .from(sensorMeasurements)
      .where(
        and(
          eq(sensorMeasurements.animalId, animal.animalId),
          eq(sensorMeasurements.metricType, 'temperature'),
          gte(sensorMeasurements.timestamp, since48h),
        ),
      )
      .orderBy(sensorMeasurements.timestamp)
      .limit(100);

    if (tempRows.length === 0) continue;

    const latestTemp = tempRows[tempRows.length - 1]?.value ?? null;
    const isFever = latestTemp !== null && latestTemp >= FEVER_THRESHOLD;
    if (!isFever) continue;

    // 발열 시작 시점: 처음으로 threshold 초과한 시점
    const feverStart = tempRows.find((r) => r.value >= FEVER_THRESHOLD);

    // DSI 추정 (간단화: 체온 기반)
    const dsiScore = Math.min(Math.round((latestTemp - 38.5) * 20), 100);

    feverAnimals.push({
      animalId: animal.animalId,
      earTag: animal.earTag,
      name: animal.name,
      currentTemp: latestTemp,
      feverStartAt: feverStart?.ts.toISOString() ?? null,
      dsiScore: Math.max(0, dsiScore),
      tempHistory: tempRows.slice(-24).map((r) => ({
        ts: r.ts.toISOString(),
        value: r.value,
      })),
    });
  }

  return feverAnimals;
}

// ===========================
// 메인: startInvestigation
// ===========================

export async function startInvestigation(farmId: string): Promise<InvestigationData> {
  const db = getDb();

  logger.info({ farmId }, '[Investigation] 역학 조사 시작');

  // 1. 농장 기본 정보
  const farmRows = await db
    .select()
    .from(farms)
    .where(eq(farms.farmId, farmId))
    .limit(1);

  if (farmRows.length === 0) {
    throw new Error(`Farm not found: ${farmId}`);
  }

  const farm = farmRows[0]!;

  // 2~6. 병렬 수집
  const [feverAnimals, radiusResult, contactResult] = await Promise.all([
    fetchFeverAnimals(farmId),
    analyzeRadius(farmId, [0.5, 1, 3]),
    buildContactNetwork(farmId, 30),
  ]);

  // 반경별 요약
  const zone500m = radiusResult.zones.find((z) => z.radiusKm === 0.5);
  const zone1km = radiusResult.zones.find((z) => z.radiusKm === 1);
  const zone3km = radiusResult.zones.find((z) => z.radiusKm === 3);

  const radiusSummary = {
    zone500m: { farmCount: zone500m?.farmCount ?? 0, headCount: zone500m?.totalHeadCount ?? 0 },
    zone1km: { farmCount: zone1km?.farmCount ?? 0, headCount: zone1km?.totalHeadCount ?? 0 },
    zone3km: { farmCount: zone3km?.farmCount ?? 0, headCount: zone3km?.totalHeadCount ?? 0 },
  };

  // 접촉 네트워크 요약
  const directContacts = contactResult.nodes.filter(
    (n) => n.distanceFromSource === 1,
  ).length;

  const contactNetwork = {
    nodeCount: contactResult.nodes.length,
    edgeCount: contactResult.edges.length,
    directContacts,
  };

  // 기상 데이터 (mock — 실제는 weather API 연동)
  const weather = {
    temperature: 18.0,
    windDeg: 225,
    windSpeed: 3.5,
    description: '맑음, 남서풍 3.5m/s',
  };

  // 주변 이상 농장 수 (3km 내 발열 농장)
  const nearbyAbnormalFarms = zone3km?.feverFarmCount ?? 0;

  const investigationId = crypto.randomUUID();
  const now = new Date().toISOString();

  const investigation: InvestigationData = {
    investigationId,
    farmId,
    farm: {
      name: farm.name,
      address: farm.address,
      ownerName: farm.ownerName,
      phone: farm.phone,
      lat: farm.lat,
      lng: farm.lng,
      currentHeadCount: farm.currentHeadCount,
    },
    feverAnimals,
    radiusSummary,
    contactNetwork,
    weather,
    nearbyAbnormalFarms,
    status: 'draft',
    fieldObservations: '',
    createdAt: now,
    updatedAt: now,
  };

  investigationStore.set(investigationId, investigation);

  return investigation;
}

// ===========================
// 조사 조회
// ===========================

export function getInvestigation(id: string): InvestigationData | null {
  return investigationStore.get(id) ?? null;
}

// ===========================
// 현장 소견 저장 + 상태 변경
// ===========================

export function updateInvestigation(
  id: string,
  patch: { fieldObservations?: string; status?: InvestigationStatus },
): InvestigationData | null {
  const existing = investigationStore.get(id);
  if (!existing) return null;

  const updated: InvestigationData = {
    ...existing,
    fieldObservations: patch.fieldObservations ?? existing.fieldObservations,
    status: patch.status ?? existing.status,
    updatedAt: new Date().toISOString(),
  };

  investigationStore.set(id, updated);
  return updated;
}
