// 커넥터 + 파이프라인 유닛 테스트

import { describe, it, expect, vi } from 'vitest';
import { withRetry } from '@server/pipeline/connectors/base.connector';
import { resolveBreedType, BREED_CONFIGS, getMetricsForBreed, COMMON_METRICS } from '@shared/constants/breed-config';
import { calculateTHI } from '@server/pipeline/connectors/public-data/weather.connector';

describe('withRetry', () => {
  it('성공 시 바로 반환', async () => {
    const fn = vi.fn().mockResolvedValue('ok');
    const result = await withRetry(fn, { retries: 3, delayMs: 10, label: 'test' });
    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('1회 실패 후 재시도 성공', async () => {
    const fn = vi.fn()
      .mockRejectedValueOnce(new Error('fail'))
      .mockResolvedValueOnce('ok');
    const result = await withRetry(fn, { retries: 3, delayMs: 10, label: 'test' });
    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('모든 재시도 실패 → 에러', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('always fail'));
    await expect(
      withRetry(fn, { retries: 3, delayMs: 10, label: 'test' }),
    ).rejects.toThrow('always fail');
    expect(fn).toHaveBeenCalledTimes(3);
  });
});

describe('breed config', () => {
  it('resolveBreedType — holstein → dairy', () => {
    expect(resolveBreedType('holstein')).toBe('dairy');
  });

  it('resolveBreedType — hanwoo → beef', () => {
    expect(resolveBreedType('hanwoo')).toBe('beef');
  });

  it('resolveBreedType — jersey → dairy', () => {
    expect(resolveBreedType('jersey')).toBe('dairy');
  });

  it('BREED_CONFIGS에 dairy/beef 존재', () => {
    expect(BREED_CONFIGS.dairy).toBeDefined();
    expect(BREED_CONFIGS.beef).toBeDefined();
    expect(BREED_CONFIGS.dairy.labelKo).toBe('젖소');
    expect(BREED_CONFIGS.beef.labelKo).toBe('한우/비육우');
  });

  it('getMetricsForBreed — dairy', () => {
    const metrics = getMetricsForBreed('dairy');
    expect(metrics).toContain('temperature');
    expect(metrics).toContain('milk_yield');
  });

  it('getMetricsForBreed — beef', () => {
    const metrics = getMetricsForBreed('beef');
    expect(metrics).toContain('temperature');
    expect(metrics).toContain('weight');
    expect(metrics).not.toContain('milk_yield');
  });

  it('COMMON_METRICS 공통 메트릭 포함', () => {
    expect(COMMON_METRICS).toContain('temperature');
    expect(COMMON_METRICS).toContain('rumination');
    expect(COMMON_METRICS).toContain('activity');
  });
});

describe('THI calculation', () => {
  it('일반 조건 THI 계산', () => {
    // 30°C, 70% → 약 80.5
    const thi = calculateTHI(30, 70);
    expect(thi).toBeGreaterThan(78);
    expect(thi).toBeLessThan(83);
  });

  it('저온 조건 THI', () => {
    const thi = calculateTHI(10, 50);
    expect(thi).toBeLessThan(60);
  });

  it('고온다습 THI (열스트레스)', () => {
    const thi = calculateTHI(35, 90);
    expect(thi).toBeGreaterThan(85);
  });
});
