// 지역 해석 캐시 서비스 테스트 — 히트/미스, 불필요 재계산 제거(해시 변경 시에만), 중복방지

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { RegionalProfile, RegionalInterpretation } from '@cowtalk/shared';

vi.mock('../../pipeline/profile-builder.js', () => ({
  buildRegionalProfile: vi.fn(),
}));
vi.mock('../../ai-brain/claude-interpreter.js', () => ({
  interpretRegion: vi.fn(),
}));
vi.mock('../../db/repositories/regional-interpretation-cache.repo.js', () => ({
  getCachedRegionalInterpretation: vi.fn(),
  upsertCachedRegionalInterpretation: vi.fn(),
}));
vi.mock('../../config/index.js', () => ({
  config: { ANTHROPIC_MODEL_DEEP: 'claude-opus-4-8' },
}));
vi.mock('../../lib/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { buildRegionalProfile } from '../../pipeline/profile-builder.js';
import { interpretRegion } from '../../ai-brain/claude-interpreter.js';
import {
  getCachedRegionalInterpretation,
  upsertCachedRegionalInterpretation,
} from '../../db/repositories/regional-interpretation-cache.repo.js';
import { hashProfile } from '../interpretation-hash.js';
import {
  getOrTriggerRegionalInterpretation,
  triggerRegionalRecompute,
  __resetRegionalInFlightForTest,
} from '../regional-interpretation-cache.service.js';

const profile = { regionId: 'r1', tenantId: null, farms: [], summary: 's' } as unknown as RegionalProfile;
const interp = { regionId: 'r1', summary: 'ok' } as unknown as RegionalInterpretation;

beforeEach(() => {
  vi.clearAllMocks();
  __resetRegionalInFlightForTest();
  vi.mocked(buildRegionalProfile).mockResolvedValue(profile);
  vi.mocked(interpretRegion).mockResolvedValue(interp);
  vi.mocked(upsertCachedRegionalInterpretation).mockResolvedValue();
});

describe('getOrTriggerRegionalInterpretation', () => {
  it('캐시 히트 → ready + 저장된 해석', async () => {
    vi.mocked(getCachedRegionalInterpretation).mockResolvedValue({
      regionId: 'r1', role: 'government_admin', model: 'claude-opus-4-8',
      profileHash: hashProfile(profile), result: interp, updatedAt: new Date(),
    });
    const res = await getOrTriggerRegionalInterpretation('r1', 'government_admin');
    expect(res.status).toBe('ready');
    expect(res.interpretation).toEqual(interp);
  });

  it('캐시 미스 → computing + null', async () => {
    vi.mocked(getCachedRegionalInterpretation).mockResolvedValue(null);
    const res = await getOrTriggerRegionalInterpretation('r1', 'government_admin');
    expect(res.status).toBe('computing');
    expect(res.interpretation).toBeNull();
  });
});

describe('triggerRegionalRecompute — 불필요 재계산 제거', () => {
  it('해시가 같으면 재계산하지 않는다', async () => {
    vi.mocked(getCachedRegionalInterpretation).mockResolvedValue({
      regionId: 'r1', role: 'government_admin', model: 'claude-opus-4-8',
      profileHash: hashProfile(profile), result: interp, updatedAt: new Date(),
    });
    await triggerRegionalRecompute('r1', 'government_admin');
    expect(interpretRegion).not.toHaveBeenCalled();
    expect(upsertCachedRegionalInterpretation).not.toHaveBeenCalled();
  });

  it('해시가 다르면(stale) 재계산하고 upsert', async () => {
    vi.mocked(getCachedRegionalInterpretation).mockResolvedValue({
      regionId: 'r1', role: 'government_admin', model: 'claude-opus-4-8',
      profileHash: 'STALE', result: interp, updatedAt: new Date(),
    });
    await triggerRegionalRecompute('r1', 'government_admin');
    expect(interpretRegion).toHaveBeenCalledTimes(1);
    expect(upsertCachedRegionalInterpretation).toHaveBeenCalledTimes(1);
  });

  it('캐시 없으면 재계산 + upsert', async () => {
    vi.mocked(getCachedRegionalInterpretation).mockResolvedValue(null);
    await triggerRegionalRecompute('r1', 'government_admin');
    expect(interpretRegion).toHaveBeenCalledTimes(1);
    expect(upsertCachedRegionalInterpretation).toHaveBeenCalledTimes(1);
  });

  it('동시 호출은 중복방지로 한 번만', async () => {
    vi.mocked(getCachedRegionalInterpretation).mockResolvedValue(null);
    let resolveFn: (v: RegionalInterpretation) => void = () => {};
    vi.mocked(interpretRegion).mockReturnValue(
      new Promise<RegionalInterpretation>((r) => { resolveFn = r; }),
    );
    const p1 = triggerRegionalRecompute('r1', 'government_admin');
    const p2 = triggerRegionalRecompute('r1', 'government_admin');
    resolveFn(interp);
    await Promise.all([p1, p2]);
    expect(interpretRegion).toHaveBeenCalledTimes(1);
  });

  it('프로필 없으면 재계산 안 함', async () => {
    vi.mocked(buildRegionalProfile).mockResolvedValue(null);
    await triggerRegionalRecompute('r1', 'government_admin');
    expect(interpretRegion).not.toHaveBeenCalled();
  });

  it('내부 에러를 삼키고 throw 안 함', async () => {
    vi.mocked(getCachedRegionalInterpretation).mockRejectedValue(new Error('db down'));
    await expect(triggerRegionalRecompute('r1', 'government_admin')).resolves.toBeUndefined();
  });
});
