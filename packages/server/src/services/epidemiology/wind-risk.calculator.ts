// Gaussian Plume 공기 전파 위험 계산
// 바람 방향 + 속도 → 공기 전파 위험 지도
// FMD, 결핵, 탄저 등 공기 전파 가능 질병에만 적용

import { haversineKm } from '../../lib/haversine.js';
import type { LegalDiseaseCode } from '../earlyDetection/disease-signature.db.js';

// ===========================
// 공기 전파 질병 목록
// ===========================

const AIRBORNE_DISEASES = new Set<LegalDiseaseCode>(['FMD', 'TB', 'ANTHRAX']);

const DISEASE_EMISSION_RATES: Partial<Record<LegalDiseaseCode, number>> = {
  FMD: 1.0,      // 최고 배출률
  ANTHRAX: 0.8,
  TB: 0.4,
};

// ===========================
// 타입
// ===========================

export type WindRiskLevel = 'none' | 'low' | 'medium' | 'high';

export interface WindRiskTarget {
  readonly farmId: string;
  readonly farmName: string;
  readonly distanceKm: number;
  readonly bearingDeg: number;       // 발원지 기준 방향
  readonly downwindFactor: number;   // 0-1 (1 = 정 하류)
  readonly concentration: number;    // 상대 농도 (0-1)
  readonly riskLevel: WindRiskLevel;
}

export interface WindRiskResult {
  readonly sourceFarmId: string;
  readonly diseaseCode: LegalDiseaseCode;
  readonly isAirborne: boolean;
  readonly windDeg: number;         // 바람 방향 (기상학적 — 바람이 불어오는 방향)
  readonly windSpeedMs: number;
  readonly stabilityClass: string;  // Pasquill-Gifford 안정도 등급
  readonly affectedFarms: readonly WindRiskTarget[];
  readonly calculatedAt: string;
}

// ===========================
// Pasquill-Gifford 확산 계수
// (바람 속도 기반 단순화)
// ===========================

function getStabilityClass(windSpeedMs: number, isDaytime: boolean): string {
  if (windSpeedMs < 2) return isDaytime ? 'A' : 'F';
  if (windSpeedMs < 3) return isDaytime ? 'B' : 'E';
  if (windSpeedMs < 5) return 'C';
  if (windSpeedMs < 6) return 'D';
  return 'D';
}

// σy, σz (가로/수직 확산 계수) — 단순화된 공식
function calcSigma(distM: number, stabilityClass: string): { sy: number; sz: number } {
  const a: Record<string, number> = { A: 0.22, B: 0.16, C: 0.11, D: 0.08, E: 0.06, F: 0.04 };
  const b: Record<string, number> = { A: 0.16, B: 0.12, C: 0.08, D: 0.06, E: 0.03, F: 0.016 };
  const aVal = a[stabilityClass] ?? 0.08;
  const bVal = b[stabilityClass] ?? 0.06;
  return {
    sy: aVal * distM ** 0.894,
    sz: bVal * distM ** 0.714,
  };
}

// ===========================
// 방향각 계산 (두 좌표 간)
// ===========================

function bearingDeg(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const toRad = (d: number) => d * Math.PI / 180;
  const dLng = toRad(lng2 - lng1);
  const y = Math.sin(dLng) * Math.cos(toRad(lat2));
  const x = Math.cos(toRad(lat1)) * Math.sin(toRad(lat2)) -
    Math.sin(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.cos(dLng);
  return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
}

// 바람 방향 → 하류 방향 (기상학적 방향의 반대)
function windDownstreamDeg(windFromDeg: number): number {
  return (windFromDeg + 180) % 360;
}

// 하류 방향과 대상 방향의 정렬 정도 (1 = 정렬, 0 = 반대)
function downwindAlignment(targetBearing: number, windDownstream: number): number {
  const diff = Math.abs(targetBearing - windDownstream);
  const angleDiff = Math.min(diff, 360 - diff);
  return Math.max(0, 1 - angleDiff / 90);
}

// ===========================
// Gaussian Plume 농도 계산
// ===========================

function gaussianConcentration(
  distM: number,
  crosswindM: number,
  windSpeedMs: number,
  emissionRate: number,
  stabilityClass: string,
  stackHeightM = 2.0,  // 동물 호흡 높이 기준
): number {
  const { sy, sz } = calcSigma(distM, stabilityClass);
  if (sy === 0 || sz === 0 || windSpeedMs === 0) return 0;

  const u = Math.max(windSpeedMs, 0.1);
  const concentration =
    (emissionRate / (2 * Math.PI * sy * sz * u)) *
    Math.exp(-0.5 * (crosswindM / sy) ** 2) *
    Math.exp(-0.5 * (stackHeightM / sz) ** 2);

  return Math.min(concentration, 1);
}

// ===========================
// 메인: calculateWindRisk
// ===========================

export interface NearbyFarmLocation {
  readonly farmId: string;
  readonly farmName: string;
  readonly lat: number;
  readonly lng: number;
}

export function calculateWindRisk(params: {
  sourceFarmId: string;
  sourceLat: number;
  sourceLng: number;
  diseaseCode: LegalDiseaseCode;
  windDeg: number;        // 바람이 불어오는 방향 (기상학적)
  windSpeedMs: number;
  nearbyFarms: readonly NearbyFarmLocation[];
  isDaytime?: boolean;
}): WindRiskResult {
  const isAirborne = AIRBORNE_DISEASES.has(params.diseaseCode);
  const emissionRate = DISEASE_EMISSION_RATES[params.diseaseCode] ?? 0.5;
  const stabilityClass = getStabilityClass(params.windSpeedMs, params.isDaytime ?? true);
  const downstreamDeg = windDownstreamDeg(params.windDeg);

  const affectedFarms: WindRiskTarget[] = [];

  if (isAirborne) {
    for (const farm of params.nearbyFarms) {
      const distKm = haversineKm(params.sourceLat, params.sourceLng, farm.lat, farm.lng);
      const distM = distKm * 1000;
      if (distM < 10) continue;

      const bearing = bearingDeg(params.sourceLat, params.sourceLng, farm.lat, farm.lng);
      const alignment = downwindAlignment(bearing, downstreamDeg);

      // 횡풍 거리 (정 하류가 아닐 경우)
      const crosswindM = distM * Math.sin((1 - alignment) * Math.PI / 2);

      const concentration = gaussianConcentration(
        distM * alignment,
        crosswindM,
        params.windSpeedMs,
        emissionRate,
        stabilityClass,
      );

      const normalizedConc = Math.min(concentration * 1e6, 1);  // 정규화
      const downwindFactor = alignment;

      const riskLevel = calcWindRiskLevel(normalizedConc, alignment);

      affectedFarms.push({
        farmId: farm.farmId,
        farmName: farm.farmName,
        distanceKm: Math.round(distKm * 100) / 100,
        bearingDeg: Math.round(bearing),
        downwindFactor: Math.round(downwindFactor * 100) / 100,
        concentration: Math.round(normalizedConc * 1000) / 1000,
        riskLevel,
      });
    }
  }

  return {
    sourceFarmId: params.sourceFarmId,
    diseaseCode: params.diseaseCode,
    isAirborne,
    windDeg: params.windDeg,
    windSpeedMs: params.windSpeedMs,
    stabilityClass,
    affectedFarms: affectedFarms
      .filter((f) => f.riskLevel !== 'none')
      .sort((a, b) => b.concentration - a.concentration),
    calculatedAt: new Date().toISOString(),
  };
}

function calcWindRiskLevel(concentration: number, downwindFactor: number): WindRiskLevel {
  if (downwindFactor < 0.2) return 'none';
  if (concentration >= 0.5) return 'high';
  if (concentration >= 0.2) return 'medium';
  if (concentration >= 0.05) return 'low';
  return 'none';
}
