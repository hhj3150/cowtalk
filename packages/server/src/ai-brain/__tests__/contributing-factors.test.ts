// contributingFactors 도출 로직 테스트 (CLAUDE.md 필수 필드 보장)

import { describe, it, expect } from 'vitest';
import { signalText, deriveContributingFactors } from '../claude-interpreter.js';
import type { V4FusionResult } from '../v4-engines/index.js';

// 최소 V4FusionResult 목 (테스트에 필요한 신호만)
function mockV4(signals: {
  estrus?: string[];
  disease?: string[];
  pregnancy?: Array<string | { description: string }>;
}): V4FusionResult {
  return {
    estrus: { signals: signals.estrus ?? [] },
    disease: { signals: signals.disease ?? [] },
    pregnancy: { signals: signals.pregnancy ?? [] },
  } as unknown as V4FusionResult;
}

describe('signalText', () => {
  it('문자열 신호는 그대로 반환', () => {
    expect(signalText('체온 39.8°C 상승')).toBe('체온 39.8°C 상승');
  });

  it('객체 신호(pregnancy)는 description 추출', () => {
    expect(signalText({ description: '반추 30% 감소' })).toBe('반추 30% 감소');
  });

  it('description 없는 객체는 빈 문자열', () => {
    expect(signalText({} as { description?: string })).toBe('');
  });
});

describe('deriveContributingFactors', () => {
  it('Claude가 기여 요인을 주면 그대로 사용', () => {
    const v4 = mockV4({ estrus: ['무시될 신호'] });
    expect(deriveContributingFactors(['요인 A', '요인 B'], v4)).toEqual(['요인 A', '요인 B']);
  });

  it('Claude 값이 없으면 v4 신호에서 도출(문자열+객체 혼합 정규화)', () => {
    const v4 = mockV4({
      estrus: ['활동량 급증'],
      disease: ['체온 상승'],
      pregnancy: [{ description: '임신 안정' }],
    });
    expect(deriveContributingFactors(undefined, v4)).toEqual(['활동량 급증', '체온 상승', '임신 안정']);
  });

  it('빈 배열도 v4 폴백으로 처리', () => {
    const v4 = mockV4({ disease: ['케토시스 의심'] });
    expect(deriveContributingFactors([], v4)).toEqual(['케토시스 의심']);
  });

  it('빈 문자열 신호는 제거', () => {
    const v4 = mockV4({ estrus: ['신호1'], pregnancy: [{ description: '' }] });
    expect(deriveContributingFactors(null, v4)).toEqual(['신호1']);
  });
});
