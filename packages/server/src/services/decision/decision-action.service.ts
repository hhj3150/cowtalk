// 결정 카드 조치 기록 — "알람 → 행동 완결"의 영속화
//
// 기존에는 완료 처리가 브라우저 localStorage에만 있어(DB-first 위반)
// 기기·사용자 간 공유가 안 되고 완결 이력을 잴 수 없었다.
// card_id는 결정 큐의 결정적 합성 ID(`source:개체:시각`)라 재조회에도 안정적이다.

import { getDb } from '../../config/database.js';
import { decisionActions } from '../../db/schema.js';
import { and, eq, gte, inArray, sql } from 'drizzle-orm';
import type { CompleteDecisionInput } from '@cowtalk/shared';

const MS_PER_DAY = 86_400_000;

/** 완료 처리 — 카드당 1행 (농장 단위 공유). 이미 완료된 카드는 그대로 성공 반환 */
export async function completeDecisionCard(
  input: CompleteDecisionInput,
  actedBy?: string,
): Promise<{ cardId: string; alreadyDone: boolean }> {
  const db = getDb();
  const inserted = await db
    .insert(decisionActions)
    .values({
      cardId: input.cardId,
      farmId: input.farmId ?? null,
      animalId: input.animalId ?? null,
      source: input.source,
      severity: input.severity,
      title: input.title.slice(0, 300),
      status: 'done',
      actedBy: actedBy ?? null,
    })
    .onConflictDoNothing()
    .returning({ actionId: decisionActions.actionId });
  return { cardId: input.cardId, alreadyDone: inserted.length === 0 };
}

/** 완료 취소 — 행 삭제 (토글 UX 대응) */
export async function undoDecisionCard(cardId: string): Promise<{ cardId: string; removed: boolean }> {
  const db = getDb();
  const removed = await db
    .delete(decisionActions)
    .where(eq(decisionActions.cardId, cardId))
    .returning({ actionId: decisionActions.actionId });
  return { cardId, removed: removed.length > 0 };
}

/** 주어진 카드들 중 완료된 카드 ID 집합 — 큐 응답 주석용 */
export async function getCompletedCardIds(cardIds: readonly string[]): Promise<Set<string>> {
  if (cardIds.length === 0) return new Set();
  const db = getDb();
  const rows = await db
    .select({ cardId: decisionActions.cardId })
    .from(decisionActions)
    .where(inArray(decisionActions.cardId, [...cardIds]));
  return new Set(rows.map((r) => r.cardId));
}

/** 최근 N일 완료 수 (스코프 기준) — 조치 완결 지표 */
export async function countCompletedActions(
  farmIdsScope: readonly string[] | null | undefined,
  days: number = 7,
): Promise<number> {
  const db = getDb();
  const since = new Date(Date.now() - days * MS_PER_DAY);
  const conditions = [gte(decisionActions.actedAt, since)];
  if (farmIdsScope && farmIdsScope.length > 0) {
    conditions.push(inArray(decisionActions.farmId, [...farmIdsScope]));
  }
  const [row] = await db
    .select({ cnt: sql<number>`count(*)::int` })
    .from(decisionActions)
    .where(and(...conditions));
  return row?.cnt ?? 0;
}
