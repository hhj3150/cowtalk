// 확산 분석기 — 시간축 트렌드 + 전파 위험 예측

import type {
  SpreadPrediction,
  FarmProximityRisk,
  ClusterTrend,
  ClusterSnapshot,
  EpidemicAlertLevel,
} from '@cowtalk/shared';
import { PROXIMITY_RISK_RADIUS } from '@cowtalk/shared/constants';
import { haversineDistance, type FarmWithCoordinates } from './geo-utils.js';
import type { DetectedCluster } from './cluster-detector.js';

// ======================================================================
// 근접 농장 위험도 분석
// ======================================================================

/**
 * 클러스터 주변 농장의 전파 위험도를 계산한다.
 *
 * 위험도 점수 (0~100):
 * - 5km 이내: 80~100
 * - 10km 이내: 60~80
 * - 20km 이내: 30~60
 * - 50km 이내: 10~30
 */
export function assessProximityRisk(
  cluster: DetectedCluster,
  allFarms: readonly FarmWithCoordinates[],
): readonly FarmProximityRisk[] {
  const clusterFarmIds = new Set(cluster.farms.map((f) => f.farmId));

  const results: FarmProximityRisk[] = [];

  for (const farm of allFarms) {
    if (clusterFarmIds.has(farm.farmId)) continue;

    const distanceKm = haversineDistance(cluster.center, farm.coordinates);
    if (distanceKm > PROXIMITY_RISK_RADIUS.MONITORING) continue;

    const riskScore = calculateDistanceRiskScore(distanceKm);
    const riskFactors = identifyRiskFactors(distanceKm, cluster);

    results.push({
      farmId: farm.farmId,
      farmName: farm.farmName,
      coordinates: farm.coordinates,
      distanceKm: Math.round(distanceKm * 10) / 10,
      riskScore,
      nearbyClusterIds: [cluster.farms[0]?.farmId ?? ''].filter(Boolean),
      riskFactors,
    });
  }

  return results.sort((a, b) => b.riskScore - a.riskScore);
}

/**
 * 클러스터의 확산 예측
 */
export function predictSpread(
  cluster: DetectedCluster,
  nearbyFarms: readonly FarmProximityRisk[],
): SpreadPrediction {
  const highRiskFarms = nearbyFarms.filter((f) => f.riskScore >= 60);

  // 확산 속도 기반 시간 예측
  const hoursPerFarm =
    cluster.spreadRate.farmsPerDay > 0
      ? 24 / cluster.spreadRate.farmsPerDay
      : 168; // 기본: 1주

  const timeframeHours = Math.round(hoursPerFarm);

  // 확산 방향 추정
  const direction = estimateSpreadDirection(cluster);

  // 확산 확률
  const probability = calculateSpreadProbability(cluster);

  return {
    predictedFarmIds: highRiskFarms.slice(0, 5).map((f) => f.farmId),
    timeframeHours,
    probability,
    direction,
    basis: buildPredictionBasis(cluster, highRiskFarms.length),
  };
}

/**
 * 클러스터 시간축 추이 생성
 *
 * DB 스냅샷 데이터로부터 트렌드를 생성한다.
 * 스냅샷이 없으면 현재 상태만으로 단일 포인트를 반환한다.
 */
export function buildClusterTrend(
  clusterId: string,
  snapshots: readonly ClusterSnapshot[],
): ClusterTrend {
  return {
    clusterId,
    snapshots: [...snapshots].sort(
      (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
    ),
  };
}

/**
 * 현재 클러스터 상태를 스냅샷으로 변환
 */
export function clusterToSnapshot(
  cluster: DetectedCluster,
  date: string,
): ClusterSnapshot {
  return {
    date,
    farmCount: cluster.farms.length,
    eventCount: cluster.totalEvents,
    radiusKm: Math.round(cluster.radiusKm * 10) / 10,
    level: cluster.level as EpidemicAlertLevel,
  };
}

// ======================================================================
// 내부 함수
// ======================================================================

function calculateDistanceRiskScore(distanceKm: number): number {
  if (distanceKm <= PROXIMITY_RISK_RADIUS.IMMEDIATE) {
    return 80 + Math.round(20 * (1 - distanceKm / PROXIMITY_RISK_RADIUS.IMMEDIATE));
  }
  if (distanceKm <= PROXIMITY_RISK_RADIUS.HIGH) {
    return 60 + Math.round(20 * (1 - (distanceKm - PROXIMITY_RISK_RADIUS.IMMEDIATE) / (PROXIMITY_RISK_RADIUS.HIGH - PROXIMITY_RISK_RADIUS.IMMEDIATE)));
  }
  if (distanceKm <= PROXIMITY_RISK_RADIUS.MEDIUM) {
    return 30 + Math.round(30 * (1 - (distanceKm - PROXIMITY_RISK_RADIUS.HIGH) / (PROXIMITY_RISK_RADIUS.MEDIUM - PROXIMITY_RISK_RADIUS.HIGH)));
  }
  return 10 + Math.round(20 * (1 - (distanceKm - PROXIMITY_RISK_RADIUS.MEDIUM) / (PROXIMITY_RISK_RADIUS.MONITORING - PROXIMITY_RISK_RADIUS.MEDIUM)));
}

function identifyRiskFactors(
  distanceKm: number,
  cluster: DetectedCluster,
): readonly string[] {
  const factors: string[] = [];

  if (distanceKm <= PROXIMITY_RISK_RADIUS.IMMEDIATE) {
    factors.push('즉각_위험_반경_내');
  } else if (distanceKm <= PROXIMITY_RISK_RADIUS.HIGH) {
    factors.push('높은_위험_반경_내');
  }

  if (cluster.spreadRate.trend === 'accelerating') {
    factors.push('클러스터_확산_가속_중');
  }

  if (cluster.level === 'outbreak') {
    factors.push('발병_수준_클러스터_인접');
  } else if (cluster.level === 'warning') {
    factors.push('경고_수준_클러스터_인접');
  }

  if (cluster.spreadRate.farmsPerDay >= 1) {
    factors.push('급속_확산_중');
  }

  return factors;
}

function estimateSpreadDirection(cluster: DetectedCluster): string {
  const farms = cluster.farms;
  if (farms.length < 2) return '불확정';

  // 최근 이벤트 농장 vs 초기 이벤트 농장의 방향
  const sorted = [...farms].sort(
    (a, b) => new Date(a.latestEventAt).getTime() - new Date(b.latestEventAt).getTime(),
  );

  const early = sorted.slice(0, Math.ceil(sorted.length / 2));
  const late = sorted.slice(Math.ceil(sorted.length / 2));

  const earlyCenter = {
    lat: early.reduce((s, f) => s + f.coordinates.lat, 0) / early.length,
    lng: early.reduce((s, f) => s + f.coordinates.lng, 0) / early.length,
  };
  const lateCenter = {
    lat: late.reduce((s, f) => s + f.coordinates.lat, 0) / late.length,
    lng: late.reduce((s, f) => s + f.coordinates.lng, 0) / late.length,
  };

  const dLat = lateCenter.lat - earlyCenter.lat;
  const dLng = lateCenter.lng - earlyCenter.lng;

  if (Math.abs(dLat) < 0.01 && Math.abs(dLng) < 0.01) return '중심부_집중';

  const directions: string[] = [];
  if (dLat > 0.01) directions.push('북');
  if (dLat < -0.01) directions.push('남');
  if (dLng > 0.01) directions.push('동');
  if (dLng < -0.01) directions.push('서');

  return directions.join('') + '쪽_확산';
}

function calculateSpreadProbability(cluster: DetectedCluster): number {
  let probability = 0.3; // 기본 확률

  if (cluster.spreadRate.trend === 'accelerating') probability += 0.3;
  if (cluster.spreadRate.trend === 'decelerating') probability -= 0.1;

  if (cluster.level === 'outbreak') probability += 0.2;
  if (cluster.level === 'warning') probability += 0.1;

  if (cluster.spreadRate.farmsPerDay >= 1) probability += 0.1;

  return Math.min(Math.max(probability, 0.1), 0.95);
}

function buildPredictionBasis(cluster: DetectedCluster, nearbyHighRiskCount: number): string {
  const parts: string[] = [];
  parts.push(`${cluster.farms.length}개 농장에서 ${cluster.diseaseType} 클러스터 감지`);
  parts.push(`확산 속도: ${cluster.spreadRate.farmsPerDay.toFixed(1)} 농장/일 (${cluster.spreadRate.trend})`);
  parts.push(`인접 고위험 농장: ${nearbyHighRiskCount}개`);
  return parts.join('. ');
}
