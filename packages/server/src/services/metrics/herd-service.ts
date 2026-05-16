// 두수(herd count) 단일 진실 공급원
// metrics-contract.md §X.Y (BUG-007에서 추가 예정) / Decision D7·D8·D9
// fertility-service.ts와 동일 패턴.
//
// 사용 규칙:
// 1. 사용자에게 표시되는 두수는 반드시 이 모듈을 호출. 인라인 COUNT/SUM 금지.
// 2. 기본 정의 (D7): COUNT(animals WHERE status='active') — 라이브 카운트.
// 3. currentHeadCount(D8) = 표시 전용 등록값. agg 계산 비참여.
// 4. 사용자 노출 (D9) = 라이브만. registered는 명시적 scope로만 노출 허용 (행정 리포트 등).
// 5. 빈 농장 (D5) = status='data_insufficient' + displayValue='—'.

import { getDb } from '../../config/database.js';
import { animals, farms } from '../../db/schema.js';
import { and, eq, count, inArray, isNull, sql } from 'drizzle-orm';

export type HerdSource = 'live' | 'registered';
export type HerdStatus = 'ok' | 'data_insufficient';

export interface HerdResult {
  /** 두수 (active animals count 또는 registered head count, source 따라). */
  readonly total: number;
  /** 로케일 포맷 "10,666두" 또는 "—" (빈 농장). UI 직접 표시용. */
  readonly displayValue: string;
  /** D5 상태 sentinel — UI "데이터 부족" 분기. */
  readonly status: HerdStatus;
  /** 출처 표기 — 'live'(D9 기본) 또는 'registered'(D8 행정 전용). 호출처 디버깅에도 사용. */
  readonly source: HerdSource;
}

// ─────────────────────────────────────────────────────────
// Pure function — count → HerdResult
// ─────────────────────────────────────────────────────────

/**
 * 두수 카운트로부터 HerdResult 구성.
 * - count <= 0 또는 NaN → status='data_insufficient', displayValue='—'.
 * - count > 0 → status='ok', displayValue='{count}두' (로케일 천단위 콤마).
 */
export function computeHerd(activeCount: number, source: HerdSource = 'live'): HerdResult {
  if (!Number.isFinite(activeCount) || activeCount <= 0) {
    return {
      total: 0,
      displayValue: '—',
      status: 'data_insufficient',
      source,
    };
  }
  const safe = Math.floor(Math.max(0, activeCount));
  return {
    total: safe,
    displayValue: `${safe.toLocaleString('ko-KR')}두`,
    status: 'ok',
    source,
  };
}

// ─────────────────────────────────────────────────────────
// DB wrappers — 라이브 (D9 기본). 사용자 노출 화면 호출.
// ─────────────────────────────────────────────────────────

/**
 * 전체 또는 농장 목록 scope의 라이브 두수.
 * - farmIds 미지정 = 전체 활성 동물.
 * - farmIds 지정 = 해당 농장들 활성 동물 합.
 * 정의 (D7): animals.status='active' AND deletedAt IS NULL.
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
 * 단일 농장 라이브 두수. getHerdTotal의 단축형.
 */
export async function getHerdPerFarm(farmId: string): Promise<HerdResult> {
  return getHerdTotal({ farmIds: [farmId] });
}

// ─────────────────────────────────────────────────────────
// DB wrapper — 등록 두수 (D8 명시적). 행정 리포트·등록 폼 전용.
// 일반 UI 위젯에서는 사용 금지 (D9).
// ─────────────────────────────────────────────────────────

/**
 * 등록 두수 — farms.currentHeadCount 합.
 * D8: 표시 전용 (등록 폼 입력값). 사용자 KPI 위젯에서 사용 금지.
 * 향후 행정 리포트 페이지에서 별도 라벨로 노출 시 명시적 호출.
 */
export async function getRegisteredHeadCount(opts: { farmId?: string; farmIds?: readonly string[] } = {}): Promise<HerdResult> {
  const db = getDb();
  if (opts.farmId !== undefined) {
    const [row] = await db
      .select({ headCount: farms.currentHeadCount })
      .from(farms)
      .where(eq(farms.farmId, opts.farmId));
    return computeHerd(Number(row?.headCount ?? 0), 'registered');
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
