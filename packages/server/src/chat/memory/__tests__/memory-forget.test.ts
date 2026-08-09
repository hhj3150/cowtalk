// 망각 지목 규칙 — "그 로봇착유기 얘기는 잊어"가 실제로 그 기억을 지목하는가.
//
// 배경: 망각 지시는 짧다. 문장 유사도만 쓰면 짧은 지시와 긴 기억 문장의 겹침 비율이
// 낮아 아무것도 지워지지 않는다(사용자에겐 "잊으라니까 안 잊네"로 보인다).
// 반대로 지목어 없이 지우면 엉뚱한 기억이 날아간다. 그 경계를 여기서 고정한다.

import { describe, it, expect } from 'vitest';
import { extractKeywords } from '../memory-extractor.js';
import { similarity } from '../memory-consolidation.js';

// memory.service의 매칭 규칙과 동일한 순수 재현 — DB 없이 규칙만 검증한다.
const FORGET_FILLERS = new Set([
  '얘기', '이야기', '내용', '부분', '그거', '저거', '이거', '방금', '아까',
  '전에', '말한', '했던', '그건', '그것', '기억', '아까한', '전부', '모두',
]);

interface Mem { readonly subject: string; readonly content: string; readonly keywords: readonly string[] }

function matches(text: string, memories: readonly Mem[]): readonly Mem[] {
  const pointers = extractKeywords(text).filter((t) => !FORGET_FILLERS.has(t));
  if (pointers.length === 0) return [];
  return memories.filter((m) => {
    if (similarity(text, m.content) >= 0.3) return true;
    const haystack = `${m.subject} ${m.content} ${m.keywords.join(' ')}`.toLowerCase();
    return pointers.some((p) => haystack.includes(p));
  });
}

const POOL: readonly Mem[] = [
  { subject: '착유설비', content: '착유는 Lely A3 로봇착유기 1대로 한다.', keywords: ['착유', '로봇착유기'] },
  { subject: '사료', content: 'TMR 배합사료를 급여한다.', keywords: ['tmr', '배합사료'] },
  { subject: '제약', content: '덱사메타손은 쓰지 않는다.', keywords: ['덱사메타손'] },
];

describe('망각 지목 매칭', () => {
  it('짧은 지목어로도 해당 기억을 찾는다', () => {
    const hit = matches('로봇착유기 얘기는 잊어', POOL);
    expect(hit).toHaveLength(1);
    expect(hit[0]?.subject).toBe('착유설비');
  });

  it('주제어로 지목할 수 있다', () => {
    const hit = matches('사료 관련된 거 잊어', POOL);
    expect(hit.map((m) => m.subject)).toContain('사료');
  });

  it('지시어만 있으면 아무것도 지우지 않는다 (오삭제 방지)', () => {
    // "그거 잊어"로 목장 기억 전체가 날아가면 안 된다
    expect(matches('그거 잊어', POOL)).toHaveLength(0);
    expect(matches('방금 그 얘기 잊어', POOL)).toHaveLength(0);
  });

  it('전혀 관련 없는 지목어는 아무것도 지우지 않는다', () => {
    expect(matches('브루셀라 얘기 잊어', POOL)).toHaveLength(0);
  });

  it('기억 문장을 그대로 말하면 유사도 경로로 잡힌다', () => {
    const hit = matches('덱사메타손은 쓰지 않는다', POOL);
    expect(hit.map((m) => m.subject)).toContain('제약');
  });
});
