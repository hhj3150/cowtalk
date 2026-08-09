// 팅커벨 기억 서비스 — 추출 → 통합 → 저장 → 회상의 DB 경로.
//
// 순수 규칙은 memory-extractor / memory-consolidation / memory-recall 에 있고,
// 이 파일은 그 규칙을 DB에 적용하는 얇은 층이다.
//
// 실패 정책: 기억은 부가 기능이다. 어떤 실패도 대화 응답을 막아서는 안 된다.
// 모든 진입점은 예외를 삼키고 로그만 남긴다.

import { getDb } from '../../config/database.js';
import { tinkerbellMemories } from '../../db/schema.js';
import { and, eq, inArray, or, sql, desc, type SQL } from 'drizzle-orm';
import { logger } from '../../lib/logger.js';
import type { MemoryCategory, MemoryScope, MemorySource } from '@cowtalk/shared';
import {
  extractMemoryCandidates,
  detectExplicitCommand,
  extractKeywords,
  type MemoryCandidate,
} from './memory-extractor.js';
import {
  decideConsolidation,
  decayedConfidence,
  shouldExpire,
  similarity,
  type ExistingMemory,
} from './memory-consolidation.js';
import {
  selectRelevantMemories,
  formatMemoryContext,
  MAX_RECALLED_MEMORIES,
  type RecallableMemory,
} from './memory-recall.js';

/**
 * 카테고리 → 스코프. 개체 특성은 개체에, 선호는 사람에, 나머지는 목장에 붙는다.
 *
 * 개체 스코프는 농장이 함께 있을 때만 성립한다 — 개체 기억의 열람 권한은 그 개체가
 * 속한 농장으로 판정하므로, farmId 없이 개체 기억을 만들면 누가 볼 수 있는지 알 수 없다.
 */
export function scopeForCategory(
  category: MemoryCategory,
  hasFarm: boolean,
  hasAnimal: boolean,
): MemoryScope {
  if (category === 'animal_fact' && hasAnimal && hasFarm) return 'animal';
  if (category === 'preference') return 'user';
  return hasFarm ? 'farm' : 'user';
}

// ══════════════════════════════════════════════════════════════════
// 권한 경계 — 기억은 '그 계정이 접근할 수 있는 범위' 안에서만 회상된다.
//
// 왜 여기서 집행하는가: 채팅 라우트는 클라이언트가 보낸 farmId·animalId를 그대로 넘긴다
// (기존 동작). 회상이 그 값을 무비판적으로 믿으면, 배정되지 않은 농장의 기억이
// 프롬프트에 실려 나간다. 그래서 기억 계층이 스스로 스코프를 검증한다.
// ══════════════════════════════════════════════════════════════════

export interface MemoryAccess {
  /** 요청 계정 — user 스코프 기억은 이 계정 것만 회상된다 */
  readonly userId: string | null;
  /**
   * 이 계정이 접근할 수 있는 농장 목록.
   * null = 제한 없음 (마스터·미배정 관리 역할). rbac.scopedFarmIds()의 반환과 같은 의미.
   */
  readonly permittedFarmIds: readonly string[] | null;
}

/** 이 계정이 해당 농장의 기억을 볼 수 있는가 */
export function canAccessFarm(access: MemoryAccess, farmId: string | null): boolean {
  if (farmId === null) return false;
  if (access.permittedFarmIds === null) return true;
  return access.permittedFarmIds.includes(farmId);
}

interface MemoryRow {
  memoryId: string;
  scope: string;
  category: string;
  subject: string;
  content: string;
  confidence: number;
  importance: number;
  evidenceCount: number;
  source: string;
  keywords: unknown;
  lastConfirmedAt: Date;
}

function toRecallable(row: MemoryRow): RecallableMemory {
  return {
    memoryId: row.memoryId,
    scope: row.scope as MemoryScope,
    category: row.category as MemoryCategory,
    subject: row.subject,
    content: row.content,
    confidence: row.confidence,
    importance: row.importance,
    evidenceCount: row.evidenceCount,
    keywords: Array.isArray(row.keywords) ? (row.keywords as string[]) : [],
    lastConfirmedAt: row.lastConfirmedAt,
  };
}

function toExisting(row: MemoryRow): ExistingMemory {
  return {
    memoryId: row.memoryId,
    subject: row.subject,
    content: row.content,
    confidence: row.confidence,
    evidenceCount: row.evidenceCount,
    importance: row.importance,
    source: row.source as MemorySource,
    lastConfirmedAt: row.lastConfirmedAt,
  };
}

const MEMORY_COLUMNS = {
  memoryId: tinkerbellMemories.memoryId,
  scope: tinkerbellMemories.scope,
  category: tinkerbellMemories.category,
  subject: tinkerbellMemories.subject,
  content: tinkerbellMemories.content,
  confidence: tinkerbellMemories.confidence,
  importance: tinkerbellMemories.importance,
  evidenceCount: tinkerbellMemories.evidenceCount,
  source: tinkerbellMemories.source,
  keywords: tinkerbellMemories.keywords,
  lastConfirmedAt: tinkerbellMemories.lastConfirmedAt,
} as const;

/**
 * 이 대화 맥락에서 볼 수 있는 활성 기억의 스코프 조건.
 *
 * 요청된 맥락(farmId·animalId)과 계정 권한(access)의 **교집합**만 남긴다.
 * 요청 맥락만 보면 클라이언트가 남의 농장 id를 보내는 순간 그 농장 기억이 새고,
 * 권한만 보면 지금 대화와 무관한 농장 기억까지 프롬프트에 실린다.
 */
function scopeCondition(
  access: MemoryAccess,
  farmId: string | null,
  animalId: string | null,
): SQL | undefined {
  const conditions: SQL[] = [];

  // 개인 기억 — 오직 본인. 관리자·마스터도 타인의 것은 회상되지 않는다.
  if (access.userId) {
    const c = and(eq(tinkerbellMemories.scope, 'user'), eq(tinkerbellMemories.userId, access.userId));
    if (c) conditions.push(c);
  }

  // 농장·개체 기억 — 요청 농장이 이 계정의 권한 안에 있을 때만
  if (farmId && canAccessFarm(access, farmId)) {
    const farmCond = and(eq(tinkerbellMemories.scope, 'farm'), eq(tinkerbellMemories.farmId, farmId));
    if (farmCond) conditions.push(farmCond);

    if (animalId) {
      // 개체 기억도 농장 일치를 함께 요구 — 개체 id만으로는 권한을 판정할 수 없다
      const animalCond = and(
        eq(tinkerbellMemories.scope, 'animal'),
        eq(tinkerbellMemories.animalId, animalId),
        eq(tinkerbellMemories.farmId, farmId),
      );
      if (animalCond) conditions.push(animalCond);
    }
  }

  if (conditions.length === 0) return undefined;
  return conditions.length === 1 ? conditions[0] : or(...conditions);
}

// ── 회상 ──

/** 회상 캐시 — 같은 농장의 연속 질문에서 매번 DB를 때리지 않게 (30초) */
const RECALL_CACHE_TTL_MS = 30 * 1000;
const recallCache = new Map<string, { rows: readonly RecallableMemory[]; expiresAt: number }>();

export function invalidateMemoryCache(): void {
  recallCache.clear();
}

/** 이 맥락의 활성 기억 전체 (점수화 전) */
async function loadActiveMemories(
  access: MemoryAccess,
  farmId: string | null,
  animalId: string | null,
): Promise<readonly RecallableMemory[]> {
  // 캐시 키에 권한 지문을 포함한다 — 같은 농장을 보는 두 계정의 권한이 다르면
  // 캐시가 섞여서는 안 된다 (권한 우회 경로가 캐시로 생기지 않게).
  const permitFingerprint = access.permittedFarmIds === null
    ? '*'
    : [...access.permittedFarmIds].sort().join(',');
  const cacheKey = `${access.userId ?? '-'}|${permitFingerprint}|${farmId ?? '-'}|${animalId ?? '-'}`;
  const cached = recallCache.get(cacheKey);
  if (cached && Date.now() < cached.expiresAt) return cached.rows;

  const scope = scopeCondition(access, farmId, animalId);
  if (!scope) return [];

  const db = getDb();
  const rows = await db
    .select(MEMORY_COLUMNS)
    .from(tinkerbellMemories)
    .where(and(eq(tinkerbellMemories.status, 'active'), scope))
    // 후보 풀 상한 — 점수화는 애플리케이션에서 하되 무한정 읽지 않는다
    .orderBy(desc(tinkerbellMemories.importance), desc(tinkerbellMemories.lastConfirmedAt))
    .limit(200);

  const recallable = rows.map(toRecallable);
  recallCache.set(cacheKey, { rows: recallable, expiresAt: Date.now() + RECALL_CACHE_TTL_MS });
  return recallable;
}

/**
 * 대화 프롬프트에 넣을 기억 블록.
 * 실패하거나 기억이 없으면 빈 문자열 — 호출부는 그냥 붙이면 된다.
 */
export async function buildMemoryContext(input: {
  readonly userId: string | null;
  readonly farmId: string | null;
  readonly animalId: string | null;
  readonly question: string;
  /** 이 계정이 접근 가능한 농장. null = 제한 없음. 생략 시 '농장 기억 없음'으로 안전하게 처리한다. */
  readonly permittedFarmIds?: readonly string[] | null;
  readonly limit?: number;
}): Promise<string> {
  try {
    // permittedFarmIds를 주지 않은 호출부는 개인 기억만 받는다 —
    // 권한 정보를 빠뜨린 호출이 조용히 전체 열람이 되는 것보다 조용히 축소되는 편이 안전하다.
    const access: MemoryAccess = {
      userId: input.userId,
      permittedFarmIds: input.permittedFarmIds === undefined ? [] : input.permittedFarmIds,
    };
    const all = await loadActiveMemories(access, input.farmId, input.animalId);
    if (all.length === 0) return '';
    const selected = selectRelevantMemories(
      all,
      input.question,
      input.limit ?? MAX_RECALLED_MEMORIES,
    );
    return formatMemoryContext(selected);
  } catch (err) {
    logger.warn({ err, farmId: input.farmId }, '[Memory] 회상 실패 — 기억 없이 진행');
    return '';
  }
}

// ── 저장·통합 ──

export interface RememberInput {
  readonly userId: string;
  readonly farmId: string | null;
  readonly animalId: string | null;
  readonly question: string;
  readonly answer: string;
  readonly conversationId?: string | null;
  /** 이 계정이 접근 가능한 농장. 기억을 어느 농장에 붙일지 판정하는 데도 쓰인다. */
  readonly permittedFarmIds?: readonly string[] | null;
}

export interface RememberResult {
  readonly inserted: number;
  readonly reinforced: number;
  readonly superseded: number;
  readonly forgotten: number;
}

const EMPTY_RESULT: RememberResult = { inserted: 0, reinforced: 0, superseded: 0, forgotten: 0 };

/**
 * 대화 한 턴에서 기억을 추출·통합한다. fire-and-forget으로 호출된다.
 *
 * 순서가 중요하다:
 *   1. "잊어" 지시가 있으면 먼저 처리하고 종료 (같은 턴에서 지우고 다시 저장하지 않게)
 *   2. 후보 추출 (게이트 미통과 시 LLM 호출 없이 종료)
 *   3. 기존 기억과 대조해 insert / reinforce / supersede 결정
 */
export async function rememberFromConversation(
  input: RememberInput,
): Promise<RememberResult> {
  try {
    const access: MemoryAccess = {
      userId: input.userId,
      permittedFarmIds: input.permittedFarmIds === undefined ? [] : input.permittedFarmIds,
    };
    // 권한 밖 농장 맥락이면 그 농장에 기억을 쓰지 않는다 — 개인 기억으로만 남긴다.
    const writableFarmId = canAccessFarm(access, input.farmId) ? input.farmId : null;

    const explicit = detectExplicitCommand(input.question);
    if (explicit?.kind === 'forget') {
      const forgotten = await forgetByText(explicit.payload, access, writableFarmId, input.animalId);
      return { ...EMPTY_RESULT, forgotten };
    }

    const existingAll = await loadActiveMemories(access, writableFarmId, input.animalId);
    const candidates = await extractMemoryCandidates({
      question: input.question,
      answer: input.answer,
      existingSubjects: [...new Set(existingAll.map((m) => m.subject))],
    });
    if (candidates.length === 0) return EMPTY_RESULT;

    let inserted = 0;
    let reinforced = 0;
    let superseded = 0;

    for (const candidate of candidates) {
      const scope = scopeForCategory(
        candidate.category,
        writableFarmId !== null,
        input.animalId !== null,
      );
      // 같은 스코프·카테고리 안에서만 통합 — 선호와 목장 사실이 서로를 덮지 않게
      const peers = existingAll
        .filter((m) => m.scope === scope && m.category === candidate.category)
        .map((m) => toExisting({
          memoryId: m.memoryId,
          scope: m.scope,
          category: m.category,
          subject: m.subject,
          content: m.content,
          confidence: m.confidence,
          importance: m.importance,
          evidenceCount: m.evidenceCount,
          source: 'chat_auto',
          keywords: m.keywords,
          lastConfirmedAt: m.lastConfirmedAt,
        }));

      const decision = decideConsolidation(candidate, peers);

      if (decision.kind === 'reinforce') {
        await applyReinforce(decision.targetId, decision.nextConfidence, decision.nextEvidenceCount, decision.nextImportance);
        reinforced += 1;
        continue;
      }
      if (decision.kind === 'supersede') {
        const newId = await insertMemory(candidate, scope, { ...input, farmId: writableFarmId });
        if (newId) {
          await markSuperseded(decision.targetId, newId);
          superseded += 1;
        }
        continue;
      }
      const newId = await insertMemory(candidate, scope, { ...input, farmId: writableFarmId });
      if (newId) inserted += 1;
    }

    if (inserted + reinforced + superseded > 0) {
      invalidateMemoryCache();
      logger.info(
        { inserted, reinforced, superseded, farmId: input.farmId },
        '[Memory] 대화에서 기억 갱신',
      );
    }
    return { inserted, reinforced, superseded, forgotten: 0 };
  } catch (err) {
    logger.warn({ err }, '[Memory] 기억 추출·저장 실패 (대화는 정상 진행)');
    return EMPTY_RESULT;
  }
}

async function insertMemory(
  candidate: MemoryCandidate,
  scope: MemoryScope,
  input: RememberInput,
): Promise<string | null> {
  try {
    const db = getDb();
    const [row] = await db
      .insert(tinkerbellMemories)
      .values({
        scope,
        userId: scope === 'user' ? input.userId : null,
        // 개체 기억에도 farmId를 남긴다 — 열람 권한을 농장으로 판정하기 때문.
        // (DB의 CHECK 제약도 animal 스코프에 farm_id를 요구한다)
        farmId: scope === 'farm' || scope === 'animal' ? input.farmId : null,
        animalId: scope === 'animal' ? input.animalId : null,
        category: candidate.category,
        subject: candidate.subject.slice(0, 120),
        content: candidate.content,
        confidence: candidate.confidence,
        importance: candidate.importance,
        source: candidate.source,
        sourceConversationId: input.conversationId ?? null,
        sourceQuote: candidate.sourceQuote,
        keywords: [...candidate.keywords],
        createdBy: input.userId,
      })
      .returning({ memoryId: tinkerbellMemories.memoryId });
    return row?.memoryId ?? null;
  } catch (err) {
    // 유니크 인덱스 충돌(동시 저장) 등 — 기억 하나 못 넣는다고 대화가 실패하면 안 된다
    logger.warn({ err, subject: candidate.subject }, '[Memory] 기억 삽입 실패');
    return null;
  }
}

async function applyReinforce(
  memoryId: string,
  confidence: number,
  evidenceCount: number,
  importance: number,
): Promise<void> {
  const db = getDb();
  await db
    .update(tinkerbellMemories)
    .set({
      confidence,
      evidenceCount,
      importance,
      lastConfirmedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(tinkerbellMemories.memoryId, memoryId));
}

async function markSuperseded(oldId: string, newId: string): Promise<void> {
  const db = getDb();
  await db
    .update(tinkerbellMemories)
    .set({ status: 'superseded', supersededBy: newId, updatedAt: new Date() })
    .where(eq(tinkerbellMemories.memoryId, oldId));
}

// ── 망각 ──

/**
 * 망각 지시에서 대상을 못 좁히는 지시어 — 이것만으로는 어떤 기억도 지목하지 못한다.
 * ("그 얘기는 잊어"에서 '얘기'로 아무 기억이나 지우면 안 된다)
 */
const FORGET_FILLERS: ReadonlySet<string> = new Set([
  '얘기', '이야기', '내용', '부분', '그거', '저거', '이거', '방금', '아까',
  '전에', '말한', '했던', '그건', '그것', '기억', '아까한', '전부', '모두',
]);

/**
 * "그건 잊어" — 텍스트로 지목된 기억을 rejected 처리 (하드 삭제하지 않는다).
 *
 * 매칭이 두 단계인 이유: 망각 지시는 대개 짧다("로봇착유기 얘기는 잊어").
 * 문장 유사도만 쓰면 짧은 지시가 긴 기억 문장과 겹치는 비율이 낮아 아무것도 지워지지 않는다.
 * 그래서 문장 유사도 + 지목어 포함 매칭을 함께 본다.
 */
export async function forgetByText(
  text: string,
  access: MemoryAccess,
  farmId: string | null,
  animalId: string | null,
): Promise<number> {
  // 회상과 같은 스코프 조건을 쓴다 — 볼 수 없는 기억은 지울 수도 없다
  const active = await loadActiveMemories(access, farmId, animalId);
  if (active.length === 0) return 0;

  // 지시어를 걷어낸 '지목어'만 남긴다 — 이게 없으면 무엇을 지울지 알 수 없다
  const pointers = extractKeywords(text).filter((t) => !FORGET_FILLERS.has(t));
  if (pointers.length === 0) return 0;

  const targets = active.filter((m) => {
    if (similarity(text, m.content) >= 0.3) return true;
    const haystack = `${m.subject} ${m.content} ${m.keywords.join(' ')}`.toLowerCase();
    return pointers.some((p) => haystack.includes(p));
  });
  if (targets.length === 0) return 0;

  const db = getDb();
  await db
    .update(tinkerbellMemories)
    .set({ status: 'rejected', updatedAt: new Date() })
    .where(inArray(tinkerbellMemories.memoryId, targets.map((t) => t.memoryId)));

  invalidateMemoryCache();
  logger.info({ count: targets.length }, '[Memory] 사용자 지시로 기억 삭제');
  return targets.length;
}

export async function forgetMemoryById(memoryId: string): Promise<boolean> {
  const db = getDb();
  const rows = await db
    .update(tinkerbellMemories)
    .set({ status: 'rejected', updatedAt: new Date() })
    .where(eq(tinkerbellMemories.memoryId, memoryId))
    .returning({ memoryId: tinkerbellMemories.memoryId });
  invalidateMemoryCache();
  return rows.length > 0;
}

// ── 감쇠 배치 ──

export interface DecayResult {
  readonly scanned: number;
  readonly decayed: number;
  readonly expired: number;
}

/**
 * 24시간 배치 — 재확인되지 않은 기억의 신뢰도를 낮추고, 바닥을 친 기억은 만료시킨다.
 * 사용자가 직접 지시한 기억(user_explicit·manual)은 건드리지 않는다.
 */
export async function runMemoryDecay(now: Date = new Date()): Promise<DecayResult> {
  try {
    const db = getDb();
    const rows = await db
      .select({
        memoryId: tinkerbellMemories.memoryId,
        confidence: tinkerbellMemories.confidence,
        evidenceCount: tinkerbellMemories.evidenceCount,
        source: tinkerbellMemories.source,
        lastConfirmedAt: tinkerbellMemories.lastConfirmedAt,
      })
      .from(tinkerbellMemories)
      .where(
        and(
          eq(tinkerbellMemories.status, 'active'),
          sql`${tinkerbellMemories.source} NOT IN ('user_explicit', 'manual')`,
        ),
      )
      .limit(5000);

    let decayed = 0;
    let expired = 0;

    for (const row of rows) {
      const days = (now.getTime() - row.lastConfirmedAt.getTime()) / (24 * 60 * 60 * 1000);
      if (days < 1) continue;
      const next = decayedConfidence(
        row.confidence,
        days,
        row.evidenceCount,
        row.source as MemorySource,
      );
      if (next >= row.confidence) continue;

      if (shouldExpire(next)) {
        await db
          .update(tinkerbellMemories)
          .set({ status: 'expired', confidence: next, updatedAt: now })
          .where(eq(tinkerbellMemories.memoryId, row.memoryId));
        expired += 1;
      } else {
        await db
          .update(tinkerbellMemories)
          .set({ confidence: next, updatedAt: now })
          .where(eq(tinkerbellMemories.memoryId, row.memoryId));
        decayed += 1;
      }
    }

    if (decayed + expired > 0) {
      invalidateMemoryCache();
      logger.info({ scanned: rows.length, decayed, expired }, '[Memory] 기억 감쇠 배치 완료');
    }
    return { scanned: rows.length, decayed, expired };
  } catch (err) {
    logger.warn({ err }, '[Memory] 감쇠 배치 실패');
    return { scanned: 0, decayed: 0, expired: 0 };
  }
}

// ── 관리 화면용 조회 ──

export interface MemoryListFilter {
  readonly userId: string | null;
  readonly farmIds: readonly string[] | null; // null = 전체 농장 (마스터·미배정 관리 역할)
  readonly status?: string;
  readonly limit?: number;
}

/**
 * 관리 화면 목록 — 회상과 같은 권한 규칙을 따른다.
 *
 * 개인(user) 기억은 farmIds가 null(전체 농장 권한)이어도 **본인 것만** 보인다.
 * 전체 농장 권한은 '농장 데이터를 다 본다'는 뜻이지 '남의 개인 설정을 본다'는 뜻이 아니다.
 */
export async function listMemories(filter: MemoryListFilter) {
  const db = getDb();
  const conditions: SQL[] = [];

  const status = filter.status ?? 'active';
  if (status !== 'all') {
    conditions.push(eq(tinkerbellMemories.status, status));
  }

  // 농장·개체 기억: farmIds가 null이면 전체, 아니면 배정 농장만
  const farmVisible: SQL | undefined =
    filter.farmIds === null
      ? sql`${tinkerbellMemories.scope} IN ('farm', 'animal')`
      : and(
          sql`${tinkerbellMemories.scope} IN ('farm', 'animal')`,
          inArray(tinkerbellMemories.farmId, [...filter.farmIds]),
        );

  // 개인 기억: 언제나 본인 것만
  const ownVisible: SQL | undefined = filter.userId
    ? and(eq(tinkerbellMemories.scope, 'user'), eq(tinkerbellMemories.userId, filter.userId))
    : undefined;

  const visible = [farmVisible, ownVisible].filter((c): c is SQL => c !== undefined);
  if (visible.length > 0) {
    const scoped = visible.length === 1 ? visible[0] : or(...visible);
    if (scoped) conditions.push(scoped);
  }

  const where = conditions.length > 0 ? and(...conditions) : undefined;
  return db
    .select()
    .from(tinkerbellMemories)
    .where(where)
    .orderBy(desc(tinkerbellMemories.importance), desc(tinkerbellMemories.lastConfirmedAt))
    .limit(Math.min(500, filter.limit ?? 200));
}

/** 관리 화면에서 직접 추가한 기억 — source='manual', 감쇠 면제 */
export async function createManualMemory(input: {
  readonly userId: string;
  readonly farmId: string | null;
  readonly animalId: string | null;
  readonly category: MemoryCategory;
  readonly subject: string;
  readonly content: string;
  readonly importance: number;
}): Promise<string | null> {
  const scope = scopeForCategory(input.category, input.farmId !== null, input.animalId !== null);
  const id = await insertMemory(
    {
      category: input.category,
      subject: input.subject,
      content: input.content,
      importance: input.importance,
      confidence: 0.9, // 사람이 직접 넣은 값 — 추출 추정치보다 신뢰한다
      source: 'manual',
      sourceQuote: input.content,
      keywords: extractKeywords(`${input.subject} ${input.content}`),
    },
    scope,
    {
      userId: input.userId,
      farmId: input.farmId,
      animalId: input.animalId,
      question: input.content,
      answer: '',
      conversationId: null,
    },
  );
  if (id) invalidateMemoryCache();
  return id;
}

export async function updateMemory(
  memoryId: string,
  patch: {
    readonly content?: string;
    readonly importance?: number;
    readonly subject?: string;
  },
): Promise<boolean> {
  const db = getDb();
  const values: Record<string, unknown> = { updatedAt: new Date() };
  if (patch.content !== undefined) {
    values['content'] = patch.content;
    values['keywords'] = [...extractKeywords(`${patch.subject ?? ''} ${patch.content}`)];
    // 사람이 고친 내용은 재확인으로 간주 — 감쇠 시계를 리셋한다
    values['lastConfirmedAt'] = new Date();
  }
  if (patch.importance !== undefined) values['importance'] = patch.importance;
  if (patch.subject !== undefined) values['subject'] = patch.subject.slice(0, 120);

  const rows = await db
    .update(tinkerbellMemories)
    .set(values)
    .where(eq(tinkerbellMemories.memoryId, memoryId))
    .returning({ memoryId: tinkerbellMemories.memoryId });
  invalidateMemoryCache();
  return rows.length > 0;
}
