// 목장 지수 시도/전국 롤업 — 행정관 뷰
//
// "전국 어디가 좋아지고 어디가 나빠지는가"를 farm_index_snapshots 실측으로 답한다.
// 정직성: 최근 7일 내 스냅샷이 있는 농장만 집계에 포함하고,
// 커버리지("N/전체 농장 스냅샷 기준")를 반드시 함께 노출한다. 스냅샷 없는 시도는 null('—').

import { getDb } from '../../config/database.js';
import { farms, farmIndexSnapshots, regions } from '../../db/schema.js';
import { and, eq, gte, isNull, sql } from 'drizzle-orm';
import { resolveFarmProvince } from '../epidemiology/province-mapper.js';
import { logger } from '../../lib/logger.js';

const MS_PER_DAY = 86_400_000;

export interface ProvinceIndexRollup {
  readonly province: string;
  /** 스냅샷 보유 농장 수 (집계 모수) */
  readonly snappedFarms: number;
  /** 시도 전체 활성 농장 수 */
  readonly totalFarms: number;
  /** 시도 평균 점수 (스냅샷 농장만, 없으면 null) */
  readonly avgOverall: number | null;
  /** 7일 전 대비 변화 (이전 스냅샷 부족 시 null) */
  readonly delta7d: number | null;
}

export interface NationalIndexRollup {
  readonly nationalAvg: number | null;
  readonly snappedFarms: number;
  readonly totalFarms: number;
  readonly provinces: readonly ProvinceIndexRollup[];
  readonly asOfDate: string;
  readonly generatedAt: string;
}

interface FarmLatest {
  readonly farmId: string;
  readonly province: string;
  readonly overall: number | null;
  readonly prevOverall: number | null;
}

/** 시도별 집계 (순수 함수 — 테스트 대상) */
export function rollupByProvince(
  farmRows: readonly FarmLatest[],
  totalByProvince: ReadonlyMap<string, number>,
): { provinces: ProvinceIndexRollup[]; nationalAvg: number | null; snappedFarms: number } {
  const byProvince = new Map<string, FarmLatest[]>();
  for (const f of farmRows) {
    const list = byProvince.get(f.province) ?? [];
    list.push(f);
    byProvince.set(f.province, list);
  }

  const provinces: ProvinceIndexRollup[] = [];
  const allProvinces = new Set([...totalByProvince.keys(), ...byProvince.keys()]);
  for (const province of allProvinces) {
    const list = byProvince.get(province) ?? [];
    const scored = list.filter((f): f is FarmLatest & { overall: number } => f.overall != null);
    const avgOverall = scored.length > 0
      ? Math.round(scored.reduce((s, f) => s + f.overall, 0) / scored.length)
      : null;
    const withPrev = scored.filter((f): f is FarmLatest & { overall: number; prevOverall: number } => f.prevOverall != null);
    const delta7d = withPrev.length > 0
      ? Math.round(
          withPrev.reduce((s, f) => s + (f.overall - f.prevOverall), 0) / withPrev.length,
        )
      : null;
    provinces.push({
      province,
      snappedFarms: scored.length,
      totalFarms: totalByProvince.get(province) ?? list.length,
      avgOverall,
      delta7d,
    });
  }
  provinces.sort((a, b) => (b.avgOverall ?? -1) - (a.avgOverall ?? -1));

  const allScored = farmRows.filter((f): f is FarmLatest & { overall: number } => f.overall != null);
  const nationalAvg = allScored.length > 0
    ? Math.round(allScored.reduce((s, f) => s + f.overall, 0) / allScored.length)
    : null;

  return { provinces, nationalAvg, snappedFarms: allScored.length };
}

export async function getNationalIndexRollup(): Promise<NationalIndexRollup> {
  const db = getDb();
  const since7dStr = new Date(Date.now() - 7 * MS_PER_DAY).toISOString().slice(0, 10);
  const since14dStr = new Date(Date.now() - 14 * MS_PER_DAY).toISOString().slice(0, 10);

  // 활성 농장 + 시도 판별 재료
  const farmRows = await db
    .select({
      farmId: farms.farmId,
      address: farms.address,
      lat: farms.lat,
      lng: farms.lng,
      regionProvince: regions.province,
    })
    .from(farms)
    .leftJoin(regions, eq(farms.regionId, regions.regionId))
    .where(and(eq(farms.status, 'active'), isNull(farms.deletedAt)));

  const provinceByFarm = new Map<string, string>();
  const totalByProvince = new Map<string, number>();
  for (const f of farmRows) {
    const province = resolveFarmProvince({
      regionProvince: f.regionProvince,
      address: f.address,
      lat: f.lat,
      lng: f.lng,
    });
    provinceByFarm.set(f.farmId, province);
    totalByProvince.set(province, (totalByProvince.get(province) ?? 0) + 1);
  }

  // 농장별 최근 14일 스냅샷 → 최신(≤7일)과 그 이전(7~14일) 대표값
  const snaps = await db
    .select({
      farmId: farmIndexSnapshots.farmId,
      date: farmIndexSnapshots.date,
      overall: farmIndexSnapshots.overall,
    })
    .from(farmIndexSnapshots)
    .where(gte(farmIndexSnapshots.date, since14dStr))
    .orderBy(sql`${farmIndexSnapshots.farmId}, ${farmIndexSnapshots.date} desc`);

  const latestByFarm = new Map<string, { overall: number | null; prevOverall: number | null }>();
  for (const s of snaps) {
    const existing = latestByFarm.get(s.farmId);
    if (!existing) {
      // 최신 스냅샷 — 7일 내가 아니면 집계 제외 (스테일 데이터 방지)
      if (s.date >= since7dStr) {
        latestByFarm.set(s.farmId, { overall: s.overall, prevOverall: null });
      }
    } else if (existing.prevOverall == null && s.date < since7dStr) {
      existing.prevOverall = s.overall;
      latestByFarm.set(s.farmId, existing);
    }
  }

  const merged: FarmLatest[] = [...latestByFarm.entries()].map(([farmId, v]) => ({
    farmId,
    province: provinceByFarm.get(farmId) ?? '기타',
    overall: v.overall,
    prevOverall: v.prevOverall,
  }));

  const { provinces, nationalAvg, snappedFarms } = rollupByProvince(merged, totalByProvince);

  logger.debug({ snappedFarms, totalFarms: farmRows.length }, '[IndexRollup] 전국 롤업 계산');

  return {
    nationalAvg,
    snappedFarms,
    totalFarms: farmRows.length,
    provinces,
    asOfDate: new Date().toISOString().slice(0, 10),
    generatedAt: new Date().toISOString(),
  };
}
