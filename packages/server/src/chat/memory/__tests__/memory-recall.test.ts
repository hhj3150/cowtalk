// 기억 회상 규칙 테스트 — 무엇을 프롬프트에 넣을지가 답변 품질을 결정한다.

import { describe, it, expect } from 'vitest';
import {
  scoreMemory,
  selectRelevantMemories,
  formatMemoryContext,
  keywordOverlap,
  tokenizeQuestion,
  type RecallableMemory,
} from '../memory-recall.js';

function mem(overrides: Partial<RecallableMemory> = {}): RecallableMemory {
  return {
    memoryId: 'm1',
    scope: 'farm',
    category: 'equipment',
    subject: '착유설비',
    content: '착유는 로봇착유기 1대로 한다.',
    confidence: 0.7,
    importance: 3,
    evidenceCount: 1,
    keywords: ['착유', '로봇착유기'],
    lastConfirmedAt: new Date('2026-08-01T00:00:00Z'),
    ...overrides,
  };
}

const NOW = new Date('2026-08-09T00:00:00Z');

describe('keywordOverlap', () => {
  it('정확히 겹치는 토큰을 센다', () => {
    expect(keywordOverlap(tokenizeQuestion('착유 간격 어때?'), ['착유'])).toBe(1);
  });

  it('부분 일치도 인정한다 (착유기 ↔ 로봇착유기)', () => {
    expect(keywordOverlap(tokenizeQuestion('로봇착유기 문제야'), ['착유기'])).toBeGreaterThan(0);
  });

  it('겹치는 게 없으면 0', () => {
    expect(keywordOverlap(tokenizeQuestion('발정 언제야'), ['사료', '배합'])).toBe(0);
  });
});

describe('scoreMemory', () => {
  it('질문과 겹치는 기억이 더 높은 점수를 받는다', () => {
    const relevant = scoreMemory(mem(), tokenizeQuestion('착유 간격 어떻게 봐?'), NOW);
    const irrelevant = scoreMemory(mem(), tokenizeQuestion('브루셀라 검사 언제야?'), NOW);
    expect(relevant).toBeGreaterThan(irrelevant);
  });

  it('개체 스코프가 농장·사용자 스코프보다 가중치가 높다', () => {
    const q = tokenizeQuestion('이 소 어때');
    const animal = scoreMemory(mem({ scope: 'animal' }), q, NOW);
    const farm = scoreMemory(mem({ scope: 'farm' }), q, NOW);
    expect(animal).toBeGreaterThan(farm);
  });

  it('여러 번 확인된 기억이 소폭 가산된다', () => {
    const q = tokenizeQuestion('착유');
    expect(scoreMemory(mem({ evidenceCount: 5 }), q, NOW))
      .toBeGreaterThan(scoreMemory(mem({ evidenceCount: 1 }), q, NOW));
  });

  it('질문과 무관해도 0점이 되지 않는다 (근본 사실은 항상 일부 반영)', () => {
    expect(scoreMemory(mem(), tokenizeQuestion('전혀 다른 이야기'), NOW)).toBeGreaterThan(0);
  });
});

describe('selectRelevantMemories', () => {
  const pool: readonly RecallableMemory[] = [
    mem({ memoryId: 'a', subject: '착유설비', keywords: ['착유', '로봇착유기'], importance: 5 }),
    mem({ memoryId: 'b', subject: '사료', keywords: ['tmr', '배합사료'], content: 'TMR을 급여한다.', importance: 2 }),
    mem({ memoryId: 'c', subject: '제약', keywords: ['덱사메타손'], content: '덱사메타손은 쓰지 않는다.', importance: 4 }),
  ];

  it('질문에 맞는 기억을 앞으로 올린다', () => {
    const out = selectRelevantMemories(pool, '사료 배합 어떻게 할까?', 3, NOW);
    expect(out[0]?.memoryId).toBe('b');
  });

  it('limit을 지킨다', () => {
    expect(selectRelevantMemories(pool, '아무거나', 2, NOW)).toHaveLength(2);
  });

  it('빈 입력에 안전하다', () => {
    expect(selectRelevantMemories([], '질문', 5, NOW)).toEqual([]);
  });
});

describe('formatMemoryContext', () => {
  it('기억이 없으면 빈 문자열 (프롬프트를 오염시키지 않는다)', () => {
    expect(formatMemoryContext([])).toBe('');
  });

  it('카테고리별로 묶어 출력한다', () => {
    const out = formatMemoryContext([
      mem({ category: 'equipment' }),
      mem({ memoryId: 'm2', category: 'constraint', content: '덱사메타손은 쓰지 않는다.' }),
    ]);
    expect(out).toContain('장비');
    expect(out).toContain('제약');
    expect(out).toContain('덱사메타손은 쓰지 않는다.');
  });

  it('센서 데이터 우선 원칙을 항상 명시한다', () => {
    // 이 문장이 빠지면 AI가 오래된 기억을 실측처럼 단언하게 된다
    const out = formatMemoryContext([mem()]);
    expect(out).toContain('데이터를 우선');
  });

  it('반복 확인 횟수와 불확실 표시를 붙인다', () => {
    const out = formatMemoryContext([mem({ evidenceCount: 3, confidence: 0.4 })]);
    expect(out).toContain('3회 확인');
    expect(out).toContain('불확실');
  });
});
