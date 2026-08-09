// 기억 통합 규칙 테스트 — "반복은 강화, 모순은 대체, 침묵은 감쇠"가 이 시스템의 학습 규칙이다.
// 여기가 틀어지면 기억이 중복 축적되거나(노이즈), 옛 사실이 새 사실을 이긴다(오답).

import { describe, it, expect } from 'vitest';
import {
  similarity,
  decideConsolidation,
  reinforcedConfidence,
  decayedConfidence,
  shouldExpire,
  isDecayExempt,
  CONFIDENCE_CEILING,
  DECAY_HALF_LIFE_DAYS,
  type ExistingMemory,
} from '../memory-consolidation.js';

function existing(overrides: Partial<ExistingMemory> = {}): ExistingMemory {
  return {
    memoryId: 'm1',
    subject: '착유설비',
    content: '착유는 로봇착유기 1대로 한다.',
    confidence: 0.6,
    evidenceCount: 1,
    importance: 3,
    source: 'chat_auto',
    lastConfirmedAt: new Date('2026-07-01T00:00:00Z'),
    ...overrides,
  };
}

describe('similarity', () => {
  it('같은 이야기는 높게, 다른 이야기는 낮게', () => {
    expect(similarity('착유는 로봇착유기로 한다', '착유는 로봇착유기 1대로 한다')).toBeGreaterThan(0.5);
    expect(similarity('착유는 로봇착유기로 한다', '사료는 TMR을 쓴다')).toBeLessThan(0.2);
  });

  it('조사 차이는 무시한다', () => {
    expect(similarity('로봇착유기를 쓴다', '로봇착유기는 쓴다')).toBeGreaterThan(0.5);
  });

  it('빈 문자열은 0', () => {
    expect(similarity('', '무언가')).toBe(0);
  });
});

describe('decideConsolidation', () => {
  it('같은 주제 + 같은 내용 → 강화 (증거 누적)', () => {
    const d = decideConsolidation(
      { subject: '착유설비', content: '착유는 로봇착유기 1대로 한다', confidence: 0.8, importance: 4, source: 'chat_auto' },
      [existing()],
    );
    expect(d.kind).toBe('reinforce');
    if (d.kind === 'reinforce') {
      expect(d.nextEvidenceCount).toBe(2);
      expect(d.nextConfidence).toBeGreaterThan(0.6);
      expect(d.nextImportance).toBe(4); // 더 높은 중요도를 채택
    }
  });

  it('같은 주제 + 다른 내용 → 대체 (최신 발언이 이긴다)', () => {
    const d = decideConsolidation(
      { subject: '착유설비', content: '올해부터 파이프라인 착유로 바꿨다', confidence: 0.9, importance: 4, source: 'chat_auto' },
      [existing()],
    );
    expect(d.kind).toBe('supersede');
    if (d.kind === 'supersede') expect(d.targetId).toBe('m1');
  });

  it('주제가 달라도 내용이 거의 같으면 중복 축적을 막는다', () => {
    const d = decideConsolidation(
      { subject: '착유방식', content: '착유는 로봇착유기 1대로 한다.', confidence: 0.7, importance: 3, source: 'chat_auto' },
      [existing()],
    );
    expect(d.kind).toBe('reinforce');
  });

  it('관련 없는 새 사실 → 삽입', () => {
    const d = decideConsolidation(
      { subject: '사료', content: 'TMR 배합사료를 급여한다', confidence: 0.7, importance: 3, source: 'chat_auto' },
      [existing()],
    );
    expect(d.kind).toBe('insert');
  });

  it('기존 기억이 없으면 항상 삽입', () => {
    const d = decideConsolidation(
      { subject: '사료', content: 'TMR을 쓴다', confidence: 0.7, importance: 3, source: 'chat_auto' },
      [],
    );
    expect(d.kind).toBe('insert');
  });

  it('같은 주제가 여러 개면 가장 가까운 것을 대상으로 잡는다', () => {
    const d = decideConsolidation(
      { subject: '착유설비', content: 'TMR 배합기를 한 대 보유하고 있다', confidence: 0.8, importance: 3, source: 'chat_auto' },
      [
        existing({ memoryId: 'a', content: '착유는 로봇착유기 1대로 한다.' }),
        existing({ memoryId: 'b', content: 'TMR 배합기를 한 대 보유한다.' }),
      ],
    );
    // b 쪽이 더 가까우므로 b를 강화 대상으로 잡아야 한다
    expect(d.kind).toBe('reinforce');
    if (d.kind === 'reinforce') expect(d.targetId).toBe('b');
  });

  it('어미만 다른 재언급은 강화로 인정한다 (강화 루프가 발동하는 지점)', () => {
    // "보유한다" / "보유하고 있다"가 서로 다른 문장으로 취급되면 evidence_count가 영원히 1에 머문다
    const d = decideConsolidation(
      { subject: '사료', content: 'TMR 배합사료를 급여하고 있다', confidence: 0.7, importance: 3, source: 'chat_auto' },
      [existing({ memoryId: 'f', subject: '사료', content: 'TMR 배합사료를 급여한다.' })],
    );
    expect(d.kind).toBe('reinforce');
  });

  it('부정이 뒤집히면 문장이 비슷해도 대체로 처리한다', () => {
    // "덱사를 쓴다" → "덱사를 안 쓴다"를 강화로 처리하면 정반대 사실이 확신으로 굳는다
    const d = decideConsolidation(
      { subject: '제약', content: '덱사메타손은 안 쓴다', confidence: 0.9, importance: 4, source: 'chat_auto' },
      [existing({ memoryId: 'n', subject: '제약', content: '덱사메타손을 쓴다' })],
    );
    expect(d.kind).toBe('supersede');
  });
});

describe('reinforcedConfidence', () => {
  it('반복 확인마다 상승하되 상한을 넘지 않는다', () => {
    let c = 0.5;
    for (let i = 0; i < 30; i++) c = reinforcedConfidence(c);
    expect(c).toBeLessThanOrEqual(CONFIDENCE_CEILING);
    expect(c).toBeGreaterThan(0.9);
  });

  it('한 번에 확신하지 않는다 (점근적 상승)', () => {
    expect(reinforcedConfidence(0.5)).toBeLessThan(0.75);
  });
});

describe('decayedConfidence', () => {
  it('반감기만큼 지나면 신뢰도가 절반이 된다', () => {
    const out = decayedConfidence(0.8, DECAY_HALF_LIFE_DAYS, 1);
    expect(out).toBeCloseTo(0.4, 2);
  });

  it('증거가 많을수록 천천히 잊는다', () => {
    const weak = decayedConfidence(0.8, 200, 1);
    const strong = decayedConfidence(0.8, 200, 5);
    expect(strong).toBeGreaterThan(weak);
  });

  it('사용자가 직접 지시한 기억은 감쇠하지 않는다', () => {
    expect(decayedConfidence(0.9, 3650, 1, 'user_explicit')).toBe(0.9);
    expect(decayedConfidence(0.9, 3650, 1, 'manual')).toBe(0.9);
    expect(isDecayExempt('chat_auto')).toBe(false);
  });

  it('시간이 지나지 않았으면 그대로', () => {
    expect(decayedConfidence(0.7, 0, 1)).toBe(0.7);
  });
});

describe('shouldExpire', () => {
  it('바닥을 친 기억만 만료시킨다', () => {
    expect(shouldExpire(0.19)).toBe(true);
    expect(shouldExpire(0.21)).toBe(false);
  });
});
