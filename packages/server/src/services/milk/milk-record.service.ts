// 유량 기록 서비스 — 경제 레이어의 원료 데이터 배관
//
// milk_records 테이블은 존재했지만 쓰기 경로가 없었다 (읽기: lactation 라우트).
// 이 서비스가 첫 쓰기 경로: 수기 입력(웹/팅커벨 음성) → 개체별 일 유량 축적.
// DHI 커넥터 실연동 시 같은 테이블로 합류한다.
//
// 규칙: 동일 (animalId, date) 기록은 갱신(update) — 하루 1행 유지.

import { getDb } from '../../config/database.js';
import { milkRecords, animals } from '../../db/schema.js';
import { and, eq, gte, inArray, sql } from 'drizzle-orm';
import { logger } from '../../lib/logger.js';

export interface RecordMilkYieldInput {
  readonly animalId?: string;
  /** animalId 대신 귀번호로 지정 가능 (음성 입력 친화) */
  readonly earTag?: string;
  /** earTag 검색 범위 제한 (동일 귀번호 타농장 충돌 방지) */
  readonly farmId?: string;
  /** 일 유량 (리터) */
  readonly yieldL: number;
  /** YYYY-MM-DD. 생략 시 오늘 */
  readonly date?: string;
  readonly fat?: number;
  readonly protein?: number;
  readonly scc?: number;
}

export interface RecordMilkYieldResult {
  readonly success: boolean;
  readonly animalId?: string;
  readonly earTag?: string | null;
  readonly date?: string;
  readonly yieldL?: number;
  /** 같은 날짜 기존 기록을 갱신했는지 */
  readonly updated?: boolean;
  readonly error?: string;
}

function isValidDateStr(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(new Date(s).getTime());
}

export async function recordMilkYield(input: RecordMilkYieldInput): Promise<RecordMilkYieldResult> {
  const db = getDb();

  if (typeof input.yieldL !== 'number' || !Number.isFinite(input.yieldL) || input.yieldL < 0 || input.yieldL > 100) {
    return { success: false, error: 'yieldL은 0~100 사이 리터 값이어야 합니다.' };
  }
  const date = input.date ?? new Date().toISOString().slice(0, 10);
  if (!isValidDateStr(date)) {
    return { success: false, error: 'date는 YYYY-MM-DD 형식이어야 합니다.' };
  }

  // 개체 해석: animalId 우선, 없으면 earTag(+farmId)
  const conds = [eq(animals.status, 'active')];
  if (input.animalId) conds.push(eq(animals.animalId, input.animalId));
  else if (input.earTag) {
    conds.push(eq(animals.earTag, input.earTag));
    if (input.farmId) conds.push(eq(animals.farmId, input.farmId));
  } else {
    return { success: false, error: 'animalId 또는 earTag 중 하나를 지정하세요.' };
  }

  const found = await db
    .select({ animalId: animals.animalId, earTag: animals.earTag })
    .from(animals)
    .where(and(...conds))
    .limit(2);
  if (found.length === 0) return { success: false, error: '해당 개체를 찾을 수 없습니다.' };
  if (found.length > 1) return { success: false, error: '귀번호가 여러 개체와 일치합니다 — farmId를 함께 지정하세요.' };
  const animal = found[0]!;

  // 동일 날짜 기록 → 갱신
  const [existing] = await db
    .select({ recordId: milkRecords.recordId })
    .from(milkRecords)
    .where(and(eq(milkRecords.animalId, animal.animalId), eq(milkRecords.date, date)))
    .limit(1);

  if (existing) {
    await db
      .update(milkRecords)
      .set({ yield: input.yieldL, fat: input.fat, protein: input.protein, scc: input.scc })
      .where(eq(milkRecords.recordId, existing.recordId));
  } else {
    await db.insert(milkRecords).values({
      animalId: animal.animalId,
      date,
      yield: input.yieldL,
      fat: input.fat,
      protein: input.protein,
      scc: input.scc,
    });
  }

  logger.info(
    { animalId: animal.animalId, earTag: animal.earTag, date, yieldL: input.yieldL, updated: Boolean(existing) },
    '[Milk] 유량 기록',
  );

  return {
    success: true,
    animalId: animal.animalId,
    earTag: animal.earTag,
    date,
    yieldL: input.yieldL,
    updated: Boolean(existing),
  };
}

/** 개체별 최근 N일 평균 일 유량 (실측만) — 경제 환산의 근거 */
export async function getAvgDailyYield(
  animalIds: readonly string[],
  days = 7,
): Promise<ReadonlyMap<string, number>> {
  if (animalIds.length === 0) return new Map();
  const db = getDb();
  const sinceStr = new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);
  const rows = await db
    .select({
      animalId: milkRecords.animalId,
      avgYield: sql<number>`avg(${milkRecords.yield})`,
    })
    .from(milkRecords)
    .where(and(inArray(milkRecords.animalId, [...animalIds]), gte(milkRecords.date, sinceStr)))
    .groupBy(milkRecords.animalId);
  return new Map(rows.map((r) => [r.animalId, Math.round(Number(r.avgYield) * 10) / 10]));
}
