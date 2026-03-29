// 역학 조사 지원 서비스
// 6항목 자동 수집 → DB 영속화 → 보고서 양식 자동 완성
// 기존 radius-analyzer, contact-tracer, weather 재활용

import { getDb } from '../../config/database.js';
import { farms, animals, sensorMeasurements } from '../../db/schema.js';
import { eq, and, gte } from 'drizzle-orm';
import { analyzeRadius } from './radius-analyzer.js';
import { buildContactNetwork } from './contact-tracer.js';
import {
  insertInvestigation,
  getInvestigationById,
  getInvestigationsByFarm,
  listInvestigations as listInvestigationsRepo,
  updateInvestigation as updateInvestigationRepo,
} from '../../db/repositories/investigation.repository.js';
import type { InvestigationRow, InvestigationSummaryRow } from '../../db/repositories/investigation.repository.js';
import { logger } from '../../lib/logger.js';
import type {
  InvestigationStatus,
  InvestigationData,
  FeverAnimalDetail,
  InvestigationPatch,
} from '@cowtalk/shared';

// re-export 타입 (기존 import 호환)
export type { InvestigationStatus, InvestigationData, FeverAnimalDetail };

// ===========================
// DB row → API 응답 변환
// ===========================

function rowToInvestigationData(row: InvestigationRow): InvestigationData {
  return {
    investigationId: row.investigationId,
    farmId: row.farmId,
    initiatedBy: row.initiatedBy,
    clusterId: row.clusterId,
    farm: {
      name: row.farmName,
      address: row.farmAddress,
      ownerName: row.farmOwnerName,
      phone: row.farmPhone,
      lat: row.farmLat,
      lng: row.farmLng,
      currentHeadCount: row.farmHeadCount,
    },
    feverAnimals: row.feverAnimals as readonly FeverAnimalDetail[],
    radiusSummary: row.radiusSummary as InvestigationData['radiusSummary'],
    contactNetwork: row.contactNetwork as InvestigationData['contactNetwork'],
    weather: row.weather as InvestigationData['weather'],
    nearbyAbnormalFarms: row.nearbyAbnormalFarms,
    status: row.status as InvestigationStatus,
    fieldObservations: row.fieldObservations,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

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

    const feverStart = tempRows.find((r) => r.value >= FEVER_THRESHOLD);
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

  const nearbyAbnormalFarms = zone3km?.feverFarmCount ?? 0;

  // DB INSERT
  const investigationId = await insertInvestigation(db, {
    farmId,
    feverAnimals,
    radiusSummary,
    contactNetwork,
    weather,
    nearbyAbnormalFarms,
  });

  logger.info({ investigationId, farmId }, '[Investigation] DB 저장 완료');

  // DB에서 farm JOIN 포함 재조회
  const row = await getInvestigationById(db, investigationId);
  if (!row) {
    throw new Error(`Investigation insert succeeded but read failed: ${investigationId}`);
  }

  return rowToInvestigationData(row);
}

// ===========================
// 조사 조회
// ===========================

export async function getInvestigation(id: string): Promise<InvestigationData | null> {
  const db = getDb();
  const row = await getInvestigationById(db, id);
  return row ? rowToInvestigationData(row) : null;
}

// ===========================
// 농장별 조사 이력
// ===========================

export async function listFarmInvestigations(farmId: string): Promise<readonly InvestigationSummaryRow[]> {
  const db = getDb();
  return getInvestigationsByFarm(db, farmId);
}

// ===========================
// 전체 조사 목록 (필터)
// ===========================

export async function listInvestigations(filters?: {
  readonly status?: string;
  readonly since?: string;
  readonly limit?: number;
}): Promise<readonly InvestigationSummaryRow[]> {
  const db = getDb();
  return listInvestigationsRepo(db, {
    status: filters?.status,
    since: filters?.since ? new Date(filters.since) : undefined,
    limit: filters?.limit,
  });
}

// ===========================
// 현장 소견 저장 + 상태 변경
// ===========================

export async function updateInvestigation(
  id: string,
  patch: InvestigationPatch,
): Promise<InvestigationData | null> {
  const db = getDb();
  const row = await updateInvestigationRepo(db, id, patch);
  return row ? rowToInvestigationData(row) : null;
}
