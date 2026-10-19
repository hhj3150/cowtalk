// 관리 케이스 서비스 — 감지→배정→현장확인→조치→재확인→종료
//
// 설계 규칙:
// - 상태(cases.status)는 **파생값**이다. 진실은 case_events 행에 있다.
//   그래서 상태를 바꾸는 유일한 경로가 appendCaseEvent 이고, 근거 없는 상태 변경 API는 없다.
// - 비정규화 컬럼(current_assignee_id, last_*_at)은 읽기 경로 최적화일 뿐이라
//   이벤트를 넣는 같은 트랜잭션에서만 갱신한다.
// - 순수 규칙(전이·플래그·정렬·집계)은 @cowtalk/shared 의 case.ts 한 곳에만 있다.
//   서버와 웹이 같은 규칙으로 판단해야 화면과 API가 다른 말을 하지 않는다.

import { getDb } from '../../config/database.js';
import { cases, caseAssignments, caseEvents, farms, animals, users } from '../../db/schema.js';
import { and, desc, eq, gte, inArray, isNull, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import {
  canAppendEvent,
  computeCaseFlags,
  sortCases,
  statusAfterEvent,
  summarizeCases,
  type AddCaseEventInput,
  type AssignCaseInput,
  type CaseDetail,
  type CaseEvent,
  type CaseEventType,
  type CaseFlag,
  type CaseListFilters,
  type CaseListItem,
  type CaseRecord,
  type CaseStatus,
  type CaseSummary,
  type CloseCaseInput,
  type CreateCaseInput,
} from '@cowtalk/shared';
import { logger } from '../../lib/logger.js';
import { BadRequestError, NotFoundError } from '../../lib/errors.js';

const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 300;

// ======================================================================
// 행 → 도메인
// ======================================================================

interface CaseRow {
  caseId: string;
  farmId: string;
  farmName: string | null;
  animalId: string | null;
  earTag: string | null;
  source: string;
  sourceRef: string | null;
  severity: string;
  status: string;
  title: string;
  detectedSignals: unknown;
  detectedAt: Date;
  ownerId: string | null;
  ownerName: string | null;
  currentAssigneeId: string | null;
  assigneeName: string | null;
  dueAt: Date | null;
  lastFieldCheckAt: Date | null;
  lastTreatmentAt: Date | null;
  lastRecheckAt: Date | null;
  worsenedObserved: boolean;
  closedAt: Date | null;
  outcome: string | null;
  outcomeNotes: string;
  outcomeSnapshot: unknown;
  createdAt: Date;
  updatedAt: Date;
}

function iso(d: Date | null): string | null {
  return d ? d.toISOString() : null;
}

function toRecord(row: CaseRow): CaseRecord {
  return {
    caseId: row.caseId,
    farmId: row.farmId,
    farmName: row.farmName,
    animalId: row.animalId,
    earTag: row.earTag,
    source: row.source as CaseRecord['source'],
    sourceRef: row.sourceRef,
    severity: row.severity as CaseRecord['severity'],
    status: row.status as CaseStatus,
    title: row.title,
    detectedSignals: Array.isArray(row.detectedSignals) ? (row.detectedSignals as string[]) : [],
    detectedAt: row.detectedAt.toISOString(),
    ownerId: row.ownerId,
    ownerName: row.ownerName,
    currentAssigneeId: row.currentAssigneeId,
    currentAssigneeName: row.assigneeName,
    dueAt: iso(row.dueAt),
    lastFieldCheckAt: iso(row.lastFieldCheckAt),
    lastTreatmentAt: iso(row.lastTreatmentAt),
    lastRecheckAt: iso(row.lastRecheckAt),
    closedAt: iso(row.closedAt),
    outcome: (row.outcome as CaseRecord['outcome']) ?? null,
    outcomeNotes: row.outcomeNotes,
    outcomeSnapshot: (row.outcomeSnapshot as Record<string, unknown> | null) ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function withFlags(row: CaseRow, now: Date): CaseListItem {
  const record = toRecord(row);
  const flags = computeCaseFlags(
    {
      status: record.status,
      currentAssigneeId: record.currentAssigneeId,
      dueAt: record.dueAt,
      lastTreatmentAt: record.lastTreatmentAt,
      lastRecheckAt: record.lastRecheckAt,
      outcome: record.outcome,
      worsenedObserved: row.worsenedObserved,
    },
    now,
  );
  return { ...record, flags };
}

// 담당자와 최종 책임자가 둘 다 users 를 가리키므로 별칭 조인이 필요하다
const ownerUser = alias(users, 'owner_user');
const assigneeUser = alias(users, 'assignee_user');

const caseSelection = {
  caseId: cases.caseId,
  farmId: cases.farmId,
  farmName: farms.name,
  animalId: cases.animalId,
  earTag: animals.earTag,
  source: cases.source,
  sourceRef: cases.sourceRef,
  severity: cases.severity,
  status: cases.status,
  title: cases.title,
  detectedSignals: cases.detectedSignals,
  detectedAt: cases.detectedAt,
  ownerId: cases.ownerId,
  ownerName: ownerUser.name,
  currentAssigneeId: cases.currentAssigneeId,
  assigneeName: assigneeUser.name,
  dueAt: cases.dueAt,
  lastFieldCheckAt: cases.lastFieldCheckAt,
  lastTreatmentAt: cases.lastTreatmentAt,
  lastRecheckAt: cases.lastRecheckAt,
  worsenedObserved: cases.worsenedObserved,
  closedAt: cases.closedAt,
  outcome: cases.outcome,
  outcomeNotes: cases.outcomeNotes,
  outcomeSnapshot: cases.outcomeSnapshot,
  createdAt: cases.createdAt,
  updatedAt: cases.updatedAt,
} as const;

/** 담당자·책임자 이름을 각각 별칭 조인으로 붙인다 (같은 users 테이블 2회) */
function baseQuery() {
  const db = getDb();
  return db
    .select(caseSelection)
    .from(cases)
    .leftJoin(farms, eq(cases.farmId, farms.farmId))
    .leftJoin(animals, eq(cases.animalId, animals.animalId))
    .leftJoin(ownerUser, eq(cases.ownerId, ownerUser.userId))
    .leftJoin(assigneeUser, eq(cases.currentAssigneeId, assigneeUser.userId));
}

// ======================================================================
// 조회
// ======================================================================

export async function listCases(
  filters: CaseListFilters,
  scope: readonly string[] | null,
  now: Date = new Date(),
): Promise<readonly CaseListItem[]> {
  const conds = [];

  if (scope !== null) {
    conds.push(inArray(cases.farmId, [...scope]));
  }
  if (filters.farmId) conds.push(eq(cases.farmId, filters.farmId));
  if (filters.animalId) conds.push(eq(cases.animalId, filters.animalId));
  if (filters.status) conds.push(eq(cases.status, filters.status));
  if (filters.openOnly) conds.push(sql`${cases.status} <> 'closed'`);
  if (filters.assigneeId) conds.push(eq(cases.currentAssigneeId, filters.assigneeId));
  if (filters.since) {
    const since = new Date(filters.since);
    if (!Number.isNaN(since.getTime())) conds.push(gte(cases.detectedAt, since));
  }

  const limit = Math.min(Math.max(filters.limit ?? DEFAULT_LIMIT, 1), MAX_LIMIT);

  const rows = (await baseQuery()
    .where(conds.length > 0 ? and(...conds) : undefined)
    .orderBy(desc(cases.detectedAt))
    .limit(limit)) as unknown as CaseRow[];

  let items = rows.map((r) => withFlags(r, now));

  // 플래그는 계산값이라 SQL로 거를 수 없다 — 조회 후 필터링한다.
  if (filters.flag) {
    const flag = filters.flag;
    items = items.filter((i) => i.flags.includes(flag));
  }

  return sortCases(items);
}

export async function getCaseDetail(
  caseId: string,
  scope: readonly string[] | null,
  now: Date = new Date(),
): Promise<CaseDetail | null> {
  const db = getDb();
  const rows = (await baseQuery().where(eq(cases.caseId, caseId)).limit(1)) as unknown as CaseRow[];
  const row = rows[0];
  if (!row) return null;
  if (scope !== null && !scope.includes(row.farmId)) return null;

  const [assignmentRows, eventRows] = await Promise.all([
    db
      .select({
        assignmentId: caseAssignments.assignmentId,
        caseId: caseAssignments.caseId,
        assigneeId: caseAssignments.assigneeId,
        assigneeName: users.name,
        supportIds: caseAssignments.supportIds,
        dueAt: caseAssignments.dueAt,
        assignedBy: caseAssignments.assignedBy,
        assignedAt: caseAssignments.assignedAt,
        supersededAt: caseAssignments.supersededAt,
      })
      .from(caseAssignments)
      .leftJoin(users, eq(caseAssignments.assigneeId, users.userId))
      .where(eq(caseAssignments.caseId, caseId))
      .orderBy(desc(caseAssignments.assignedAt)),
    db
      .select()
      .from(caseEvents)
      .where(eq(caseEvents.caseId, caseId))
      .orderBy(desc(caseEvents.occurredAt)),
  ]);

  return {
    ...withFlags(row, now),
    assignments: assignmentRows.map((a) => ({
      assignmentId: a.assignmentId,
      caseId: a.caseId,
      assigneeId: a.assigneeId,
      assigneeName: a.assigneeName ?? null,
      supportIds: Array.isArray(a.supportIds) ? (a.supportIds as string[]) : [],
      dueAt: iso(a.dueAt),
      assignedBy: a.assignedBy,
      assignedAt: a.assignedAt.toISOString(),
      supersededAt: iso(a.supersededAt),
    })),
    events: eventRows.map(
      (e): CaseEvent => ({
        eventId: e.eventId,
        caseId: e.caseId,
        eventType: e.eventType as CaseEventType,
        occurredAt: e.occurredAt.toISOString(),
        recordedBy: e.recordedBy,
        recordedByName: e.recordedByName,
        notes: e.notes,
        details: (e.details as Record<string, unknown>) ?? {},
      }),
    ),
  };
}

export async function summarizeOpenCases(
  scope: readonly string[] | null,
  farmId?: string,
  now: Date = new Date(),
): Promise<CaseSummary> {
  const items = await listCases({ farmId, limit: MAX_LIMIT }, scope, now);
  return summarizeCases(items);
}

// ======================================================================
// 생성
// ======================================================================

export async function createCase(
  input: CreateCaseInput,
  createdBy: string | null,
  now: Date = new Date(),
): Promise<CaseRecord> {
  const db = getDb();
  const detectedAt = input.detectedAt ? new Date(input.detectedAt) : now;
  if (Number.isNaN(detectedAt.getTime())) {
    throw new BadRequestError('detectedAt 이 올바른 날짜가 아닙니다');
  }

  // 같은 출처로 이미 열린 케이스가 있으면 새로 만들지 않고 그것을 돌려준다
  // (결정 카드를 두 번 눌러도 케이스가 둘로 갈라지지 않게).
  if (input.sourceRef) {
    const existing = (await baseQuery()
      .where(eq(cases.sourceRef, input.sourceRef))
      .limit(1)) as unknown as CaseRow[];
    const found = existing[0];
    if (found) {
      logger.info({ caseId: found.caseId, sourceRef: input.sourceRef }, '[Case] 기존 케이스 재사용');
      return toRecord(found);
    }
  }

  const inserted = await db
    .insert(cases)
    .values({
      farmId: input.farmId,
      animalId: input.animalId ?? null,
      source: input.source,
      sourceRef: input.sourceRef ?? null,
      severity: input.severity,
      status: 'detected',
      title: input.title.slice(0, 300),
      detectedSignals: [...(input.detectedSignals ?? [])],
      detectedAt,
      createdBy,
      updatedAt: now,
    })
    .returning({ caseId: cases.caseId });

  const caseId = inserted[0]?.caseId;
  if (!caseId) throw new Error('케이스 생성 실패');

  await db.insert(caseEvents).values({
    caseId,
    eventType: 'detected',
    occurredAt: detectedAt,
    recordedBy: createdBy,
    notes: input.notes ?? '',
    details: { signals: input.detectedSignals ?? [], source: input.source },
  });

  if (input.assigneeId) {
    await assignCase(
      caseId,
      { assigneeId: input.assigneeId, dueAt: input.dueAt },
      createdBy,
      now,
    );
  }

  const created = (await baseQuery().where(eq(cases.caseId, caseId)).limit(1)) as unknown as CaseRow[];
  const row = created[0];
  if (!row) throw new Error('생성된 케이스를 다시 읽지 못했습니다');
  return toRecord(row);
}

// ======================================================================
// 배정 (위임해도 최종 책임자는 남는다)
// ======================================================================

export async function assignCase(
  caseId: string,
  input: AssignCaseInput,
  assignedBy: string | null,
  now: Date = new Date(),
): Promise<CaseRecord> {
  const db = getDb();
  const current = await loadCaseOrThrow(caseId);

  if (current.status === 'closed') {
    throw new BadRequestError('종료된 케이스는 재배정할 수 없습니다 — 먼저 재개하세요');
  }

  // 기한을 명시하지 않은 위임은 **기존 기한을 유지**한다.
  // null 로 덮으면 위임하는 순간 '기한 초과' 표시가 조용히 사라져,
  // 늦어진 건이 목록에서 정상처럼 보인다 (놓친 건을 숨기는 최악의 동작).
  const dueAt = input.dueAt ? new Date(input.dueAt) : current.dueAt;
  if (dueAt && Number.isNaN(dueAt.getTime())) {
    throw new BadRequestError('dueAt 이 올바른 날짜가 아닙니다');
  }

  const isReassign = current.currentAssigneeId !== null;

  // 이전 배정을 지우지 않고 닫는다 — 누가 언제 넘겼는지가 이력에 남아야 한다
  await db
    .update(caseAssignments)
    .set({ supersededAt: now })
    .where(and(eq(caseAssignments.caseId, caseId), isNull(caseAssignments.supersededAt)));

  await db.insert(caseAssignments).values({
    caseId,
    assigneeId: input.assigneeId,
    supportIds: [...(input.supportIds ?? [])],
    dueAt,
    assignedBy,
    assignedAt: now,
  });

  const eventType: CaseEventType = isReassign ? 'reassigned' : 'assigned';
  const nextStatus = statusAfterEvent(current.status, eventType);

  await db
    .update(cases)
    .set({
      currentAssigneeId: input.assigneeId,
      dueAt,
      // 최종 책임자는 최초 배정에서만 정해진다 (위임해도 책임은 옮겨가지 않는다)
      ownerId: current.ownerId ?? input.assigneeId,
      ...(nextStatus ? { status: nextStatus } : {}),
      updatedAt: now,
    })
    .where(eq(cases.caseId, caseId));

  await db.insert(caseEvents).values({
    caseId,
    eventType,
    occurredAt: now,
    recordedBy: assignedBy,
    notes: input.notes ?? '',
    details: {
      assigneeId: input.assigneeId,
      supportIds: input.supportIds ?? [],
      dueAt: dueAt?.toISOString() ?? null,
      previousAssigneeId: current.currentAssigneeId,
    },
  });

  return reloadRecord(caseId);
}

// ======================================================================
// 단계 기록 (현장확인·조치·재확인·메모·재개)
// ======================================================================

export async function appendCaseEvent(
  caseId: string,
  input: AddCaseEventInput,
  recordedBy: string | null,
  now: Date = new Date(),
): Promise<CaseRecord> {
  const db = getDb();
  const current = await loadCaseOrThrow(caseId);
  // 기록자 이름은 토큰이 아니라 DB에서 읽는다 (토큰에는 이름이 없고, 표시용 스냅샷이라
  // 계정명이 나중에 바뀌어도 당시 기록은 그대로 남아야 한다)
  const recordedByName = await lookupUserName(recordedBy);

  if (!canAppendEvent(current.status, input.eventType)) {
    throw new BadRequestError(
      '종료된 케이스에는 기록을 추가할 수 없습니다 — 재개(reopened) 후 기록하세요',
    );
  }

  const occurredAt = input.occurredAt ? new Date(input.occurredAt) : now;
  if (Number.isNaN(occurredAt.getTime())) {
    throw new BadRequestError('occurredAt 이 올바른 날짜가 아닙니다');
  }

  await db.insert(caseEvents).values({
    caseId,
    eventType: input.eventType,
    occurredAt,
    recordedBy,
    recordedByName,
    notes: input.notes ?? '',
    details: input.details ?? {},
  });

  const nextStatus = statusAfterEvent(current.status, input.eventType);

  // 재확인에서 악화가 보고되면 표시를 남긴다 — 종료 전에도 목록에서 튀어야 한다
  const worsened =
    input.eventType === 'recheck' && input.details?.['trend'] === 'worsened' ? true : undefined;

  await db
    .update(cases)
    .set({
      ...(nextStatus ? { status: nextStatus } : {}),
      ...(input.eventType === 'field_check' ? { lastFieldCheckAt: occurredAt } : {}),
      ...(input.eventType === 'treatment' ? { lastTreatmentAt: occurredAt } : {}),
      ...(input.eventType === 'recheck' ? { lastRecheckAt: occurredAt } : {}),
      ...(worsened !== undefined ? { worsenedObserved: worsened } : {}),
      // 재개하면 종료 정보를 비운다 (CHECK 제약: 열린 케이스에 결과가 남아 있으면 안 됨)
      ...(input.eventType === 'reopened'
        ? { closedAt: null, outcome: null, outcomeSnapshot: null }
        : {}),
      updatedAt: now,
    })
    .where(eq(cases.caseId, caseId));

  return reloadRecord(caseId);
}

// ======================================================================
// 종료
// ======================================================================

export async function closeCase(
  caseId: string,
  input: CloseCaseInput,
  closedBy: string | null,
  now: Date = new Date(),
): Promise<CaseRecord> {
  const db = getDb();
  const current = await loadCaseOrThrow(caseId);

  if (current.status === 'closed') {
    throw new BadRequestError('이미 종료된 케이스입니다');
  }

  await db
    .update(cases)
    .set({
      status: 'closed',
      closedAt: now,
      outcome: input.outcome,
      outcomeNotes: input.notes ?? '',
      outcomeSnapshot: input.snapshot ?? null,
      worsenedObserved: input.outcome === 'worsened' ? true : current.worsenedObserved,
      updatedAt: now,
    })
    .where(eq(cases.caseId, caseId));

  await db.insert(caseEvents).values({
    caseId,
    eventType: 'closed',
    occurredAt: now,
    recordedBy: closedBy,
    notes: input.notes ?? '',
    details: { outcome: input.outcome, snapshot: input.snapshot ?? null },
  });

  return reloadRecord(caseId);
}

// ======================================================================
// 내부
// ======================================================================

interface MinimalCase {
  readonly farmId: string;
  readonly status: CaseStatus;
  readonly currentAssigneeId: string | null;
  readonly ownerId: string | null;
  readonly dueAt: Date | null;
  readonly worsenedObserved: boolean;
}

async function lookupUserName(userId: string | null): Promise<string | null> {
  if (!userId) return null;
  const db = getDb();
  const rows = await db.select({ name: users.name }).from(users).where(eq(users.userId, userId)).limit(1);
  return rows[0]?.name ?? null;
}

/** 라우트가 권한을 판정하려면 farmId가 필요하다 — 존재 확인과 함께 돌려준다 */
export async function loadCaseOrThrow(caseId: string): Promise<MinimalCase> {
  const db = getDb();
  const rows = await db
    .select({
      farmId: cases.farmId,
      status: cases.status,
      currentAssigneeId: cases.currentAssigneeId,
      ownerId: cases.ownerId,
      dueAt: cases.dueAt,
      worsenedObserved: cases.worsenedObserved,
    })
    .from(cases)
    .where(eq(cases.caseId, caseId))
    .limit(1);

  const row = rows[0];
  if (!row) throw new NotFoundError('케이스를 찾을 수 없습니다');
  return { ...row, status: row.status as CaseStatus };
}

async function reloadRecord(caseId: string): Promise<CaseRecord> {
  const rows = (await baseQuery().where(eq(cases.caseId, caseId)).limit(1)) as unknown as CaseRow[];
  const row = rows[0];
  if (!row) throw new NotFoundError('케이스를 찾을 수 없습니다');
  return toRecord(row);
}

/** 화면 뱃지가 아니라 쿼리 가능한 상태 — 플래그별 건수만 빠르게 */
export async function countCasesByFlag(
  scope: readonly string[] | null,
  now: Date = new Date(),
): Promise<Readonly<Record<CaseFlag, number>>> {
  const items = await listCases({ openOnly: true, limit: MAX_LIMIT }, scope, now);
  const summary = summarizeCases(items);
  return {
    unassigned: summary.unassigned,
    overdue: summary.overdue,
    worsened: summary.worsened,
    recheck_missing: summary.recheckMissing,
  };
}
