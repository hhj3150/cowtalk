// 군 센서 개요 서비스 — "이상신호(이벤트)"가 아니라 "전체 데이터의 평균"을 본다.
//
// 목장 평균 ↔ 품종 평균 ↔ 지역(시도) 평균 ↔ 전국 평균 4단 비교.
// 원천은 sensor_daily_agg(smaXtec 원시 측정의 일별 집계)이며, 평균은 개체 가중이다:
//   개체별 기간 평균을 먼저 구하고 그 평균을 낸다 (측정 횟수가 많은 개체가 군 평균을 지배하지 않게).
//
// 대상 메트릭: 체온·활동량·반추·음수량·음수 횟수.
//   음수량(L/일)은 smaXtec 이 체온 딥으로 산출한 추정치(water_intake, L/10min → ×144 일 환산)로
//   smaXtec 화면의 "음수량 (l/24h)"와 같은 원천이다. 음수 횟수는 CowTalk 이 원시 체온 V자 딥에서 파생한다.
//   pH는 smaXtec 별도 볼루스(거의 미장착)라 원시값이 올라오지 않으므로 개요 대상에서 제외한다.
//
// 기준(품종/지역/전국) 통계는 농장명 없는 익명 집계이며 10분 캐시된다.

import { sql, type SQL } from 'drizzle-orm';
import type {
  BreedGroup,
  HerdComposition,
  HerdMetricComparison,
  HerdMetricStat,
  HerdOverviewMetric,
  HerdSensorOverview,
} from '@cowtalk/shared';
import { resolveBreedType } from '@cowtalk/shared';
import { getDb } from '../../config/database.js';
import { resolveFarmProvince } from '../epidemiology/province-mapper.js';
import { herdGroupSqlCase } from './herd-group.js';
import { logger } from '../../lib/logger.js';

// ===========================
// 상수
// ===========================

export const OVERVIEW_METRICS: readonly HerdOverviewMetric[] = ['temperature', 'activity', 'rumination', 'water_intake', 'drinking'];

export const METRIC_UNIT: Readonly<Record<HerdOverviewMetric, string>> = {
  temperature: '°C',
  activity: 'index',
  rumination: '분/일',
  water_intake: 'L/일',
  drinking: '회/일',
};

export const METRIC_LABEL: Readonly<Record<HerdOverviewMetric, string>> = {
  temperature: '체온',
  activity: '활동량',
  rumination: '반추',
  water_intake: '음수량',
  drinking: '음수 횟수',
};

/** 개요 메트릭 → sensor_daily_agg.metric_type. 음수 횟수는 'drinking'(L/일 의미로 읽는 소비자 있음)과 분리 */
const METRIC_DB_TYPE: Readonly<Record<HerdOverviewMetric, string>> = {
  temperature: 'temperature',
  activity: 'activity',
  rumination: 'rumination',
  water_intake: 'water_intake',
  drinking: 'drinking_cycles',
};

/**
 * 일별 집계값 → 개요 단위 환산 계수.
 * water_intake 원시값은 smaXtec L/10min 이라 일별 avg × 144 샘플 = L/일 (소버린 로더와 같은 규약).
 */
export const METRIC_DAILY_SCALE: Readonly<Record<HerdOverviewMetric, number>> = {
  temperature: 1,
  activity: 1,
  rumination: 1,
  water_intake: 144,
  drinking: 1,
};

/** 메트릭별 반올림 자릿수 */
const METRIC_DIGITS: Readonly<Record<HerdOverviewMetric, number>> = {
  temperature: 2,
  activity: 0,
  rumination: 0,
  water_intake: 1,
  drinking: 1,
};

export const DEFAULT_DAYS = 7;
export const MAX_DAYS = 30;

/** 기준 통계 캐시 TTL — 지역·전국·품종 평균은 분 단위로 변하지 않는다 */
const REFERENCE_CACHE_TTL_MS = 10 * 60 * 1000;

/**
 * 품종군별 문헌 참고 범위 (성우 기준). 실측 품종 평균이 우선이고 이 값은 보조 해석용이다.
 * 물소(Bubalus bubalis)는 소보다 직장온이 낮은 편이며 반추 시간도 사료·기후에 따라 폭이 넓다.
 */
export const BREED_REFERENCE_RANGES: Readonly<Record<BreedGroup, {
  readonly temperature: readonly [number, number];
  readonly rumination: readonly [number, number];
  readonly label: string;
}>> = {
  dairy: { temperature: [38.0, 39.3], rumination: [420, 600], label: '젖소(Holstein/Jersey 등)' },
  beef: { temperature: [38.0, 39.3], rumination: [360, 540], label: '육우(한우 등)' },
  buffalo: { temperature: [37.5, 38.8], rumination: [360, 540], label: '물소(Bubalus bubalis, 카라바우/무라 등)' },
  other: { temperature: [38.0, 39.3], rumination: [360, 600], label: '기타' },
};

// ===========================
// 순수 함수 (테스트 대상)
// ===========================

const BUFFALO_KEYWORDS = ['buffalo', 'carabao', 'bubalus', 'murrah', '물소', 'nili', 'swamp'];

/** 품종 문자열 → 품종군. 물소 판별을 먼저 하고, 나머지는 기존 dairy/beef 규칙을 따른다. */
export function classifyBreedGroup(breed: string | null | undefined): BreedGroup {
  if (!breed) return 'other';
  const b = breed.toLowerCase();
  if (BUFFALO_KEYWORDS.some((k) => b.includes(k))) return 'buffalo';
  return resolveBreedType(b);
}

export interface BreedCount {
  readonly breed: string;
  readonly count: number;
}

/** 목장에서 가장 많은 품종 (동률이면 사전순 앞) — 품종 평균 비교 기준 */
export function pickDominantBreed(counts: readonly BreedCount[]): string | null {
  if (counts.length === 0) return null;
  const sorted = [...counts].sort((a, b) => b.count - a.count || a.breed.localeCompare(b.breed));
  return sorted[0]?.breed ?? null;
}

const round = (v: number, digits: number): number => {
  const f = 10 ** digits;
  return Math.round(v * f) / f;
};

/** 두 통계의 평균 차 (a − b). 둘 중 하나라도 없으면 null */
export function computeDelta(a: HerdMetricStat | null, b: HerdMetricStat | null): number | null {
  if (!a || !b) return null;
  return round(a.avg - b.avg, 2);
}

export interface DailyPoint {
  readonly date: string;
  readonly avg: number;
}

/**
 * 목장 일별 평균의 추세: 뒤 절반 평균 − 앞 절반 평균.
 * 날짜 4개 미만이면 추세를 말할 수 없으므로 null.
 */
export function computeTrend(points: readonly DailyPoint[]): number | null {
  const sorted = [...points].sort((a, b) => a.date.localeCompare(b.date));
  if (sorted.length < 4) return null;
  const half = Math.floor(sorted.length / 2);
  const first = sorted.slice(0, half);
  const last = sorted.slice(sorted.length - half);
  const mean = (arr: readonly DailyPoint[]): number => arr.reduce((s, p) => s + p.avg, 0) / arr.length;
  return round(mean(last) - mean(first), 2);
}

export interface RawStatRow {
  readonly animals: number | string | null;
  readonly farms: number | string | null;
  readonly avg: number | string | null;
  readonly min: number | string | null;
  readonly max: number | string | null;
  readonly stddev: number | string | null;
  readonly rows: number | string | null;
}

/** 집계 SQL 결과 행 → HerdMetricStat. 개체 0이면 null (평균이 존재하지 않는다) */
export function toStat(row: RawStatRow | undefined, digits = 2): HerdMetricStat | null {
  if (!row) return null;
  const animals = Number(row.animals ?? 0);
  if (!Number.isFinite(animals) || animals <= 0 || row.avg === null || row.avg === undefined) return null;
  return {
    avg: round(Number(row.avg), digits),
    min: round(Number(row.min), digits),
    max: round(Number(row.max), digits),
    stddev: round(Number(row.stddev ?? 0), digits),
    animals,
    farms: Number(row.farms ?? 0),
    rows: Number(row.rows ?? 0),
  };
}

const fmt = (v: number | null | undefined, unit: string): string =>
  v === null || v === undefined ? '—' : `${String(v)}${unit === 'index' ? '' : unit}`;

const fmtDelta = (v: number | null): string => {
  if (v === null) return '';
  const sign = v > 0 ? '+' : '';
  return ` (${sign}${String(v)})`;
};

/**
 * 프롬프트·보고서용 마크다운 블록. 표 1개 + 정직성 주석.
 * 숫자는 이미 반올림된 값이며, 여기서는 해석을 덧붙이지 않는다 — 해석은 Claude의 몫.
 */
export function buildOverviewLines(o: HerdSensorOverview): string[] {
  const lines: string[] = [];
  const scopeLabel = o.farmName ? `${o.farmName}` : (o.coverage.province ?? '전국');
  lines.push(`### 군 센서 개요 — 최근 ${String(o.days)}일 실측 평균 (${o.from} ~ ${o.to}, ${scopeLabel})`);
  const h = o.coverage.herd;
  if (h) {
    const parts = [
      `총 ${String(h.total)}두`,
      `센서 착용 ${String(h.withSensor)}두`,
      `착유 ${String(h.milking)} / 건유 ${String(h.dry)} / 육성 ${String(h.heifer)}`,
    ];
    if (h.avgParity !== null) parts.push(`평균 산차 ${String(h.avgParity)}`);
    if (h.avgDaysInMilk !== null) parts.push(`착유우 평균 DIM ${String(h.avgDaysInMilk)}일`);
    lines.push(`- 우군 구성: ${parts.join(' · ')}`);
  }
  lines.push('| 지표 | 목장 평균 | 품종 평균 (차이) | 지역 평균 (차이) | 전국 평균 (차이) | 목장 추세 |');
  lines.push('|---|---|---|---|---|---|');
  for (const m of o.metrics) {
    const u = m.unit;
    const farmCell = m.farm
      ? `${fmt(m.farm.avg, u)} (${String(m.farm.animals)}두, 범위 ${fmt(m.farm.min, u)}~${fmt(m.farm.max, u)})`
      : '데이터 없음';
    const breedCell = m.breed ? `${fmt(m.breed.avg, u)}${fmtDelta(m.deltaVsBreed)} · ${String(m.breed.animals)}두` : '—';
    const regionCell = m.region ? `${fmt(m.region.avg, u)}${fmtDelta(m.deltaVsRegion)} · ${String(m.region.farms)}농장` : '—';
    const nationalCell = m.national ? `${fmt(m.national.avg, u)}${fmtDelta(m.deltaVsNational)} · ${String(m.national.farms)}농장` : '—';
    const trendCell = m.farmTrend === null ? '—' : `${m.farmTrend > 0 ? '+' : ''}${String(m.farmTrend)}${u === 'index' ? '' : u}`;
    lines.push(`| ${METRIC_LABEL[m.metric]} | ${farmCell} | ${breedCell} | ${regionCell} | ${nationalCell} | ${trendCell} |`);
  }
  const c = o.coverage;
  const coverageBits: string[] = [];
  if (o.farmId) coverageBits.push(`목장 센서 데이터 개체 ${String(c.farmAnimalsWithData)}/${String(c.farmTotalAnimals)}두`);
  if (c.breedLabel) coverageBits.push(`품종 기준: ${c.breedLabel}`);
  if (c.province) coverageBits.push(`지역: ${c.province} ${String(c.regionFarms)}농장`);
  coverageBits.push(`전국 ${String(c.nationalFarms)}농장`);
  lines.push(`- 범위: ${coverageBits.join(' · ')}`);
  for (const n of o.notes) lines.push(`- ${n}`);
  return lines;
}

// ===========================
// DB 집계
// ===========================

interface ScopeFilter {
  readonly farmIds?: readonly string[];
  readonly breed?: string;
}

interface ReferenceCacheEntry {
  readonly value: HerdMetricStat | null;
  readonly expiresAt: number;
}

const referenceCache = new Map<string, ReferenceCacheEntry>();

/** 테스트·운영 강제 갱신용 */
export function clearHerdOverviewCache(): void {
  referenceCache.clear();
}

function buildWhere(metric: HerdOverviewMetric, since: string, filter: ScopeFilter): SQL {
  const parts: SQL[] = [
    sql`d.metric_type = ${METRIC_DB_TYPE[metric]}`,
    sql`d.date >= ${since}::date`,
    sql`a.deleted_at IS NULL`,
    sql`a.status = 'active'`,
  ];
  if (filter.farmIds && filter.farmIds.length > 0) {
    parts.push(sql`a.farm_id IN (${sql.join(filter.farmIds.map((id) => sql`${id}::uuid`), sql`, `)})`);
  }
  if (filter.breed) {
    parts.push(sql`lower(a.breed) = ${filter.breed.toLowerCase()}`);
  }
  return sql.join(parts, sql` AND `);
}

/** 개체 가중 평균: 개체별 기간 평균 → 그 평균/편차/범위 */
async function aggregateScope(
  metric: HerdOverviewMetric,
  since: string,
  filter: ScopeFilter,
): Promise<HerdMetricStat | null> {
  const db = getDb();
  const scale = METRIC_DAILY_SCALE[metric];
  const rows = await db.execute(sql`
    SELECT
      count(*)::int                       AS animals,
      count(DISTINCT t.farm_id)::int      AS farms,
      avg(t.a)                            AS avg,
      min(t.mn)                           AS min,
      max(t.mx)                           AS max,
      coalesce(stddev_pop(t.a), 0)        AS stddev,
      coalesce(sum(t.n), 0)::int          AS rows
    FROM (
      SELECT
        a.animal_id,
        a.farm_id,
        avg(d.avg) * ${scale} AS a,
        min(d.min) * ${scale} AS mn,
        max(d.max) * ${scale} AS mx,
        count(*) AS n
      FROM sensor_daily_agg d
      JOIN animals a ON a.animal_id = d.animal_id
      WHERE ${buildWhere(metric, since, filter)}
      GROUP BY a.animal_id, a.farm_id
    ) t
  `);
  return toStat(rows[0] as RawStatRow | undefined, METRIC_DIGITS[metric]);
}

async function aggregateScopeCached(
  key: string,
  metric: HerdOverviewMetric,
  since: string,
  filter: ScopeFilter,
): Promise<HerdMetricStat | null> {
  const cacheKey = `${key}:${metric}:${since}`;
  const hit = referenceCache.get(cacheKey);
  if (hit && hit.expiresAt > Date.now()) return hit.value;
  const value = await aggregateScope(metric, since, filter);
  referenceCache.set(cacheKey, { value, expiresAt: Date.now() + REFERENCE_CACHE_TTL_MS });
  return value;
}

async function farmDailySeries(metric: HerdOverviewMetric, since: string, farmId: string): Promise<DailyPoint[]> {
  const db = getDb();
  const rows = await db.execute(sql`
    SELECT d.date::text AS date, avg(d.avg) * ${METRIC_DAILY_SCALE[metric]} AS avg
    FROM sensor_daily_agg d
    JOIN animals a ON a.animal_id = d.animal_id
    WHERE ${buildWhere(metric, since, { farmIds: [farmId] })}
    GROUP BY d.date
    ORDER BY d.date
  `);
  return (rows as unknown as readonly { date: string; avg: number | string }[]).map((r) => ({
    date: r.date,
    avg: Number(r.avg),
  }));
}

interface FarmGeo {
  readonly farmId: string;
  readonly name: string;
  readonly province: string;
}

let farmGeoCache: { readonly list: readonly FarmGeo[]; readonly expiresAt: number } | null = null;

/** 전 농장의 시도 판별 — province-mapper 단일 권위 함수 사용. 10분 캐시 */
async function loadFarmGeo(): Promise<readonly FarmGeo[]> {
  if (farmGeoCache && farmGeoCache.expiresAt > Date.now()) return farmGeoCache.list;
  const db = getDb();
  const rows = await db.execute(sql`
    SELECT f.farm_id, f.name, f.address, f.lat, f.lng, r.province AS region_province
    FROM farms f
    LEFT JOIN regions r ON r.region_id = f.region_id
    WHERE f.deleted_at IS NULL
  `);
  const list: FarmGeo[] = (rows as unknown as readonly {
    farm_id: string; name: string; address: string | null; lat: number | null; lng: number | null; region_province: string | null;
  }[]).map((r) => ({
    farmId: r.farm_id,
    name: r.name,
    province: resolveFarmProvince({
      regionProvince: r.region_province,
      address: r.address,
      lat: r.lat === null ? null : Number(r.lat),
      lng: r.lng === null ? null : Number(r.lng),
    }),
  }));
  farmGeoCache = { list, expiresAt: Date.now() + REFERENCE_CACHE_TTL_MS };
  return list;
}

async function loadFarmBreedCounts(farmId: string): Promise<{ counts: BreedCount[]; total: number }> {
  const db = getDb();
  const rows = await db.execute(sql`
    SELECT lower(coalesce(breed, 'holstein')) AS breed, count(*)::int AS count
    FROM animals
    WHERE farm_id = ${farmId}::uuid AND deleted_at IS NULL AND status = 'active'
    GROUP BY 1
  `);
  const counts = (rows as unknown as readonly { breed: string; count: number | string }[]).map((r) => ({
    breed: r.breed,
    count: Number(r.count),
  }));
  return { counts, total: counts.reduce((s, c) => s + c.count, 0) };
}

/** 우군 구성 — 두수·센서 착용·착유/건유/육성·평균 산차·평균 DIM. herd-group 단일 분류 기준 사용 */
async function loadHerdComposition(farmId: string): Promise<HerdComposition> {
  const db = getDb();
  const rows = await db.execute(sql`
    SELECT
      count(*)::int                                                   AS total,
      count(*) FILTER (WHERE a.external_id IS NOT NULL)::int           AS with_sensor,
      count(*) FILTER (WHERE g.grp = 'milking')::int                   AS milking,
      count(*) FILTER (WHERE g.grp = 'dry')::int                       AS dry,
      count(*) FILTER (WHERE g.grp = 'heifer')::int                    AS heifer,
      avg(a.parity) FILTER (WHERE coalesce(a.parity, 0) >= 1)          AS avg_parity,
      avg(a.days_in_milk) FILTER (WHERE g.grp = 'milking' AND a.days_in_milk IS NOT NULL) AS avg_dim
    FROM animals a
    CROSS JOIN LATERAL (SELECT ${sql.raw(herdGroupSqlCase('a'))} AS grp) g
    WHERE a.farm_id = ${farmId}::uuid AND a.deleted_at IS NULL AND a.status = 'active'
  `);
  const r = rows[0] as {
    total?: number | string; with_sensor?: number | string; milking?: number | string; dry?: number | string;
    heifer?: number | string; avg_parity?: number | string | null; avg_dim?: number | string | null;
  } | undefined;
  const num = (v: number | string | null | undefined, digits: number): number | null =>
    v === null || v === undefined ? null : round(Number(v), digits);
  return {
    total: Number(r?.total ?? 0),
    withSensor: Number(r?.with_sensor ?? 0),
    milking: Number(r?.milking ?? 0),
    dry: Number(r?.dry ?? 0),
    heifer: Number(r?.heifer ?? 0),
    avgParity: num(r?.avg_parity, 1),
    avgDaysInMilk: num(r?.avg_dim, 0),
  };
}

async function countFarmAnimalsWithData(farmId: string, since: string): Promise<number> {
  const db = getDb();
  const rows = await db.execute(sql`
    SELECT count(DISTINCT d.animal_id)::int AS n
    FROM sensor_daily_agg d
    JOIN animals a ON a.animal_id = d.animal_id
    WHERE a.farm_id = ${farmId}::uuid AND a.deleted_at IS NULL AND a.status = 'active'
      AND d.date >= ${since}::date
  `);
  return Number((rows[0] as { n?: number | string } | undefined)?.n ?? 0);
}

// ===========================
// 공개 API
// ===========================

export interface HerdOverviewOptions {
  /** 기준 목장. 없으면 목장 열은 비고 품종/지역/전국만 (행정관·방역관 용도) */
  readonly farmId?: string | null;
  /** 1~30일, 기본 7 */
  readonly days?: number;
  /** farmId 없이 특정 품종 평균만 보고 싶을 때 (예: "jersey", "buffalo") */
  readonly breed?: string | null;
  /** farmId 없이 특정 시도 평균만 보고 싶을 때 (예: "경기") */
  readonly province?: string | null;
}

const isoDate = (d: Date): string => d.toISOString().slice(0, 10);

/**
 * 군 센서 개요 — 목장/품종/지역/전국 4단 평균 비교.
 * 실패해도 던지지 않고 notes에 사유를 남긴 부분 결과를 돌려준다 (프롬프트 주입 경로가 죽지 않게).
 */
export async function getHerdSensorOverview(opts: HerdOverviewOptions = {}): Promise<HerdSensorOverview> {
  const days = Math.max(1, Math.min(Number(opts.days) || DEFAULT_DAYS, MAX_DAYS));
  const now = new Date();
  const since = isoDate(new Date(now.getTime() - days * 86_400_000));
  const to = isoDate(now);
  const notes: string[] = [];

  const farmGeo = await loadFarmGeo();
  const nationalFarms = farmGeo.length;

  // 기준 목장 정보
  let farmName: string | null = null;
  let province: string | null = opts.province ?? null;
  let breedLabel: string | null = opts.breed ? opts.breed.toLowerCase() : null;
  let farmTotalAnimals = 0;
  let farmAnimalsWithData = 0;
  let herd: HerdComposition | null = null;

  const farmId = opts.farmId ?? null;
  if (farmId) {
    const geo = farmGeo.find((f) => f.farmId === farmId);
    if (!geo) {
      notes.push('기준 목장을 찾을 수 없어 목장 열은 비어 있다.');
    } else {
      farmName = geo.name;
      province = geo.province;
      const [{ counts, total }, withData, composition] = await Promise.all([
        loadFarmBreedCounts(farmId),
        countFarmAnimalsWithData(farmId, since),
        loadHerdComposition(farmId),
      ]);
      farmTotalAnimals = total;
      farmAnimalsWithData = withData;
      herd = composition;
      if (composition.withSensor < total) {
        notes.push(`센서 미착용 ${String(total - composition.withSensor)}두는 평균에 들어가지 않는다 (착용 ${String(composition.withSensor)}/${String(total)}두).`);
      }
      breedLabel = breedLabel ?? pickDominantBreed(counts);
      if (total > 0 && withData < total * 0.5) {
        notes.push(`센서 데이터가 있는 개체가 ${String(withData)}/${String(total)}두(50% 미만) — 목장 평균이 군 전체를 대표하지 않을 수 있다.`);
      }
      if (withData === 0) {
        notes.push('기간 내 목장 원시 센서 집계가 0건 — 센서 시리얼(externalId) 동기화 또는 수집 배치 상태를 확인할 것.');
      }
    }
  }

  const regionFarmIds = province
    ? farmGeo.filter((f) => f.province === province).map((f) => f.farmId)
    : [];

  const breedGroup: BreedGroup | null = breedLabel ? classifyBreedGroup(breedLabel) : null;

  // 메트릭별 4단 집계 — 메트릭 간 병렬
  const metrics: HerdMetricComparison[] = await Promise.all(OVERVIEW_METRICS.map(async (metric) => {
    const [farm, breed, region, national, series] = await Promise.all([
      farmId && farmName ? aggregateScope(metric, since, { farmIds: [farmId] }) : Promise.resolve(null),
      breedLabel ? aggregateScopeCached(`breed:${breedLabel}`, metric, since, { breed: breedLabel }) : Promise.resolve(null),
      province && regionFarmIds.length > 0
        ? aggregateScopeCached(`region:${province}`, metric, since, { farmIds: regionFarmIds })
        : Promise.resolve(null),
      aggregateScopeCached('national', metric, since, {}),
      farmId && farmName ? farmDailySeries(metric, since, farmId) : Promise.resolve([] as DailyPoint[]),
    ]);
    return {
      metric,
      unit: METRIC_UNIT[metric],
      farm,
      breed,
      region,
      national,
      deltaVsBreed: computeDelta(farm, breed),
      deltaVsRegion: computeDelta(farm, region),
      deltaVsNational: computeDelta(farm, national),
      farmTrend: computeTrend(series),
    };
  }));

  // 정직성 주석
  if (metrics.every((m) => m.national === null)) {
    notes.push('전국 단위 일별 센서 집계가 비어 있다 — 집계 배치(sensor_daily_agg)가 돌고 있는지 확인할 것.');
  }
  if (breedGroup) {
    const ref = BREED_REFERENCE_RANGES[breedGroup];
    notes.push(
      `문헌 참고 범위(${ref.label}, 보조용): 체온 ${String(ref.temperature[0])}~${String(ref.temperature[1])}°C, ` +
      `반추 ${String(ref.rumination[0])}~${String(ref.rumination[1])}분/일. 실측 품종 평균이 우선이다.`,
    );
    if (breedGroup === 'buffalo') {
      notes.push('물소는 소 기준 임계값(38.0~39.5°C)으로 해석하면 저체온 오판이 난다 — 물소 실측 평균과 비교할 것.');
    }
  }
  notes.push('음수량(L/일)은 smaXtec 이 체온 딥으로 산출한 추정치(water_intake, 일 환산)로 smaXtec 화면의 "음수량 l/24h"와 같은 원천이다 — 유량계 실측이 아니다. 음수 횟수는 CowTalk 이 원시 체온 V자 딥(일 평균 −0.5°C 이하 구간 시작)에서 센 값이다.');
  notes.push('pH는 별도 볼루스(거의 미장착)라 원시값이 수집되지 않는다 — 개요 대상 아님, 이벤트 알람만 존재.');
  notes.push('이 표는 평균이다. 개체 단위 이상은 이벤트 타임라인과 query_sensor_data(개체)로 확인할 것.');

  return {
    farmId,
    farmName,
    days,
    from: since,
    to,
    coverage: {
      farmTotalAnimals,
      farmAnimalsWithData,
      herd,
      breedLabel,
      breedGroup,
      province,
      regionFarms: regionFarmIds.length,
      nationalFarms,
    },
    metrics,
    notes,
    computedAt: now.toISOString(),
  };
}

/** 프롬프트 주입 경로용 — 어떤 실패도 던지지 않는다 */
export async function safeHerdSensorOverview(opts: HerdOverviewOptions): Promise<HerdSensorOverview | null> {
  try {
    return await getHerdSensorOverview(opts);
  } catch (error) {
    logger.warn({ error, farmId: opts.farmId }, '[HerdOverview] 군 센서 개요 계산 실패 — 컨텍스트 생략');
    return null;
  }
}
