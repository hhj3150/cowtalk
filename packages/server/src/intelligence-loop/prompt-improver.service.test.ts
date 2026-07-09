// 프롬프트 개선 순수 함수 테스트 — 가이던스 규칙, 최소 모수, 포맷

import { describe, it, expect } from 'vitest';
import {
  buildGuidance,
  formatPromptGuidances,
  MIN_LABELS_FOR_GUIDANCE,
} from './prompt-improver.service.js';

function stats(overrides: Partial<Parameters<typeof buildGuidance>[0]> = {}) {
  return {
    alarmType: 'temperature_high',
    totalLabels: 20,
    confirmed: 10,
    falsePositive: 5,
    modified: 5,
    ...overrides,
  };
}

describe('buildGuidance', () => {
  it(`라벨 ${MIN_LABELS_FOR_GUIDANCE}건 미만이면 null — 노이즈 통계로 가이던스 금지`, () => {
    expect(buildGuidance(stats({ totalLabels: 9, falsePositive: 9, confirmed: 0, modified: 0 }), 'farm')).toBeNull();
  });

  it('오탐 40%↑ → 신중 가이던스 (수치·모수 명시)', () => {
    const g = buildGuidance(stats({ totalLabels: 20, falsePositive: 10, confirmed: 8, modified: 2 }), 'farm');
    expect(g).not.toBeNull();
    expect(g!.text).toContain('오탐 50%');
    expect(g!.text).toContain('20건');
    expect(g!.text).toContain('이 농장');
    expect(g!.stats.fpRate).toBe(0.5);
  });

  it('판정 수정 30%↑ (오탐 40% 미만) → 감별 후보 가이던스', () => {
    const g = buildGuidance(stats({ totalLabels: 20, falsePositive: 2, confirmed: 10, modified: 8 }), 'global');
    expect(g).not.toBeNull();
    expect(g!.text).toContain('수정');
    expect(g!.text).toContain('전국');
  });

  it('확진 85%↑ → 고신뢰 가이던스', () => {
    const g = buildGuidance(stats({ totalLabels: 20, falsePositive: 1, confirmed: 18, modified: 1 }), 'farm');
    expect(g).not.toBeNull();
    expect(g!.text).toContain('90% 확진');
  });

  it('오탐 경고가 고신뢰보다 우선한다', () => {
    // fp 40% + confirm 60%는 동시 성립 불가하지만, fp 40% + modified 30% 동시엔 오탐이 우선
    const g = buildGuidance(stats({ totalLabels: 20, falsePositive: 8, confirmed: 4, modified: 8 }), 'farm');
    expect(g!.text).toContain('오탐');
  });

  it('어떤 규칙에도 걸리지 않으면 null — 억지 가이던스 금지', () => {
    // fp 10%, confirm 70%, modified 20% → 전부 기준 미달
    expect(buildGuidance(stats({ totalLabels: 20, falsePositive: 2, confirmed: 14, modified: 4 }), 'farm')).toBeNull();
  });
});

describe('formatPromptGuidances', () => {
  it('빈 배열은 null — 빈 헤더 블록을 만들지 않는다', () => {
    expect(formatPromptGuidances([])).toBeNull();
  });

  it('가이던스를 불릿 블록으로 포맷', () => {
    const block = formatPromptGuidances([
      { farmId: 'f1', alarmType: 'temperature_high', guidanceText: 'A 가이드' },
      { farmId: null, alarmType: 'estrus', guidanceText: 'B 가이드' },
    ]);
    expect(block).toContain('AI 자기보정 가이드');
    expect(block).toContain('- A 가이드');
    expect(block).toContain('- B 가이드');
  });
});
