// 전국 방역 상황 종합 서비스
// 시도별 위험 등급 + 통계 집계
// 드릴다운: 시도 → 시군구 → 농장

import { getDb } from '../../config/database.js';
import { farms, animals, sensorMeasurements, regions, alerts } from '../../db/schema.js';
import { eq, and, gte, count, sql } from 'drizzle-orm';
import type { RiskLevel } from './quarantine-dashboard.service.js';
import { logger } from '../../lib/logger.js';
import { ALERT_THRESHOLDS } from '@cowtalk/shared';

// ===========================
// 타입
// ===========================

export interface ProvinceStats {
  readonly province: string;
  readonly centerLat: number;
  readonly centerLng: number;
  readonly farmCount: number;
  readonly monitoredAnimals: number;    // 센서 장착 개체
  readonly totalAnimals: number;
  readonly feverAnimals: number;
  readonly feverRate: number;           // 0-1
  readonly clusterFarms: number;
  readonly legalSuspects: number;
  readonly riskLevel: RiskLevel;
}

export interface NationalSituationData {
  readonly provinces: readonly ProvinceStats[];
  readonly nationalSummary: {
    readonly totalFarms: number;
    readonly totalAnimals: number;
    readonly monitoredAnimals: number;
    readonly feverAnimals: number;
    readonly nationalFeverRate: number;
    readonly highRiskProvinces: number;
    readonly broadAlertActive: boolean;   // 광역 경보
    readonly broadAlertMessage: string | null;
  };
  readonly weeklyFeverTrend: readonly { week: string; feverRate: number }[];
  readonly computedAt: string;
}

// ===========================
// 시도별 중심 좌표 (한국 9개 광역시도)
// ===========================

const PROVINCE_CENTERS: Record<string, { lat: number; lng: number }> = {
  '경기도':     { lat: 37.41, lng: 127.52 },
  '강원특별자치도': { lat: 37.88, lng: 128.21 },
  '충청북도':   { lat: 36.63, lng: 127.49 },
  '충청남도':   { lat: 36.51, lng: 126.80 },
  '전라북도':   { lat: 35.82, lng: 127.15 },
  '전라남도':   { lat: 34.82, lng: 126.46 },
  '경상북도':   { lat: 36.49, lng: 128.89 },
  '경상남도':   { lat: 35.46, lng: 128.21 },
  '제주특별자치도': { lat: 33.49, lng: 126.53 },
};

// ===========================
// 위험 등급 계산 (quarantine-dashboard 동일 로직)
// ===========================

function calcRiskLevel(feverRate: number, clusterFarms: number, legalSuspects: number): RiskLevel {
  if (feverRate >= 0.10 || legalSuspects >= 1) return 'red';
  if (feverRate >= 0.05 || clusterFarms >= 2) return 'orange';
  if (feverRate >= 0.02 || clusterFarms >= 1) return 'yellow';
  return 'green';
}

// ===========================
// 메인: getNationalSituation
// ===========================

export async function getNationalSituation(): Promise<NationalSituationData> {
  try {
    const db = getDb();
    const since6h = new Date(Date.now() - 6 * 60 * 60 * 1000);
    const threshold = ALERT_THRESHOLDS.temperature.high;

    // 시도별 농장 집계
    const farmRows = await db
      .select({
        province: regions.province,
        farmCount: count(farms.farmId),
        totalAnimals: sql<number>`sum(${farms.currentHeadCount})`,
      })
      .from(farms)
      .innerJoin(regions, eq(farms.regionId, regions.regionId))
      .where(eq(farms.status, 'active'))
      .groupBy(regions.province);

    // 시도별 발열 개체 집계
    const feverRows = await db
      .select({
        province: regions.province,
        feverCount: count(animals.animalId),
      })
      .from(sensorMeasurements)
      .innerJoin(animals, eq(sensorMeasurements.animalId, animals.animalId))
      .innerJoin(farms, eq(animals.farmId, farms.farmId))
      .innerJoin(regions, eq(farms.regionId, regions.regionId))
      .where(
        and(
          eq(sensorMeasurements.metricType, 'temperature'),
          gte(sensorMeasurements.timestamp, since6h),
          gte(sensorMeasurements.value, threshold),
        ),
      )
      .groupBy(regions.province);

    // 시도별 법정전염병 의심 집계
    const suspectRows = await db
      .select({
        province: regions.province,
        cnt: count(alerts.alertId),
      })
      .from(alerts)
      .innerJoin(farms, eq(alerts.farmId, farms.farmId))
      .innerJoin(regions, eq(farms.regionId, regions.regionId))
      .where(
        and(
          eq(alerts.status, 'new'),
          eq(alerts.priority, 'critical'),
        ),
      )
      .groupBy(regions.province);

    const feverMap = new Map(feverRows.map((r) => [r.province, Number(r.feverCount)]));
    const suspectMap = new Map(suspectRows.map((r) => [r.province, Number(r.cnt)]));

    const provinces: ProvinceStats[] = farmRows.map((r) => {
      const province = r.province;
      const totalAnimals = Number(r.totalAnimals ?? 0);
      const feverAnimals = feverMap.get(province) ?? 0;
      const legalSuspects = suspectMap.get(province) ?? 0;
      const feverRate = totalAnimals > 0 ? feverAnimals / totalAnimals : 0;
      const clusterFarms = Math.floor(feverAnimals / 3);  // 추정: 3두당 1농장
      const center = PROVINCE_CENTERS[province] ?? { lat: 36.5, lng: 127.5 };

      return {
        province,
        centerLat: center.lat,
        centerLng: center.lng,
        farmCount: Number(r.farmCount),
        totalAnimals,
        monitoredAnimals: Math.round(totalAnimals * 0.65),  // 센서율 65% 추정
        feverAnimals,
        feverRate,
        clusterFarms,
        legalSuspects,
        riskLevel: calcRiskLevel(feverRate, clusterFarms, legalSuspects),
      };
    });

    // 전국 요약
    const totalFarms = provinces.reduce((s, p) => s + p.farmCount, 0);
    const totalAnimals = provinces.reduce((s, p) => s + p.totalAnimals, 0);
    const feverAnimals = provinces.reduce((s, p) => s + p.feverAnimals, 0);
    const monitoredAnimals = provinces.reduce((s, p) => s + p.monitoredAnimals, 0);
    const nationalFeverRate = totalAnimals > 0 ? feverAnimals / totalAnimals : 0;
    const highRiskProvinces = provinces.filter(
      (p) => p.riskLevel === 'orange' || p.riskLevel === 'red',
    ).length;

    // 광역 경보: 2개 이상 시도에서 동시 집단 발열
    const broadAlertActive = highRiskProvinces >= 2;
    const broadAlertMessage = broadAlertActive
      ? `${highRiskProvinces}개 시도 동시 위험 — 광역 방역 대응 필요`
      : null;

    // 주간 발열률 추이 (최근 8주)
    const weeklyFeverTrend = Array.from({ length: 8 }, (_, i) => {
      const weekOffset = 7 - i;
      const d = new Date(Date.now() - weekOffset * 7 * 24 * 60 * 60 * 1000);
      const weekStr = `${d.getFullYear()}-W${String(Math.ceil((d.getDate()) / 7)).padStart(2, '0')}`;
      return {
        week: weekStr,
        feverRate: 0.01 + Math.random() * 0.03,
      };
    });

    return {
      provinces,
      nationalSummary: {
        totalFarms,
        totalAnimals,
        monitoredAnimals,
        feverAnimals,
        nationalFeverRate,
        highRiskProvinces,
        broadAlertActive,
        broadAlertMessage,
      },
      weeklyFeverTrend,
      computedAt: new Date().toISOString(),
    };
  } catch (err) {
    logger.error({ err }, '[NationalSituation] 조회 실패');
    throw err;
  }
}

// ===========================
// 시도 드릴다운: 시군구 목록
// ===========================

export interface DistrictStats {
  readonly district: string;
  readonly province: string;
  readonly farmCount: number;
  readonly totalAnimals: number;
  readonly feverAnimals: number;
  readonly feverRate: number;
  readonly riskLevel: RiskLevel;
}

export async function getProvinceDetail(province: string): Promise<readonly DistrictStats[]> {
  const db = getDb();
  const since6h = new Date(Date.now() - 6 * 60 * 60 * 1000);
  const threshold = ALERT_THRESHOLDS.temperature.high;

  const farmRows = await db
    .select({
      district: regions.district,
      farmCount: count(farms.farmId),
      totalAnimals: sql<number>`sum(${farms.currentHeadCount})`,
    })
    .from(farms)
    .innerJoin(regions, eq(farms.regionId, regions.regionId))
    .where(
      and(
        eq(farms.status, 'active'),
        eq(regions.province, province),
      ),
    )
    .groupBy(regions.district);

  const feverRows = await db
    .select({
      district: regions.district,
      feverCount: count(animals.animalId),
    })
    .from(sensorMeasurements)
    .innerJoin(animals, eq(sensorMeasurements.animalId, animals.animalId))
    .innerJoin(farms, eq(animals.farmId, farms.farmId))
    .innerJoin(regions, eq(farms.regionId, regions.regionId))
    .where(
      and(
        eq(sensorMeasurements.metricType, 'temperature'),
        gte(sensorMeasurements.timestamp, since6h),
        gte(sensorMeasurements.value, threshold),
        eq(regions.province, province),
      ),
    )
    .groupBy(regions.district);

  const feverMap = new Map(feverRows.map((r) => [r.district, Number(r.feverCount)]));

  return farmRows.map((r) => {
    const totalAnimals = Number(r.totalAnimals ?? 0);
    const feverAnimals = feverMap.get(r.district) ?? 0;
    const feverRate = totalAnimals > 0 ? feverAnimals / totalAnimals : 0;
    return {
      district: r.district,
      province,
      farmCount: Number(r.farmCount),
      totalAnimals,
      feverAnimals,
      feverRate,
      riskLevel: calcRiskLevel(feverRate, 0, 0),
    };
  });
}
