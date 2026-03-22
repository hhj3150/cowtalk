// 질병 클러스터 감지 엔진
// smaXtec 이벤트 데이터에서 다농장 질병 패턴을 자동 감지한다.
// DBSCAN류 알고리즘: "반경 내 최소 N개 농장" 규칙으로 클러스터 감지

import type { Coordinates } from '@cowtalk/shared';
import {
  CLUSTER_DETECTION,
  ALERT_LEVEL_THRESHOLDS,
  EPIDEMIC_RELEVANT_EVENT_TYPES,
  DISEASE_PATTERN_MAP,
} from '@cowtalk/shared/constants';
import {
  haversineDistance,
  calculateClusterCenter,
  calculateClusterRadius,
  type FarmWithCoordinates,
} from './geo-utils.js';

// ======================================================================
// 타입
// ======================================================================

export interface FarmEventAggregate {
  readonly farmId: string;
  readonly farmName: string;
  readonly coordinates: Coordinates;
  readonly events: readonly HealthEventRecord[];
  readonly totalEventCount: number;
  readonly latestEventAt: Date;
  readonly dominantEventType: string;
}

export interface HealthEventRecord {
  readonly eventId: string;
  readonly eventType: string;
  readonly detectedAt: Date;
  readonly severity: string;
  readonly animalId: string;
}

export interface DetectedCluster {
  readonly diseaseType: string;
  readonly center: Coordinates;
  readonly radiusKm: number;
  readonly level: 'watch' | 'warning' | 'outbreak';
  readonly farms: readonly ClusterFarm[];
  readonly totalEvents: number;
  readonly spreadRate: {
    readonly farmsPerDay: number;
    readonly eventsPerDay: number;
    readonly trend: 'accelerating' | 'stable' | 'decelerating';
  };
  readonly firstEventAt: Date;
  readonly lastEventAt: Date;
}

export interface ClusterFarm {
  readonly farmId: string;
  readonly farmName: string;
  readonly coordinates: Coordinates;
  readonly eventCount: number;
  readonly latestEventAt: Date;
  readonly distanceFromCenter: number;
}

// ======================================================================
// 클러스터 감지
// ======================================================================

/**
 * smaXtec 건강 이벤트를 농장별로 집계한다.
 */
export function aggregateEventsByFarm(
  _events: readonly HealthEventRecord[],
  farms: readonly FarmWithCoordinates[],
  farmIdToEvents: ReadonlyMap<string, readonly HealthEventRecord[]>,
): readonly FarmEventAggregate[] {
  const farmMap = new Map(farms.map((f) => [f.farmId, f]));

  return Array.from(farmIdToEvents.entries())
    .filter(([farmId]) => farmMap.has(farmId))
    .map(([farmId, farmEvents]) => {
      const farm = farmMap.get(farmId)!;
      const sorted = [...farmEvents].sort(
        (a, b) => new Date(b.detectedAt).getTime() - new Date(a.detectedAt).getTime(),
      );

      const typeCounts = new Map<string, number>();
      for (const evt of farmEvents) {
        const mapped = DISEASE_PATTERN_MAP[evt.eventType] ?? evt.eventType;
        typeCounts.set(mapped, (typeCounts.get(mapped) ?? 0) + 1);
      }

      let dominantType = '';
      let maxCount = 0;
      for (const [type, count] of typeCounts) {
        if (count > maxCount) {
          dominantType = type;
          maxCount = count;
        }
      }

      return {
        farmId,
        farmName: farm.farmName,
        coordinates: farm.coordinates,
        events: farmEvents,
        totalEventCount: farmEvents.length,
        latestEventAt: sorted[0]?.detectedAt ?? new Date(),
        dominantEventType: dominantType,
      };
    })
    .filter((agg) => agg.totalEventCount >= CLUSTER_DETECTION.MIN_EVENTS_PER_FARM);
}

/**
 * DBSCAN류 클러스터 감지
 *
 * 1. 각 농장을 seed로 잡고 반경 내 다른 농장을 탐색
 * 2. 반경 내 최소 N개 농장이 있으면 클러스터로 판정
 * 3. 유사 질병 타입끼리 그룹핑
 * 4. 중복 제거 (이미 다른 클러스터에 속한 농장은 재사용 가능하지만 클러스터 자체는 중복 방지)
 */
export function detectClusters(
  farmAggregates: readonly FarmEventAggregate[],
): readonly DetectedCluster[] {
  if (farmAggregates.length < CLUSTER_DETECTION.MIN_FARMS) {
    return [];
  }

  // 질병 타입별 농장 그룹핑
  const byDiseaseType = groupByDiseaseType(farmAggregates);
  const clusters: DetectedCluster[] = [];

  for (const [diseaseType, farms] of byDiseaseType) {
    const diseaseTypeClusters = detectClustersForDiseaseType(diseaseType, farms);
    clusters.push(...diseaseTypeClusters);
  }

  return clusters;
}

/**
 * 이벤트 타입이 전염병 관련인지 확인
 */
export function isEpidemicRelevantEvent(eventType: string): boolean {
  return (EPIDEMIC_RELEVANT_EVENT_TYPES as readonly string[]).includes(eventType);
}

// ======================================================================
// 내부 함수
// ======================================================================

function groupByDiseaseType(
  farms: readonly FarmEventAggregate[],
): ReadonlyMap<string, readonly FarmEventAggregate[]> {
  const groups = new Map<string, FarmEventAggregate[]>();

  for (const farm of farms) {
    const type = farm.dominantEventType;
    const existing = groups.get(type) ?? [];
    groups.set(type, [...existing, farm]);
  }

  return groups;
}

function detectClustersForDiseaseType(
  diseaseType: string,
  farms: readonly FarmEventAggregate[],
): readonly DetectedCluster[] {
  if (farms.length < CLUSTER_DETECTION.MIN_FARMS) {
    return [];
  }

  const visited = new Set<string>();
  const clusters: DetectedCluster[] = [];

  for (const seedFarm of farms) {
    if (visited.has(seedFarm.farmId)) continue;

    // 반경 내 농장 찾기
    const neighbors = farms.filter(
      (f) =>
        f.farmId !== seedFarm.farmId &&
        haversineDistance(seedFarm.coordinates, f.coordinates) <= CLUSTER_DETECTION.RADIUS_KM,
    );

    const clusterFarms = [seedFarm, ...neighbors];

    if (clusterFarms.length < CLUSTER_DETECTION.MIN_FARMS) continue;

    const totalEvents = clusterFarms.reduce((sum, f) => sum + f.totalEventCount, 0);
    if (totalEvents < CLUSTER_DETECTION.MIN_TOTAL_EVENTS) continue;

    // 클러스터 확정
    for (const f of clusterFarms) {
      visited.add(f.farmId);
    }

    const center = calculateClusterCenter(clusterFarms);
    const radiusKm = calculateClusterRadius(center, clusterFarms);
    const level = assessClusterLevel(clusterFarms.length, totalEvents, 0);
    const spreadRate = calculateSpreadRate(clusterFarms);

    const allEvents = clusterFarms.flatMap((f) => f.events);
    const sortedByTime = [...allEvents].sort(
      (a, b) => new Date(a.detectedAt).getTime() - new Date(b.detectedAt).getTime(),
    );

    clusters.push({
      diseaseType,
      center,
      radiusKm,
      level,
      farms: clusterFarms.map((f) => ({
        farmId: f.farmId,
        farmName: f.farmName,
        coordinates: f.coordinates,
        eventCount: f.totalEventCount,
        latestEventAt: f.latestEventAt,
        distanceFromCenter: haversineDistance(center, f.coordinates),
      })),
      totalEvents,
      spreadRate,
      firstEventAt: sortedByTime[0]?.detectedAt ?? new Date(),
      lastEventAt: sortedByTime[sortedByTime.length - 1]?.detectedAt ?? new Date(),
    });
  }

  return clusters;
}

function assessClusterLevel(
  farmCount: number,
  eventCount: number,
  spreadRateFarmsPerDay: number,
): 'watch' | 'warning' | 'outbreak' {
  if (
    farmCount >= ALERT_LEVEL_THRESHOLDS.OUTBREAK.minFarms ||
    eventCount >= ALERT_LEVEL_THRESHOLDS.OUTBREAK.minEvents ||
    spreadRateFarmsPerDay >= ALERT_LEVEL_THRESHOLDS.OUTBREAK.minSpreadRate
  ) {
    return 'outbreak';
  }

  if (
    farmCount >= ALERT_LEVEL_THRESHOLDS.WARNING.minFarms ||
    eventCount >= ALERT_LEVEL_THRESHOLDS.WARNING.minEvents ||
    spreadRateFarmsPerDay >= ALERT_LEVEL_THRESHOLDS.WARNING.minSpreadRate
  ) {
    return 'warning';
  }

  return 'watch';
}

function calculateSpreadRate(
  farms: readonly FarmEventAggregate[],
): DetectedCluster['spreadRate'] {
  const allEvents = farms.flatMap((f) => f.events);
  if (allEvents.length < 2) {
    return { farmsPerDay: 0, eventsPerDay: 0, trend: 'stable' };
  }

  const sorted = [...allEvents].sort(
    (a, b) => new Date(a.detectedAt).getTime() - new Date(b.detectedAt).getTime(),
  );

  const firstTime = new Date(sorted[0]!.detectedAt).getTime();
  const lastTime = new Date(sorted[sorted.length - 1]!.detectedAt).getTime();
  const daysSpan = Math.max((lastTime - firstTime) / (1000 * 60 * 60 * 24), 1);

  const eventsPerDay = allEvents.length / daysSpan;
  const farmsPerDay = farms.length / daysSpan;

  // 트렌드: 후반부 이벤트 밀도 vs 전반부
  const midTime = firstTime + (lastTime - firstTime) / 2;
  const firstHalf = sorted.filter((e) => new Date(e.detectedAt).getTime() <= midTime);
  const secondHalf = sorted.filter((e) => new Date(e.detectedAt).getTime() > midTime);

  const firstHalfRate = firstHalf.length / Math.max(daysSpan / 2, 0.5);
  const secondHalfRate = secondHalf.length / Math.max(daysSpan / 2, 0.5);

  let trend: 'accelerating' | 'stable' | 'decelerating' = 'stable';
  if (secondHalfRate > firstHalfRate * 1.3) {
    trend = 'accelerating';
  } else if (secondHalfRate < firstHalfRate * 0.7) {
    trend = 'decelerating';
  }

  return { farmsPerDay, eventsPerDay, trend };
}
