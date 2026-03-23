// 농장 내 집단 발열 감지 — 24시간 내 Level 2+ 3두 이상 → 클러스터 경보
// 열사병 보정 (기온 30도+), 백신 접종 후 발열 하향 조정

import { getDb } from '../../config/database.js';
import { animals, sensorMeasurements } from '../../db/schema.js';
import { eq, gte, and, inArray } from 'drizzle-orm';
import { evaluate as evaluateTemp } from './temperature-profile.service.js';
import { logger } from '../../lib/logger.js';

// ===========================
// 타입
// ===========================

export type ClusterSeverity = 'none' | 'watch' | 'cluster' | 'outbreak';

export interface FeverAnimal {
  readonly animalId: string;
  readonly earTag: string;
  readonly currentTemp: number;
  readonly level: 1 | 2 | 3;
}

export interface ClusterResult {
  readonly farmId: string;
  readonly severity: ClusterSeverity;
  readonly feverCount: number;        // Level 2+ 두수
  readonly totalActiveCount: number;
  readonly feverAnimals: readonly FeverAnimal[];
  readonly heatStressAdjusted: boolean;  // 열사병 보정 적용 여부
  readonly message: string;
  readonly evaluatedAt: string;
}

// ===========================
// 농장 집단 발열 평가
// ===========================

export async function evaluateFarmCluster(
  farmId: string,
  ambientTempC?: number,  // 외부 기온 (기상 API에서 전달)
): Promise<ClusterResult> {
  const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const db = getDb();

  // 농장 활성 개체 목록
  const farmAnimals = await db.select({ animalId: animals.animalId, earTag: animals.earTag })
    .from(animals)
    .where(and(eq(animals.farmId, farmId), eq(animals.status, 'active')));

  if (farmAnimals.length === 0) {
    return makeResult(farmId, 'none', [], farmAnimals.length, false);
  }

  const animalIds = farmAnimals.map((a) => a.animalId);

  // 최근 24시간 체온 측정값 per animal
  const recentMeasurements = await db.select({
    animalId: sensorMeasurements.animalId,
    value: sensorMeasurements.value,
    timestamp: sensorMeasurements.timestamp,
  })
    .from(sensorMeasurements)
    .where(and(
      inArray(sensorMeasurements.animalId, animalIds),
      eq(sensorMeasurements.metricType, 'temperature'),
      gte(sensorMeasurements.timestamp, twentyFourHoursAgo),
    ))
    .orderBy(sensorMeasurements.timestamp);

  // animalId → 최근 측정값 배열
  const tempsByAnimal = new Map<string, number[]>();
  for (const m of recentMeasurements) {
    const arr = tempsByAnimal.get(m.animalId) ?? [];
    arr.push(m.value);
    tempsByAnimal.set(m.animalId, arr);
  }

  // 각 개체 Level 평가
  const feverAnimals: FeverAnimal[] = [];

  await Promise.all(farmAnimals.map(async (animal) => {
    const temps = tempsByAnimal.get(animal.animalId) ?? [];
    if (temps.length === 0) return;

    const currentTemp = temps[temps.length - 1] ?? 38.5;
    try {
      const result = await evaluateTemp(animal.animalId, currentTemp, temps.slice(-4));
      if (result.level && result.level >= 2) {
        feverAnimals.push({
          animalId: animal.animalId,
          earTag: animal.earTag,
          currentTemp,
          level: result.level as 1 | 2 | 3,
        });
      }
    } catch (err) {
      logger.warn({ err, animalId: animal.animalId }, '[FarmCluster] evaluate failed');
    }
  }));

  // 열사병 보정 — 기온 30°C 이상 시 Level 하향 (집단 발열 임계 완화)
  const heatStressAdjusted = (ambientTempC ?? 0) >= 30;
  const threshold = heatStressAdjusted ? 5 : 3;  // 열사병 시 5두 이상부터 클러스터

  const severity = determineSeverity(feverAnimals.length, threshold, farmAnimals.length);

  return makeResult(farmId, severity, feverAnimals, farmAnimals.length, heatStressAdjusted);
}

function determineSeverity(
  feverCount: number,
  clusterThreshold: number,
  totalCount: number,
): ClusterSeverity {
  if (feverCount === 0) return 'none';
  const ratio = feverCount / totalCount;
  if (ratio >= 0.3 || feverCount >= 10) return 'outbreak';  // 30% 이상 또는 10두 이상
  if (feverCount >= clusterThreshold) return 'cluster';
  if (feverCount >= 1) return 'watch';
  return 'none';
}

function makeResult(
  farmId: string,
  severity: ClusterSeverity,
  feverAnimals: readonly FeverAnimal[],
  totalActiveCount: number,
  heatStressAdjusted: boolean,
): ClusterResult {
  const messages: Readonly<Record<ClusterSeverity, string>> = {
    none: '집단 발열 없음 — 정상',
    watch: `${feverAnimals.length}두 발열 의심 — 관찰 필요`,
    cluster: `⚠️ ${feverAnimals.length}두 집단 발열 감지 — 격리 및 수의사 방문 권고`,
    outbreak: `🚨 ${feverAnimals.length}두 집단 발병 의심 — 즉시 방역 조치 필요`,
  };

  return {
    farmId,
    severity,
    feverCount: feverAnimals.length,
    totalActiveCount,
    feverAnimals,
    heatStressAdjusted,
    message: messages[severity],
    evaluatedAt: new Date().toISOString(),
  };
}
