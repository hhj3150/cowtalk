// FP 자동 라벨링(DATA-05-B) 순수 함수 테스트

import { describe, it, expect, vi } from 'vitest';

vi.mock('../../config/database.js', () => ({ getDb: vi.fn() }));
vi.mock('../../lib/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock('../outcome-recorder.js', () => ({ recordOutcome: vi.fn() }));

import { fpSignature } from '../auto-labeler.service.js';

describe('fpSignature', () => {
  it('confirmed 경로와 동일한 시그니처 패턴 — animalId:type:YYYY-MM-DD', () => {
    expect(fpSignature('an-1', 'ketosis_risk', new Date('2026-07-01T09:30:00Z')))
      .toBe('an-1:ketosis_risk:2026-07-01');
  });

  it('시각이 달라도 같은 날짜면 같은 시그니처 — 하루 1라벨 멱등의 기반', () => {
    expect(fpSignature('an-1', 'estrus', new Date('2026-07-01T00:10:00Z')))
      .toBe(fpSignature('an-1', 'estrus', new Date('2026-07-01T23:50:00Z')));
  });
});
