// 기록 도구 사용자 확인 — DB 영속화 (tool_write_confirmations, 마이그레이션 0038)

import { and, eq, gt, ne, sql } from 'drizzle-orm';
import { getDb } from '../../config/database.js';
import { animals, farms, toolWriteConfirmations } from '../../db/schema.js';
import { CONFIRMATION_TTL_MS } from './write-confirmation.js';

export interface CreateProposalInput {
  readonly toolName: string;
  readonly toolInput: Record<string, unknown>;
  readonly userId?: string;
  readonly role: string;
  readonly farmId?: string;
  readonly turnId: string;
  readonly summary: string;
}

export async function createWriteProposal(p: CreateProposalInput): Promise<string> {
  const rows = await getDb()
    .insert(toolWriteConfirmations)
    .values({
      toolName: p.toolName,
      toolInput: p.toolInput,
      userId: p.userId ?? null,
      role: p.role,
      farmId: p.farmId ?? null,
      turnId: p.turnId,
      summary: p.summary,
      expiresAt: new Date(Date.now() + CONFIRMATION_TTL_MS),
    })
    .returning({ id: toolWriteConfirmations.confirmationId });
  return rows[0]!.id;
}

export type ClaimResult =
  | { readonly ok: true; readonly toolName: string; readonly toolInput: Record<string, unknown> }
  | { readonly ok: false; readonly message: string };

/**
 * awaiting → executing 원자적 선점. 조건:
 *   - 같은 사용자, 만료 전, 아직 대기 중
 *   - **제안이 만들어진 턴과 다른 턴** — AI가 같은 턴에 스스로 확인하는 것을 막는다
 * 실패 시 사유를 구분해 돌려준다 (AI가 사용자에게 정확히 안내하도록).
 */
export async function claimWriteProposal(params: {
  readonly confirmationId: string;
  readonly userId?: string;
  readonly turnId: string;
}): Promise<ClaimResult> {
  const db = getDb();
  const userCond = params.userId
    ? eq(toolWriteConfirmations.userId, params.userId)
    : sql`${toolWriteConfirmations.userId} IS NULL`;

  const claimed = await db
    .update(toolWriteConfirmations)
    .set({ status: 'executing', decidedAt: new Date() })
    .where(and(
      eq(toolWriteConfirmations.confirmationId, params.confirmationId),
      userCond,
      eq(toolWriteConfirmations.status, 'awaiting'),
      gt(toolWriteConfirmations.expiresAt, new Date()),
      ne(toolWriteConfirmations.turnId, params.turnId),
    ))
    .returning({
      toolName: toolWriteConfirmations.toolName,
      toolInput: toolWriteConfirmations.toolInput,
    });

  const row = claimed[0];
  if (row) {
    return { ok: true, toolName: row.toolName, toolInput: (row.toolInput ?? {}) as Record<string, unknown> };
  }

  // 왜 실패했는지 — 진단용 재조회
  const [existing] = await db
    .select({
      userId: toolWriteConfirmations.userId,
      status: toolWriteConfirmations.status,
      expiresAt: toolWriteConfirmations.expiresAt,
      turnId: toolWriteConfirmations.turnId,
    })
    .from(toolWriteConfirmations)
    .where(eq(toolWriteConfirmations.confirmationId, params.confirmationId))
    .limit(1);

  if (!existing || (params.userId && existing.userId !== params.userId)) {
    return { ok: false, message: '확인 대기 중인 기록을 찾을 수 없습니다. 기록 내용을 다시 제안하세요.' };
  }
  if (existing.status === 'executed' || existing.status === 'executing') {
    return { ok: false, message: '이미 저장된 기록입니다. 같은 기록을 다시 저장하지 않았습니다.' };
  }
  if (existing.status === 'cancelled') {
    return { ok: false, message: '사용자가 취소한 기록입니다.' };
  }
  if (existing.turnId === params.turnId) {
    return { ok: false, message: '사용자의 확인 답변을 아직 받지 않았습니다. 요약을 보여주고 저장 여부를 물어보세요.' };
  }
  if (existing.expiresAt.getTime() <= Date.now()) {
    return { ok: false, message: '확인 시간(30분)이 지났습니다. 기록 내용을 다시 제안하세요.' };
  }
  return { ok: false, message: '기록을 저장할 수 없습니다. 다시 제안하세요.' };
}

export async function finishWriteProposal(
  confirmationId: string,
  status: 'executed' | 'failed',
  executionResult: unknown,
): Promise<void> {
  await getDb()
    .update(toolWriteConfirmations)
    .set({ status, executionResult: executionResult as Record<string, unknown> })
    .where(eq(toolWriteConfirmations.confirmationId, confirmationId));
}

export async function cancelWriteProposal(confirmationId: string, userId?: string): Promise<void> {
  const userCond = userId
    ? eq(toolWriteConfirmations.userId, userId)
    : sql`${toolWriteConfirmations.userId} IS NULL`;
  await getDb()
    .update(toolWriteConfirmations)
    .set({ status: 'cancelled', decidedAt: new Date() })
    .where(and(
      eq(toolWriteConfirmations.confirmationId, confirmationId),
      userCond,
      eq(toolWriteConfirmations.status, 'awaiting'),
    ));
}

/** 요약에 넣을 개체 표시 — "송영신목장 123번". 개체를 사람이 눈으로 확인하게 하는 핵심 */
export async function describeAnimal(animalId: unknown): Promise<string | undefined> {
  if (typeof animalId !== 'string' || !/^[0-9a-f-]{36}$/i.test(animalId)) return undefined;
  const rows = await getDb()
    .select({ earTag: animals.earTag, traceId: animals.traceId, farmName: farms.name })
    .from(animals)
    .innerJoin(farms, eq(animals.farmId, farms.farmId))
    .where(eq(animals.animalId, animalId))
    .limit(1);
  const r = rows[0];
  if (!r) return undefined;
  const trace = r.traceId ? ` (이력 ${r.traceId})` : '';
  return `${r.farmName} ${r.earTag ?? '번호없음'}번${trace}`;
}
