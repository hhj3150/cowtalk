// 5단계 긴급도 분류기 테스트 — 결정적 규칙 검증

import { describe, it, expect } from 'vitest';
import { classifyUrgency, URGENCY_LABELS, URGENCY_ORDER } from '../constants/urgency.js';

describe('classifyUrgency', () => {
  it('critical은 골든타임과 무관하게 응급이다', () => {
    expect(classifyUrgency('critical')).toBe('emergency');
    expect(classifyUrgency('critical', 100)).toBe('emergency');
  });

  it('골든타임 6시간 이내면 심각도와 무관하게 응급이다', () => {
    expect(classifyUrgency('low', 3)).toBe('emergency');
    expect(classifyUrgency('medium', 6)).toBe('emergency');
  });

  it('high 또는 24시간 이내는 오늘 조치다', () => {
    expect(classifyUrgency('high')).toBe('today');
    expect(classifyUrgency('high', 72)).toBe('today');
    expect(classifyUrgency('low', 20)).toBe('today');
  });

  it('48시간 이내 골든타임은 within_48h다', () => {
    expect(classifyUrgency('medium', 40)).toBe('within_48h');
    expect(classifyUrgency('low', 48)).toBe('within_48h');
  });

  it('마감 없는 medium은 관찰, low는 정보다', () => {
    expect(classifyUrgency('medium')).toBe('watch');
    expect(classifyUrgency('low')).toBe('info');
  });

  it('음수·NaN 골든타임은 무시한다 (severity만으로 분류)', () => {
    expect(classifyUrgency('medium', -5)).toBe('watch');
    expect(classifyUrgency('low', Number.NaN)).toBe('info');
  });

  it('라벨과 순서는 5단계 전부를 커버한다', () => {
    expect(URGENCY_ORDER).toHaveLength(5);
    for (const u of URGENCY_ORDER) {
      expect(URGENCY_LABELS[u].length).toBeGreaterThan(0);
    }
  });
});
