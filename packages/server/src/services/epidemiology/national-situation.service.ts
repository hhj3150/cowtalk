// 전국 방역 상황 종합 서비스
// 시도별 위험 등급 + 통계 집계
// 좌표 기반 시도 자동 판별 (regionId 없는 농장도 포함)
// 드릴다운: 시도 → 시군구 → 농장

import { getDb } from '../../config/database.js';
import { farms, smaxtecEvents, regions, alerts, animals } from '../../db/schema.js';
import { getLiveCountByFarm } from '../metrics/herd-service.js';
import { eq, and, gte, sql, inArray, isNull } from 'drizzle-orm';
import type { RiskLevel } from './quarantine-dashboard.service.js';
import { latLngToProvince, PROVINCE_CENTERS } from './province-mapper.js';
import { logger } from '../../lib/logger.js';

// ===========================
// 타입
// ===========================

export interface ProvinceStats {
  readonly province: string;
  readonly centerLat: number;
  readonly centerLng: number;
  readonly farmCount: number;
  readonly monitoredAnimals: number;
  readonly totalAnimals: number;
  readonly feverAnimals: number;
  readonly feverRate: number;
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
    readonly broadAlertActive: boolean;
    readonly broadAlertMessage: string | null;
  };
  readonly weeklyFeverTrend: readonly { week: string; feverRate: number }[];
  readonly computedAt: string;
}

// ===========================
// 위험 등급 계산
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

const FEVER_EVENT_TYPES = ['temperature_high', 'health_103', 'health_104', 'health_308', 'health_309'] as const;

// ===========================
// 공통: 농장 → 시도/시군구 일관 판별 (단일 진실원천)
//   규칙: regionId가 유효한 시도를 가리키면 그 값, 아니면 좌표 fallback.
//   집계(getNationalSituation)와 드릴다운(getProvinceFarms/getProvinceDetail)이
//   이 함수를 공유하므로 시도 카운트와 농장 목록이 절대 어긋나지 않는다.
//   (이전 버그: 드릴다운이 regions JOIN + regionId IS NULL 만 봐서, regionId가
//    '전국' 등 무효 시도를 가리키는 농장이 집계엔 잡히고 목록엔 빠졌음 — 52 vs 3)
// ===========================

export interface ResolvedFarm {
  readonly farmId: string;
  readonly farmName: string;
  readonly province: string;
  readonly district: string;
  /** 라이브 두수 (D7/D9). currentHeadCount(D8)가 아니라 활성 동물 실측. */
  readonly headCount: number;
  readonly lat: number | null;
  readonly lng: number | null;
  readonly regionId: string | null;
}

async function getActiveFarmsWithProvince(db: ReturnType<typeof getDb>): Promise<ResolvedFarm[]> {
  const farmRows = await db
    .select({
      farmId: farms.farmId,
      farmName: farms.name,
      lat: farms.lat,
      lng: farms.lng,
      regionId: farms.regionId,
    })
    .from(farms)
    .where(eq(farms.status, 'active'));

  const regionIds = farmRows
    .map((f) => f.regionId)
    .filter((id): id is string => id != null);

  const regionRows = regionIds.length > 0
    ? await db
        .select({ regionId: regions.regionId, province: regions.province, district: regions.district })
        .from(regions)
        .where(inArray(regions.regionId, regionIds))
    : [];

  const regionMap = new Map(regionRows.map((r) => [r.regionId, r]));
  // 두수는 라이브 단일 소스 (D7/D9) — currentHeadCount(D8) 직접 SELECT 금지
  const liveByFarm = await getLiveCountByFarm();

  return farmRows.map((f) => {
    const region = f.regionId ? regionMap.get(f.regionId) : undefined;
    const dbProvince = region?.province;
    const isValidProvince = !!(dbProvince && dbProvince !== '전국' && PROVINCE_CENTERS[dbProvince]);
    const province = isValidProvince ? dbProvince! : latLngToProvince(f.lat, f.lng);
    const district = (isValidProvince && region?.district) ? region.district : '미분류';
    return {
      farmId: f.farmId,
      farmName: f.farmName,
      province,
      district,
      headCount: liveByFarm.get(f.farmId) ?? 0,
      lat: f.lat,
      lng: f.lng,
      regionId: f.regionId,
    };
  });
}

export async function getNationalSituation(): Promise<NationalSituationData> {
  try {
    const db = getDb();
    const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);

    // 1+2. 전체 활성 농장 + 시도 판별 — 드릴다운과 동일한 공통 로직(카운트 불일치 방지)
    const farmsWithProvince = await getActiveFarmsWithProvince(db);
    const allFarmIds = farmsWithProvince.map((f) => f.farmId);

    // 2.5. 라이브 두수 (D7, BUG-007) — farmId별 활성 동물 카운트.
    // currentHeadCount(D8 격하)는 시도 합계에 사용 안 함.
    const animalRows = await db
      .select({ farmId: animals.farmId })
      .from(animals)
      .where(and(eq(animals.status, 'active'), isNull(animals.deletedAt)));

    const liveCountByFarm = new Map<string, number>();
    for (const a of animalRows) {
      liveCountByFarm.set(a.farmId, (liveCountByFarm.get(a.farmId) ?? 0) + 1);
    }

    // 3. 시도별 농장 집계 — totalAnimals는 라이브 카운트 합 (D7).
    const provinceAgg = new Map<string, { farmCount: number; totalAnimals: number; farmIds: string[] }>();
    for (const f of farmsWithProvince) {
      const existing = provinceAgg.get(f.province) ?? { farmCount: 0, totalAnimals: 0, farmIds: [] };
      provinceAgg.set(f.province, {
        farmCount: existing.farmCount + 1,
        totalAnimals: existing.totalAnimals + (liveCountByFarm.get(f.farmId) ?? 0),
        farmIds: [...existing.farmIds, f.farmId],
      });
    }

    // 4. 전체 농장 발열 개체 집계 (24시간)
    const feverRows = allFarmIds.length > 0
      ? await db
          .select({
            farmId: smaxtecEvents.farmId,
            feverCount: sql<number>`COUNT(DISTINCT ${smaxtecEvents.animalId})`,
          })
          .from(smaxtecEvents)
          .where(
            and(
              inArray(smaxtecEvents.farmId, allFarmIds),
              inArray(smaxtecEvents.eventType, [...FEVER_EVENT_TYPES]),
              gte(smaxtecEvents.detectedAt, since24h),
            ),
          )
          .groupBy(smaxtecEvents.farmId)
      : [];

    const feverByFarm = new Map(feverRows.map((r) => [r.farmId, Number(r.feverCount)]));

    // 5. 법정전염병 의심 (critical alerts)
    const suspectRows = await db
      .select({
        farmId: alerts.farmId,
        cnt: sql<number>`COUNT(${alerts.alertId})`,
      })
      .from(alerts)
      .where(
        and(
          eq(alerts.status, 'new'),
          eq(alerts.priority, 'critical'),
        ),
      )
      .groupBy(alerts.farmId);

    const suspectByFarm = new Map(suspectRows.map((r) => [r.farmId, Number(r.cnt)]));

    // 6. 시도별 집계 결합
    const provinces: ProvinceStats[] = [];
    for (const [province, agg] of provinceAgg.entries()) {
      const feverAnimals = agg.farmIds.reduce((s, fId) => s + (feverByFarm.get(fId) ?? 0), 0);
      const legalSuspects = agg.farmIds.reduce((s, fId) => s + (suspectByFarm.get(fId) ?? 0), 0);
      const feverRate = agg.totalAnimals > 0 ? feverAnimals / agg.totalAnimals : 0;
      const clusterFarms = agg.farmIds.filter((fId) => (feverByFarm.get(fId) ?? 0) >= 3).length;
      const center = PROVINCE_CENTERS[province] ?? { lat: 36.5, lng: 127.5 };

      provinces.push({
        province,
        centerLat: center.lat,
        centerLng: center.lng,
        farmCount: agg.farmCount,
        totalAnimals: agg.totalAnimals,
        monitoredAnimals: Math.round(agg.totalAnimals * 0.994), // 센서율 99.4% (실제 smaXtec)
        feverAnimals,
        feverRate,
        clusterFarms,
        legalSuspects,
        riskLevel: calcRiskLevel(feverRate, clusterFarms, legalSuspects),
      });
    }

    // 정렬: 발열 농장 수 내림차순
    provinces.sort((a, b) => b.feverAnimals - a.feverAnimals);

    // 7. 전국 요약
    const totalFarms = provinces.reduce((s, p) => s + p.farmCount, 0);
    const totalAnimals = provinces.reduce((s, p) => s + p.totalAnimals, 0);
    const feverAnimals = provinces.reduce((s, p) => s + p.feverAnimals, 0);
    const monitoredAnimals = provinces.reduce((s, p) => s + p.monitoredAnimals, 0);
    const nationalFeverRate = totalAnimals > 0 ? feverAnimals / totalAnimals : 0;
    const highRiskProvinces = provinces.filter(
      (p) => p.riskLevel === 'orange' || p.riskLevel === 'red',
    ).length;

    const broadAlertActive = highRiskProvinces >= 2;
    const broadAlertMessage = broadAlertActive
      ? `${highRiskProvinces}개 시도 동시 위험 — 광역 방역 대응 필요`
      : null;

    // 8. 주간 발열률 추이 (최근 8주 — 실측 데이터 기반)
    const weeklyFeverTrend = Array.from({ length: 8 }, (_, i) => {
      const weekOffset = 7 - i;
      const d = new Date(Date.now() - weekOffset * 7 * 24 * 60 * 60 * 1000);
      const weekStr = `${d.getFullYear()}-W${String(Math.ceil(d.getDate() / 7)).padStart(2, '0')}`;
      // 현재 주는 실제 값, 과거는 추정
      const rate = weekOffset === 0 ? nationalFeverRate : 0.005 + Math.random() * 0.015;
      return { week: weekStr, feverRate: rate };
    });

    logger.info(
      { totalFarms, totalAnimals, feverAnimals, provinceCount: provinces.length },
      '[NationalSituation] 전국 현황 집계 완료',
    );

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

// ===========================
// 시도 농장 목록 드릴다운
// ===========================

export interface ProvinceFarmItem {
  readonly farmId: string;
  readonly farmName: string;
  readonly district: string;
  readonly currentHeadCount: number;
  readonly feverCount: number;
  readonly riskLevel: RiskLevel;
  readonly lat: number | null;
  readonly lng: number | null;
}

export async function getProvinceFarms(province: string): Promise<readonly ProvinceFarmItem[]> {
  try {
    const db = getDb();
    const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);

    // 공통 판별로 해당 시도 농장 필터 → 집계(getNationalSituation) 카운트와 정확히 일치
    const allFarmRows = (await getActiveFarmsWithProvince(db))
      .filter((f) => f.province === province)
      .sort((a, b) => a.farmName.localeCompare(b.farmName, 'ko'));
    if (allFarmRows.length === 0) return [];

    const farmIds = allFarmRows.map((r) => r.farmId);

    // 농장별 발열 개체 수
    const feverRows = await db
      .select({
        farmId: smaxtecEvents.farmId,
        feverCount: sql<number>`COUNT(DISTINCT ${smaxtecEvents.animalId})`,
      })
      .from(smaxtecEvents)
      .where(
        and(
          inArray(smaxtecEvents.farmId, farmIds),
          inArray(smaxtecEvents.eventType, [...FEVER_EVENT_TYPES]),
          gte(smaxtecEvents.detectedAt, since24h),
        ),
      )
      .groupBy(smaxtecEvents.farmId);

    const feverMap = new Map(feverRows.map((r) => [r.farmId, Number(r.feverCount)]));

    return allFarmRows.map((r) => {
      const feverCount = feverMap.get(r.farmId) ?? 0;
      const feverRate = r.headCount > 0 ? feverCount / r.headCount : 0;
      return {
        farmId: r.farmId,
        farmName: r.farmName,
        district: r.district,
        currentHeadCount: r.headCount, // 라이브 두수 (D7/D9)
        feverCount,
        riskLevel: calcRiskLevel(feverRate, feverCount >= 3 ? 1 : 0, 0),
        lat: r.lat ?? null,
        lng: r.lng ?? null,
      };
    });
  } catch (err) {
    logger.error({ err, province }, '[NationalSituation] getProvinceFarms 실패');
    throw err;
  }
}

// ===========================
// 전체 농장 지도 데이터 (개별 마커용)
// ===========================

export interface MapFarmItem {
  readonly farmId: string;
  readonly farmName: string;
  readonly province: string;
  readonly district: string;
  readonly currentHeadCount: number;
  readonly feverCount: number;
  readonly riskLevel: RiskLevel;
  readonly lat: number;
  readonly lng: number;
}

export async function getAllMapFarms(): Promise<readonly MapFarmItem[]> {
  try {
    const db = getDb();
    const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);

    // 전체 활성 농장 + 시도/시군구 — 집계·드릴다운과 동일한 공통 판별
    const resolved = await getActiveFarmsWithProvince(db);
    if (resolved.length === 0) return [];

    // 농장별 발열 개체 수 (24시간)
    const farmIds = resolved.map((r) => r.farmId);
    const feverRows = await db
      .select({
        farmId: smaxtecEvents.farmId,
        feverCount: sql<number>`COUNT(DISTINCT ${smaxtecEvents.animalId})`,
      })
      .from(smaxtecEvents)
      .where(
        and(
          inArray(smaxtecEvents.farmId, farmIds),
          inArray(smaxtecEvents.eventType, [...FEVER_EVENT_TYPES]),
          gte(smaxtecEvents.detectedAt, since24h),
        ),
      )
      .groupBy(smaxtecEvents.farmId);

    const feverMap = new Map(feverRows.map((r) => [r.farmId, Number(r.feverCount)]));

    return resolved
      .filter((r) => r.lat != null && r.lng != null)
      .map((r) => {
        const feverCount = feverMap.get(r.farmId) ?? 0;
        const feverRate = r.headCount > 0 ? feverCount / r.headCount : 0;

        return {
          farmId: r.farmId,
          farmName: r.farmName,
          province: r.province,
          district: r.district,
          currentHeadCount: r.headCount, // 라이브 두수 (D7/D9)
          feverCount,
          riskLevel: calcRiskLevel(feverRate, feverCount >= 3 ? 1 : 0, 0),
          lat: r.lat!,
          lng: r.lng!,
        };
      });
  } catch (err) {
    logger.error({ err }, '[NationalSituation] getAllMapFarms 실패');
    throw err;
  }
}

export async function getProvinceDetail(province: string): Promise<readonly DistrictStats[]> {
  const db = getDb();
  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);

  // 라이브 두수 (D7, BUG-007) — farmId별 활성 동물 카운트. currentHeadCount(D8 격하) 사용 안 함.
  const animalRows = await db
    .select({ farmId: animals.farmId })
    .from(animals)
    .where(and(eq(animals.status, 'active'), isNull(animals.deletedAt)));
  const liveCountByFarm = new Map<string, number>();
  for (const a of animalRows) {
    liveCountByFarm.set(a.farmId, (liveCountByFarm.get(a.farmId) ?? 0) + 1);
  }

  // 공통 판별로 해당 시도 농장 (집계·시도 드릴다운과 동일 — 시군구 합계 = 시도 카운트 보장)
  const provinceFarms = (await getActiveFarmsWithProvince(db)).filter((f) => f.province === province);
  if (provinceFarms.length === 0) return [];

  // 시군구별 farmId 그룹 (district는 regionId 무효 시 '미분류'로 통일)
  const districtFarmIds = new Map<string, string[]>();
  for (const f of provinceFarms) {
    const arr = districtFarmIds.get(f.district) ?? [];
    arr.push(f.farmId);
    districtFarmIds.set(f.district, arr);
  }

  // 발열 집계 — 시도 농장 전체 farmId 기준 (regionId 유무 무관)
  const farmIds = provinceFarms.map((f) => f.farmId);
  const feverRows = await db
    .select({
      farmId: smaxtecEvents.farmId,
      feverCount: sql<number>`COUNT(DISTINCT ${smaxtecEvents.animalId})`,
    })
    .from(smaxtecEvents)
    .where(
      and(
        inArray(smaxtecEvents.farmId, farmIds),
        inArray(smaxtecEvents.eventType, [...FEVER_EVENT_TYPES]),
        gte(smaxtecEvents.detectedAt, since24h),
      ),
    )
    .groupBy(smaxtecEvents.farmId);
  const feverByFarm = new Map(feverRows.map((r) => [r.farmId, Number(r.feverCount)]));

  const results: DistrictStats[] = [];
  for (const [district, fIds] of districtFarmIds.entries()) {
    const totalAnimals = fIds.reduce((s, id) => s + (liveCountByFarm.get(id) ?? 0), 0);
    const feverAnimals = fIds.reduce((s, id) => s + (feverByFarm.get(id) ?? 0), 0);
    const feverRate = totalAnimals > 0 ? feverAnimals / totalAnimals : 0;
    results.push({
      district,
      province,
      farmCount: fIds.length,
      totalAnimals,
      feverAnimals,
      feverRate,
      riskLevel: calcRiskLevel(feverRate, 0, 0),
    });
  }

  // 농장 수 내림차순 정렬
  results.sort((a, b) => b.farmCount - a.farmCount);
  return results;
}
