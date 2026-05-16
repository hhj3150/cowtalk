// 두수(herd count) 단일 진실 공급원
// metrics-contract.md §7 (BUG-007) / Decision D7·D8·D9·D11·D12·D13·D14
// fertility-service.ts와 동일 패턴.
//
// 사용 규칙:
// 1. 사용자에게 표시되는 두수는 반드시 이 모듈을 호출. 인라인 COUNT/SUM 금지.
// 2. 기본 정의 (D7): COUNT(animals WHERE status='active' AND deletedAt IS NULL) — 라이브 카운트.
// 3. currentHeadCount(D8) = 표시 전용 등록값. agg 계산 비참여. `getRegisteredHeadCount`로만 호출.
// 4. 사용자 노출 (D9) = 라이브만. registered는 명시적 scope로만 노출 허용 (행정 리포트 등).
// 5. 실측 0두 vs 측정 불가 (D13):
//    · 실측 0두 (DB 쿼리 성공, count=0) → status='ok', displayValue='0두'
//    · 측정 불가 (farm 미존재 / NaN / 음수 / Infinity) → status='data_insufficient', displayValue='—'
// 6. source 필드 (D11): 'live' = 사용자 노출 UI 허용, 'registered' = 사용자 노출 금지(행정 전용).

import { getDb } from '../../config/database.js';
import { animals, farms } from '../../db/schema.js';
import { and, eq, count, inArray, isNull, sql } from 'drizzle-orm';
import { latLngToProvince, PROVINCE_CENTERS } from '../epidemiology/province-mapper.js';

/**
 * 두수 출처. 정책 추적용 (D11):
 * - `'live'`: COUNT(animals) 실측 — 사용자 노출 UI 허용 (D9 기본).
 * - `'registered'`: farms.currentHeadCount 등록값 — 사용자 노출 금지, 행정 전용 (D8).
 */
export type HerdSource = 'live' | 'registered';

/**
 * 두수 데이터 상태 (D13):
 * - `'ok'`: 실측 성공 (DB 쿼리 OK). 0두도 'ok' (실측 0).
 * - `'data_insufficient'`: 측정 불가 (farm 미존재, 계산 실패, NaN).
 */
export type HerdStatus = 'ok' | 'data_insufficient';

export interface HerdResult {
  /** 두수 (active animals count 또는 registered head count). 측정 불가 시 0. */
  readonly total: number;
  /** UI 직접 표시용. "10,666두" 로케일 또는 "—" (측정 불가). */
  readonly displayValue: string;
  /** D5/D13 상태 sentinel. 실측 0두는 'ok', 측정 불가는 'data_insufficient'. */
  readonly status: HerdStatus;
  /** D11 정책 추적: 'live'=사용자 노출 / 'registered'=행정 전용. */
  readonly source: HerdSource;
}

// ─────────────────────────────────────────────────────────
// Pure function — count → HerdResult
// ─────────────────────────────────────────────────────────

/**
 * 두수 카운트로부터 HerdResult 구성 (D13 분리):
 * - count >= 0 (실측) → status='ok'. count=0은 "0두" 표시 (D13: 실측 0).
 * - count < 0 / NaN / Infinity → 측정 불가, herdUnavailable 반환.
 */
export function computeHerd(activeCount: number, source: HerdSource = 'live'): HerdResult {
  // D13: NaN / Infinity / 음수만 측정 불가. 0은 실측으로 인정.
  if (!Number.isFinite(activeCount) || activeCount < 0) {
    return herdUnavailable(source);
  }
  const safe = Math.floor(activeCount);
  return {
    total: safe,
    displayValue: `${safe.toLocaleString('ko-KR')}두`,
    status: 'ok',
    source,
  };
}

/**
 * 측정 불가 결과 (D13). farm 미존재 / DB 쿼리 실패 / 알 수 없는 province 등.
 * UI는 "—" 표시.
 */
export function herdUnavailable(source: HerdSource = 'live'): HerdResult {
  return {
    total: 0,
    displayValue: '—',
    status: 'data_insufficient',
    source,
  };
}

// ─────────────────────────────────────────────────────────
// DB wrappers — 라이브 (D9 기본). 사용자 노출 화면 호출.
// ─────────────────────────────────────────────────────────

/**
 * 정책: live, 사용자 노출 UI 기본값 (D7/D9).
 *
 * 전체 또는 농장 목록 scope의 라이브 두수.
 * - farmIds 미지정 = 전체 활성 동물.
 * - farmIds 지정 = 해당 농장들 활성 동물 합. (farm 존재 검증은 caller 책임 — N+1 회피).
 *
 * 정의 (D7): animals.status='active' AND deletedAt IS NULL.
 * 카운트 결과는 항상 실측 (0두도 'ok'). 측정 불가는 NaN/Infinity 만.
 */
export async function getHerdTotal(opts: { farmIds?: readonly string[] } = {}): Promise<HerdResult> {
  const db = getDb();
  const conditions = [eq(animals.status, 'active'), isNull(animals.deletedAt)];
  if (opts.farmIds && opts.farmIds.length > 0) {
    conditions.push(inArray(animals.farmId, [...opts.farmIds]));
  }
  const [row] = await db.select({ cnt: count() }).from(animals).where(and(...conditions));
  return computeHerd(Number(row?.cnt ?? 0), 'live');
}

/**
 * 정책: live, per-farm 표시.
 *
 * 단일 농장 라이브 두수. farm 존재 검증 후 카운트.
 * - farm 미존재 → herdUnavailable() ("—") (D13 측정 불가).
 * - farm 존재 + animals 0건 → "0두" (D13 실측 0).
 */
export async function getHerdPerFarm(farmId: string): Promise<HerdResult> {
  const db = getDb();
  const [farm] = await db
    .select({ farmId: farms.farmId })
    .from(farms)
    .where(eq(farms.farmId, farmId));
  if (!farm) return herdUnavailable('live');
  return getHerdTotal({ farmIds: [farmId] });
}

// ─────────────────────────────────────────────────────────
// DB wrapper — 등록 두수 (D8 명시적). 행정 리포트·등록 폼 전용.
// 일반 UI 위젯에서는 사용 금지 (D9).
// ─────────────────────────────────────────────────────────

/**
 * D8: 사용자 노출 위젯에서 호출 금지. 행정 통계 전용.
 *
 * 등록 두수 — farms.currentHeadCount (수동 유지값). 라이브 카운트와 다를 수 있음.
 * - opts.farmId 지정 + farm 미존재 → herdUnavailable() ("—") (D13).
 * - opts.farmId 지정 + 존재 → 해당 farm의 currentHeadCount.
 * - opts.farmIds 지정 → 해당 농장들 currentHeadCount 합.
 * - 미지정 → 전체 농장 currentHeadCount 합.
 *
 * **호출 제한**:
 *  - 사용자 KPI 위젯/대시보드/AI 도구 사용 금지 (D9).
 *  - 행정 리포트 페이지 또는 등록 폼 미리보기 등 명시적 컨텍스트에서만 호출.
 */
export async function getRegisteredHeadCount(opts: { farmId?: string; farmIds?: readonly string[] } = {}): Promise<HerdResult> {
  const db = getDb();
  if (opts.farmId !== undefined) {
    const [row] = await db
      .select({ headCount: farms.currentHeadCount })
      .from(farms)
      .where(eq(farms.farmId, opts.farmId));
    // D13: farm 미존재 → 측정 불가. 존재하나 0두 → 실측 0두.
    if (!row) return herdUnavailable('registered');
    return computeHerd(Number(row.headCount ?? 0), 'registered');
  }
  // 농장 목록 또는 전체 합
  const conditions = opts.farmIds && opts.farmIds.length > 0
    ? [inArray(farms.farmId, [...opts.farmIds])]
    : [];
  const [row] = await db
    .select({ total: sql<number>`COALESCE(SUM(${farms.currentHeadCount}), 0)` })
    .from(farms)
    .where(conditions.length > 0 ? and(...conditions) : undefined);
  return computeHerd(Number(row?.total ?? 0), 'registered');
}

// ─────────────────────────────────────────────────────────
// Province aggregation (D14) — national-situation.service.ts 교체용
// ─────────────────────────────────────────────────────────

/** 한국 시도 9개 (province-mapper의 PROVINCE_CENTERS 키와 동일). */
const KOREAN_PROVINCES: readonly string[] = Object.keys(PROVINCE_CENTERS);

/**
 * 농장 좌표 row 배열을 시도별 라이브 두수로 집계. Pure function.
 * - 9 시도 모두 결과에 포함 (0두 농장도 'ok' "0두", D13).
 * - 한국 경계 밖('해외')/'미분류' 좌표는 집계에서 제외.
 */
export function aggregateHerdByProvince(
  rows: ReadonlyArray<{ lat: number | null; lng: number | null }>,
): Map<string, HerdResult> {
  const counts = new Map<string, number>();
  for (const p of KOREAN_PROVINCES) counts.set(p, 0);

  for (const r of rows) {
    const province = latLngToProvince(r.lat, r.lng);
    if (counts.has(province)) {
      counts.set(province, (counts.get(province) ?? 0) + 1);
    }
    // 해외/미분류는 집계 제외.
  }

  const result = new Map<string, HerdResult>();
  for (const [province, cnt] of counts) {
    result.set(province, computeHerd(cnt, 'live'));
  }
  return result;
}

/**
 * 정책: live, 시도별 집계 (D14).
 *
 * 9 시도 전체에 대한 활성 두수 Map. national-situation.service.ts에서 사용.
 * 결과는 항상 9 시도 모두 포함하며, 동물 0두 시도는 "0두" (D13 실측 0).
 */
export async function getHerdByProvince(): Promise<ReadonlyMap<string, HerdResult>> {
  const db = getDb();
  const rows = await db
    .select({ lat: farms.lat, lng: farms.lng })
    .from(animals)
    .innerJoin(farms, eq(animals.farmId, farms.farmId))
    .where(and(eq(animals.status, 'active'), isNull(animals.deletedAt)));
  return aggregateHerdByProvince(rows);
}

/**
 * 정책: live, 단일 시도 조회 (D14).
 *
 * 시도명 입력 → 해당 시도 활성 두수.
 * - 정상 9 시도 → 'ok' (0두 포함).
 * - 모르는 시도명 (예: 'ZZZ', '해외') → herdUnavailable() (D13 측정 불가).
 */
export async function getHerdInProvince(province: string): Promise<HerdResult> {
  const byProvince = await getHerdByProvince();
  return byProvince.get(province) ?? herdUnavailable('live');
}
