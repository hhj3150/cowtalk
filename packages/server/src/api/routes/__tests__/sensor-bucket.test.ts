// Phase 5 발견 — 24h·48h 센서 이력에서 분 단위 버킷에 ':00:00Z' 를 붙여 잘못된 시각 → RangeError 500
import { describe, it, expect, vi } from 'vitest';

vi.mock('../../../config/database.js', () => ({ getDb: () => ({}) }));
const { sensorHistoryBucketKey, bucketKeyToIso } = await import('../sensor.routes.js');

describe('센서 이력 버킷', () => {
  it('24h 분 단위 버킷이 유효한 시각이 된다', () => {
    const key = sensorHistoryBucketKey('2026-10-20T03:47:12.000Z', '24h');
    expect(key).toBe('2026-10-20T03:47');
    expect(bucketKeyToIso(key)).toBe('2026-10-20T03:47:00.000Z');
  });
  it('7d 시 단위 버킷', () => {
    expect(bucketKeyToIso(sensorHistoryBucketKey('2026-10-20T03:47:12.000Z', '7d'))).toBe('2026-10-20T03:00:00.000Z');
  });
});
