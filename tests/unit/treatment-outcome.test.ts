// 치료 결과 판정 테스트 — assessRecovery 순수 함수
import { describe, it, expect } from 'vitest';
import { assessRecovery } from '../../packages/server/src/services/vet/treatment-outcome.service.js';

describe('assessRecovery — 치료 후 회복 판정', () => {
  it('체온 정상화 + 반추 회복 → recovered', () => {
    const pre = { temp: 39.8, rumination: 200, activity: 80 };
    const post = { temp: 38.6, rumination: 450, activity: 120 };
    expect(assessRecovery(pre, post)).toBe('recovered');
  });

  it('체온 여전히 높음 → worsened', () => {
    const pre = { temp: 39.5, rumination: 300, activity: 100 };
    const post = { temp: 40.1, rumination: 280, activity: 90 };
    expect(assessRecovery(pre, post)).toBe('worsened');
  });

  it('체온 정상화, 반추 미회복 → recovered (체온 정상화만으로 충분)', () => {
    const pre = { temp: 39.8, rumination: 400, activity: 100 };
    const post = { temp: 38.5, rumination: 380, activity: 95 };
    expect(assessRecovery(pre, post)).toBe('recovered');
  });

  it('애매한 경우 → monitoring', () => {
    const pre = { temp: 39.2, rumination: 350, activity: 100 };
    const post = { temp: 39.5, rumination: 340, activity: 95 };
    expect(assessRecovery(pre, post)).toBe('monitoring');
  });

  it('센서 데이터 없음 → monitoring', () => {
    const pre = { temp: null, rumination: null, activity: null };
    const post = { temp: null, rumination: null, activity: null };
    expect(assessRecovery(pre, post)).toBe('monitoring');
  });

  it('체온만 있고 정상화 → recovered', () => {
    const pre = { temp: 40.0, rumination: null, activity: null };
    const post = { temp: 38.8, rumination: null, activity: null };
    expect(assessRecovery(pre, post)).toBe('recovered');
  });
});
