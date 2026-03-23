// 반경별 역학 위험 분석
// 기본 반경: [500m, 1km, 3km, 5km, 10km]
// haversine.ts 재활용

import { getDb } from '../../config/database.js';
import { farms, animals, sensorMeasurements } from '../../db/schema.js';
import { eq, gte, and } from 'drizzle-orm';
import { haversineKm } from '../../lib/haversine.js';
import { logger } from '../../lib/logger.js';
import { ALERT_THRESHOLDS } from '@cowtalk/shared';

// ===========================
// 타입
// ===========================

export interface RadiusZone {
  readonly radiusKm: number;
  readonly radiusLabel: string;
  readonly farmCount: number;
  readonly totalHeadCount: number;
  readonly sensoredFarmCount: number;
  readonly sensorRate: number;          // 0-1
  readonly feverAnimalCount: number;
  readonly feverFarmCount: number;
  readonly riskLevel: 'low' | 'medium' | 'high' | 'critical';
  readonly farms: readonly NearbyFarm[];
}

export interface NearbyFarm {
  readonly farmId: string;
  readonly farmName: string;
  readonly distanceKm: number;
  readonly headCount: number;
  readonly hasSensor: boolean;
  readonly feverCount: number;
  readonly lat: number;
  readonly lng: number;
}

export interface RadiusAnalysisResult {
  readonly centerFarmId: string;
  readonly centerFarmName: string;
  readonly centerLat: number;
  readonly centerLng: number;
  readonly zones: readonly RadiusZone[];
  readonly totalFarmsInMaxRadius: number;
  readonly analyzedAt: string;
}

const DEFAULT_RADII_KM = [0.5, 1, 3, 5, 10] as const;

// ===========================
// 반경 분석
// ===========================

export async function analyzeRadius(
  farmId: string,
  radiiKm: readonly number[] = DEFAULT_RADII_KM,
): Promise<RadiusAnalysisResult> {
  const db = getDb();

  // 중심 농장 정보
  const centerFarmRows = await db.select({
    farmId: farms.farmId,
    name: farms.name,
    lat: farms.lat,
    lng: farms.lng,
  })
    .from(farms)
    .where(eq(farms.farmId, farmId))
    .limit(1);

  if (!centerFarmRows[0]) {
    throw new Error(`Farm not found: ${farmId}`);
  }

  const center = centerFarmRows[0];

  // 모든 활성 농장
  const allFarms = await db.select({
    farmId: farms.farmId,
    name: farms.name,
    lat: farms.lat,
    lng: farms.lng,
    currentHeadCount: farms.currentHeadCount,
  })
    .from(farms)
    .where(eq(farms.status, 'active'));

  // 최근 6시간 발열 개체 (39.5°C 이상)
  const sixHoursAgo = new Date(Date.now() - 6 * 60 * 60 * 1000);

  const feverMeasurements = await db.select({
    animalId: sensorMeasurements.animalId,
    value: sensorMeasurements.value,
  })
    .from(sensorMeasurements)
    .where(and(
      eq(sensorMeasurements.metricType, 'temperature'),
      gte(sensorMeasurements.timestamp, sixHoursAgo),
      gte(sensorMeasurements.value, ALERT_THRESHOLDS.temperature.high),
    ));

  // 발열 개체 → 농장 매핑
  const feverAnimalIds = new Set(feverMeasurements.map((m) => m.animalId));

  const farmAnimals = await db.select({
    animalId: animals.animalId,
    farmId: animals.farmId,
    currentDeviceId: animals.currentDeviceId,
  })
    .from(animals)
    .where(eq(animals.status, 'active'));

  const farmFeverCount = new Map<string, number>();
  const farmHasSensor = new Map<string, boolean>();

  for (const animal of farmAnimals) {
    if (feverAnimalIds.has(animal.animalId)) {
      farmFeverCount.set(animal.farmId, (farmFeverCount.get(animal.farmId) ?? 0) + 1);
    }
    if (animal.currentDeviceId) {
      farmHasSensor.set(animal.farmId, true);
    }
  }

  // 거리 계산 및 반경별 집계
  const farmsWithDistance = allFarms
    .filter((f) => f.farmId !== farmId)
    .map((f) => ({
      ...f,
      distanceKm: haversineKm(center.lat, center.lng, f.lat, f.lng),
    }))
    .sort((a, b) => a.distanceKm - b.distanceKm);

  const maxRadius = Math.max(...radiiKm);
  const nearbyFarms = farmsWithDistance.filter((f) => f.distanceKm <= maxRadius);

  const zones: RadiusZone[] = radiiKm.map((radiusKm) => {
    const inZone = nearbyFarms.filter((f) => f.distanceKm <= radiusKm);
    const totalHead = inZone.reduce((sum, f) => sum + f.currentHeadCount, 0);
    const sensoredCount = inZone.filter((f) => farmHasSensor.get(f.farmId)).length;
    const feverFarms = inZone.filter((f) => (farmFeverCount.get(f.farmId) ?? 0) > 0);
    const feverTotal = feverFarms.reduce((sum, f) => sum + (farmFeverCount.get(f.farmId) ?? 0), 0);

    const label = radiusKm < 1 ? `${radiusKm * 1000}m` : `${radiusKm}km`;

    return {
      radiusKm,
      radiusLabel: label,
      farmCount: inZone.length,
      totalHeadCount: totalHead,
      sensoredFarmCount: sensoredCount,
      sensorRate: inZone.length > 0 ? sensoredCount / inZone.length : 0,
      feverAnimalCount: feverTotal,
      feverFarmCount: feverFarms.length,
      riskLevel: calcRiskLevel(feverFarms.length, inZone.length),
      farms: inZone.slice(0, 10).map((f) => ({
        farmId: f.farmId,
        farmName: f.name,
        distanceKm: Math.round(f.distanceKm * 100) / 100,
        headCount: f.currentHeadCount,
        hasSensor: farmHasSensor.get(f.farmId) ?? false,
        feverCount: farmFeverCount.get(f.farmId) ?? 0,
        lat: f.lat,
        lng: f.lng,
      })),
    };
  });

  logger.info({ farmId, maxRadius, nearbyCount: nearbyFarms.length }, '[RadiusAnalyzer] Analysis complete');

  return {
    centerFarmId: center.farmId,
    centerFarmName: center.name,
    centerLat: center.lat,
    centerLng: center.lng,
    zones,
    totalFarmsInMaxRadius: nearbyFarms.length,
    analyzedAt: new Date().toISOString(),
  };
}

function calcRiskLevel(feverFarmCount: number, totalFarmCount: number): RadiusZone['riskLevel'] {
  if (totalFarmCount === 0) return 'low';
  const ratio = feverFarmCount / totalFarmCount;
  if (ratio >= 0.3 || feverFarmCount >= 5) return 'critical';
  if (ratio >= 0.15 || feverFarmCount >= 3) return 'high';
  if (feverFarmCount >= 1) return 'medium';
  return 'low';
}
