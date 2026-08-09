// 기억 추출 규칙 테스트 — 게이트·명시지시·파싱은 순수 함수라 DB 없이 고정할 수 있다.
// 이 규칙이 무너지면 (a) 모든 대화가 LLM 호출을 태우거나 (b) 일회성 사건이 영구 기억이 된다.

import { describe, it, expect } from 'vitest';
import {
  detectExplicitCommand,
  evaluateMemoryGate,
  isMemoryWorthy,
  extractKeywords,
  parseExtractionResponse,
  extractByRules,
} from '../memory-extractor.js';

describe('detectExplicitCommand', () => {
  it('기억 지시를 감지하고 지시어를 걷어낸 본문을 돌려준다', () => {
    const cmd = detectExplicitCommand('우리 착유는 로봇착유기로 한다, 기억해');
    expect(cmd?.kind).toBe('remember');
    expect(cmd?.payload).toBe('우리 착유는 로봇착유기로 한다');
  });

  it('망각 지시를 감지한다', () => {
    const cmd = detectExplicitCommand('사료 얘기는 잊어');
    expect(cmd?.kind).toBe('forget');
  });

  it('"기억하지 마"는 기억이 아니라 망각으로 해석한다', () => {
    // '기억하'가 REMEMBER 패턴에도 걸리므로 순서 의존 버그가 나기 쉬운 지점
    const cmd = detectExplicitCommand('방금 그건 기억하지 마');
    expect(cmd?.kind).toBe('forget');
  });

  it('평범한 발화에는 지시가 없다', () => {
    expect(detectExplicitCommand('오늘 발정 온 소 있어?')).toBeNull();
  });
});

describe('evaluateMemoryGate', () => {
  it('순수 질의는 통과시키지 않는다 (LLM 호출 절약)', () => {
    for (const q of ['오늘 할 일 알려줘', '423번 체온 뭐야?', '이번 주 발정 몇 마리야?']) {
      const gate = evaluateMemoryGate(q);
      expect(gate.worthy, q).toBe(false);
    }
  });

  it('목장 고유 사실 서술은 통과시킨다', () => {
    for (const q of [
      '우리 목장은 로봇착유기 한 대로 착유해',
      '앞으로 덱사메타손은 안 쓴다',
      '우유는 자체 가공해서 판매한다',
    ]) {
      expect(evaluateMemoryGate(q).worthy, q).toBe(true);
    }
  });

  it('정정 발화는 언제나 통과시킨다', () => {
    const gate = evaluateMemoryGate('그건 아니야, 우리는 그 사료 안 써');
    expect(gate.worthy).toBe(true);
    expect(gate.reason).toBe('correction');
  });

  it('질문과 서술이 섞이면 서술 쪽을 인정한다', () => {
    expect(isMemoryWorthy('우리는 로봇착유기 쓰는데 발정은 어떻게 봐?')).toBe(true);
  });

  it('너무 짧은 발화는 걸러낸다', () => {
    expect(evaluateMemoryGate('응').worthy).toBe(false);
    expect(evaluateMemoryGate('ㅇㅋ').reason).toBe('too_short');
  });
});

describe('extractKeywords', () => {
  it('불용어·1글자를 제거하고 중복을 없앤다', () => {
    const kws = extractKeywords('우리 목장은 로봇착유기 로봇착유기 를 쓴다');
    expect(kws).toContain('로봇착유기');
    expect(kws).not.toContain('우리');
    expect(new Set(kws).size).toBe(kws.length);
  });
});

describe('parseExtractionResponse', () => {
  const quote = '우리는 로봇착유기를 쓴다';

  it('유효한 항목을 후보로 변환한다', () => {
    const out = parseExtractionResponse({
      memories: [{
        category: 'equipment',
        subject: '착유설비',
        content: '착유는 Lely A3 로봇착유기 1대로 한다.',
        importance: 5,
        confidence: 0.9,
      }],
    }, quote);
    expect(out).toHaveLength(1);
    expect(out[0]?.category).toBe('equipment');
    expect(out[0]?.sourceQuote).toBe(quote);
    expect(out[0]?.keywords.length).toBeGreaterThan(0);
  });

  it('알 수 없는 카테고리는 버린다', () => {
    const out = parseExtractionResponse({
      memories: [{ category: 'nonsense', subject: 'x', content: '내용이 충분히 김', importance: 3 }],
    }, quote);
    expect(out).toHaveLength(0);
  });

  it('일회성 사건은 기억으로 승격하지 않는다', () => {
    // "오늘 423번 열났다"는 animal_events 소관 — 기억이 되면 영구 오염
    const out = parseExtractionResponse({
      memories: [{ category: 'animal_fact', subject: '423번', content: '오늘 423번이 열이 났다.', importance: 4 }],
    }, quote);
    expect(out).toHaveLength(0);
  });

  it('importance·confidence를 유효 범위로 클램프한다', () => {
    const out = parseExtractionResponse({
      memories: [{ category: 'farm_fact', subject: 'a', content: '충분히 긴 내용입니다', importance: 99, confidence: 5 }],
    }, quote);
    expect(out[0]?.importance).toBe(5);
    expect(out[0]?.confidence).toBeLessThanOrEqual(0.95);
  });

  it('memories 필드가 없으면 빈 배열', () => {
    expect(parseExtractionResponse({}, quote)).toEqual([]);
  });
});

describe('extractByRules (LLM 폴백)', () => {
  it('장비 언급을 equipment 기억으로 뽑는다', () => {
    const out = extractByRules('우리 목장은 로봇착유기 한 대로 착유한다');
    expect(out[0]?.category).toBe('equipment');
    expect(out[0]?.subject).toBe('착유설비');
  });

  it('게이트를 통과 못 하면 아무것도 뽑지 않는다', () => {
    expect(extractByRules('오늘 할 일 알려줘')).toHaveLength(0);
  });

  it('명시 지시는 규칙에 안 걸려도 통째로 남긴다', () => {
    const out = extractByRules('내 생일은 축산의 날이야', 'user_explicit');
    expect(out).toHaveLength(1);
    expect(out[0]?.confidence).toBeGreaterThan(0.7);
  });

  it('규칙 추출은 LLM 추출보다 낮은 신뢰도로 시작한다', () => {
    const out = extractByRules('우리는 TMR 배합사료를 쓴다');
    expect(out[0]?.confidence).toBeLessThan(0.7);
  });
});
