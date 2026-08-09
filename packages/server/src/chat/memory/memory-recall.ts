// 기억 회상(recall) — 저장된 기억 중 '지금 이 질문에' 필요한 것만 골라 프롬프트에 넣는다.
//
// 전부 넣으면 컨텍스트가 터지고 정확도가 떨어진다. 점수화해서 상위 N개만 넣는다.
// 점수 함수는 순수 함수로 분리 — 회상 규칙을 테스트로 고정하기 위함.

import type { MemoryCategory, MemoryScope } from '@cowtalk/shared';
import { MEMORY_CATEGORY_LABELS } from '@cowtalk/shared';

export interface RecallableMemory {
  readonly memoryId: string;
  readonly scope: MemoryScope;
  readonly category: MemoryCategory;
  readonly subject: string;
  readonly content: string;
  readonly confidence: number;
  readonly importance: number;
  readonly evidenceCount: number;
  readonly keywords: readonly string[];
  readonly lastConfirmedAt: Date;
}

/** 프롬프트에 넣을 최대 기억 수 — 컨텍스트 예산과 신호대잡음의 타협점 */
export const MAX_RECALLED_MEMORIES = 12;

/** 스코프별 가중치 — 좁은 스코프일수록 지금 대화에 직접적이다 */
const SCOPE_WEIGHT: Readonly<Record<MemoryScope, number>> = {
  animal: 0.5,
  farm: 0.25,
  user: 0.2,
};

const RECENT_CONFIRM_DAYS = 14;

function daysBetween(a: Date, b: Date): number {
  return Math.abs(a.getTime() - b.getTime()) / (24 * 60 * 60 * 1000);
}

/** 질문 토큰과 기억 키워드의 겹침 비율 (0~1) */
export function keywordOverlap(
  questionTokens: ReadonlySet<string>,
  keywords: readonly string[],
): number {
  if (keywords.length === 0 || questionTokens.size === 0) return 0;
  let hits = 0;
  for (const k of keywords) {
    if (questionTokens.has(k)) {
      hits += 1;
      continue;
    }
    // 부분 일치도 인정 — "착유기"와 "로봇착유기", "사료"와 "배합사료"가 서로를 놓치지 않게.
    // 한국어 핵심 명사는 2음절이 대부분이라 최소 길이를 2로 둔다 (3이면 대부분의 매칭을 놓친다).
    for (const q of questionTokens) {
      if (q.length >= 2 && (q.includes(k) || k.includes(q))) {
        hits += 1;
        break;
      }
    }
  }
  return Math.min(1, hits / keywords.length);
}

export function tokenizeQuestion(question: string): ReadonlySet<string> {
  return new Set(
    question
      .toLowerCase()
      .split(/[^가-힣a-z0-9]+/u)
      .filter((t) => t.length >= 2),
  );
}

/**
 * 기억의 회상 점수.
 *
 * 질문과 무관한 기억도 0점이 되지 않는 이유: 목장의 근본 사실(장비·사육방식)은
 * 질문에 단어가 안 나와도 답변에 영향을 준다. 대신 중요도·신뢰도로 걸러진다.
 */
export function scoreMemory(
  memory: RecallableMemory,
  questionTokens: ReadonlySet<string>,
  now: Date = new Date(),
): number {
  const overlap = keywordOverlap(questionTokens, memory.keywords);
  const recencyBonus =
    daysBetween(now, memory.lastConfirmedAt) <= RECENT_CONFIRM_DAYS ? 0.15 : 0;
  // 여러 번 확인된 기억에 소폭 가산 (5건에서 포화)
  const evidenceBonus = Math.min(0.15, memory.evidenceCount * 0.03);

  return (
    overlap * 1.2 +
    memory.confidence * 0.6 +
    (memory.importance / 5) * 0.5 +
    SCOPE_WEIGHT[memory.scope] +
    recencyBonus +
    evidenceBonus
  );
}

/** 점수 상위 N개 선별 — 동점이면 중요도 → 신뢰도 순 */
export function selectRelevantMemories(
  memories: readonly RecallableMemory[],
  question: string,
  limit: number = MAX_RECALLED_MEMORIES,
  now: Date = new Date(),
): readonly RecallableMemory[] {
  const tokens = tokenizeQuestion(question);
  return [...memories]
    .map((m) => ({ m, score: scoreMemory(m, tokens, now) }))
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      if (b.m.importance !== a.m.importance) return b.m.importance - a.m.importance;
      return b.m.confidence - a.m.confidence;
    })
    .slice(0, limit)
    .map((x) => x.m);
}

/**
 * 프롬프트 블록 생성.
 *
 * 정직성 규칙을 블록 안에 명시한다 — 기억은 사용자가 말한 것이지 검증된 사실이 아니다.
 * 센서·DB 데이터와 충돌하면 데이터가 이긴다. 이 문장이 없으면 AI가 오래된 기억을
 * 실측처럼 단언하게 된다.
 */
export function formatMemoryContext(memories: readonly RecallableMemory[]): string {
  if (memories.length === 0) return '';

  const byCategory = new Map<MemoryCategory, RecallableMemory[]>();
  for (const m of memories) {
    const list = byCategory.get(m.category) ?? [];
    list.push(m);
    byCategory.set(m.category, list);
  }

  const lines: string[] = [
    '## 팅커벨이 기억하고 있는 것 (이 사용자·목장이 알려준 사실)',
    '아래는 과거 대화에서 사용자가 직접 말한 내용입니다. 답변에 자연스럽게 반영하세요.',
  ];

  for (const [category, items] of byCategory) {
    const label = MEMORY_CATEGORY_LABELS[category] ?? category;
    lines.push(`- ${label}:`);
    for (const m of items) {
      const marks: string[] = [];
      if (m.evidenceCount > 1) marks.push(`${String(m.evidenceCount)}회 확인`);
      if (m.confidence < 0.5) marks.push('불확실');
      const suffix = marks.length > 0 ? ` (${marks.join(', ')})` : '';
      lines.push(`  · ${m.content}${suffix}`);
    }
  }

  lines.push(
    '',
    '기억 사용 규칙:',
    '- 이미 아는 것을 다시 묻지 마세요. 기억한 조건을 전제로 바로 답하세요.',
    '- 기억은 사용자 발언이지 실측이 아닙니다. 센서·DB 데이터와 충돌하면 데이터를 우선하고, 충돌 사실을 한 줄로 알리세요.',
    '- "불확실"로 표시된 기억은 단정하지 말고 필요할 때 한 번 확인하세요.',
    '- 기억을 인용할 때는 자연스럽게 녹이세요 ("로봇착유기라 착유 간격이…"). 기억 목록을 나열하지 마세요.',
  );

  return lines.join('\n');
}
