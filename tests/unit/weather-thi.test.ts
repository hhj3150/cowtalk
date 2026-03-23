// THI (온습도지수) 계산 테스트 — 축산 열스트레스 핵심 지표
import { describe, it, expect } from 'vitest';
import { calculateTHI } from '@server/pipeline/connectors/public-data/weather.connector';

describe('calculateTHI', () => {
  it('정상 범위 (25°C, 50%) → THI < 72', () => {
    const thi = calculateTHI(25, 50);
    expect(thi).toBeLessThan(72);
  });

  it('경미 열스트레스 (30°C, 60%) → THI 68~72', () => {
    const thi = calculateTHI(30, 60);
    expect(thi).toBeGreaterThanOrEqual(68);
  });

  it('주의 열스트레스 (33°C, 70%) → THI ≥ 72', () => {
    const thi = calculateTHI(33, 70);
    expect(thi).toBeGreaterThanOrEqual(72);
  });

  it('심각 열스트레스 (36°C, 80%) → THI ≥ 78', () => {
    const thi = calculateTHI(36, 80);
    expect(thi).toBeGreaterThanOrEqual(78);
  });

  it('긴급 열스트레스 (40°C, 90%) → THI ≥ 84', () => {
    const thi = calculateTHI(40, 90);
    expect(thi).toBeGreaterThanOrEqual(84);
  });

  it('동절기 (0°C, 50%) → THI < 50', () => {
    const thi = calculateTHI(0, 50);
    expect(thi).toBeLessThan(50);
  });

  it('NRC 1971 공식 검증 — 35°C, 75% → 약 86.6', () => {
    const thi = calculateTHI(35, 75);
    // (1.8 * 35 + 32) - (0.55 - 0.0055 * 75) * (1.8 * 35 - 26)
    // = 95 - (0.55 - 0.4125) * 37 = 95 - 0.1375 * 37 = 95 - 5.0875 = 89.9125
    expect(thi).toBeCloseTo(89.9, 0);
  });
});
