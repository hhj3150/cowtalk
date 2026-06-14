// 해석 캐시 서비스 테스트 — 캐시 히트/미스, throwaway 제거(프로필 해시 변경 시에만 재계산), 중복방지

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { AnimalProfile, AnimalInterpretation } from '@cowtalk/shared';

// --- 의존성 목 ---
vi.mock('../../pipeline/profile-builder.js', () => ({
  buildAnimalProfile: vi.fn(),
}));
vi.mock('../../ai-brain/index.js', () => ({
  analyzeAnimalProfile: vi.fn(),
}));
vi.mock('../../db/repositories/interpretation-cache.repo.js', () => ({
  getCachedInterpretation: vi.fn(),
  upsertCachedInterpretation: vi.fn(),
}));
vi.mock('../../config/index.js', () => ({
  config: { ANTHROPIC_MODEL_DEEP: 'claude-opus-4-8' },
}));
vi.mock('../../lib/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { buildAnimalProfile } from '../../pipeline/profile-builder.js';
import { analyzeAnimalProfile } from '../../ai-brain/index.js';
import {
  getCachedInterpretation,
  upsertCachedInterpretation,
} from '../../db/repositories/interpretation-cache.repo.js';
import { hashAnimalProfile } from '../interpretation-hash.js';
import {
  getOrTriggerInterpretation,
  triggerRecompute,
  __resetInFlightForTest,
} from '../interpretation-cache.service.js';

const profile = {
  animalId: 'a1',
  earTag: '001',
  farmId: 'f1',
  latestSensor: { temperature: 38.5 },
  activeEvents: [],
} as unknown as AnimalProfile;

const interp = { animalId: 'a1', summary: 'ok' } as unknown as AnimalInterpretation;

// 플러시: fire-and-forget 백그라운드 작업이 완료될 시간을 준다
const flush = (): Promise<void> => new Promise((r) => setImmediate(r));

beforeEach(() => {
  vi.clearAllMocks();
  __resetInFlightForTest();
  vi.mocked(buildAnimalProfile).mockResolvedValue(profile);
  vi.mocked(analyzeAnimalProfile).mockResolvedValue(interp);
  vi.mocked(upsertCachedInterpretation).mockResolvedValue();
});

describe('getOrTriggerInterpretation', () => {
  it('캐시 히트 → status=ready, 저장된 해석 즉시 반환', async () => {
    const hash = hashAnimalProfile(profile);
    vi.mocked(getCachedInterpretation).mockResolvedValue({
      animalId: 'a1', role: 'farmer', model: 'claude-opus-4-8',
      profileHash: hash, result: interp, updatedAt: new Date(),
    });

    const res = await getOrTriggerInterpretation('a1', 'farmer');
    expect(res.status).toBe('ready');
    expect(res.interpretation).toEqual(interp);
  });

  it('캐시 미스 → status=computing, interpretation=null', async () => {
    vi.mocked(getCachedInterpretation).mockResolvedValue(null);
    const res = await getOrTriggerInterpretation('a1', 'farmer');
    expect(res.status).toBe('computing');
    expect(res.interpretation).toBeNull();
  });
});

describe('triggerRecompute — throwaway 제거', () => {
  it('프로필 해시가 캐시와 같으면 Claude 재계산을 하지 않는다 (throwaway 0건)', async () => {
    const hash = hashAnimalProfile(profile);
    vi.mocked(getCachedInterpretation).mockResolvedValue({
      animalId: 'a1', role: 'farmer', model: 'claude-opus-4-8',
      profileHash: hash, result: interp, updatedAt: new Date(),
    });

    await triggerRecompute('a1', 'farmer');

    expect(analyzeAnimalProfile).not.toHaveBeenCalled();
    expect(upsertCachedInterpretation).not.toHaveBeenCalled();
  });

  it('프로필 해시가 다르면(stale) 재계산하고 캐시에 upsert 한다', async () => {
    vi.mocked(getCachedInterpretation).mockResolvedValue({
      animalId: 'a1', role: 'farmer', model: 'claude-opus-4-8',
      profileHash: 'STALE_DIFFERENT_HASH', result: interp, updatedAt: new Date(),
    });

    await triggerRecompute('a1', 'farmer');

    expect(analyzeAnimalProfile).toHaveBeenCalledTimes(1);
    expect(upsertCachedInterpretation).toHaveBeenCalledTimes(1);
    expect(vi.mocked(upsertCachedInterpretation).mock.calls[0]?.[0]).toMatchObject({
      animalId: 'a1', role: 'farmer', model: 'claude-opus-4-8',
      profileHash: hashAnimalProfile(profile), result: interp,
    });
  });

  it('캐시가 없으면(최초) 재계산하고 upsert 한다', async () => {
    vi.mocked(getCachedInterpretation).mockResolvedValue(null);
    await triggerRecompute('a1', 'farmer');
    expect(analyzeAnimalProfile).toHaveBeenCalledTimes(1);
    expect(upsertCachedInterpretation).toHaveBeenCalledTimes(1);
  });

  it('동시 호출은 중복방지로 한 번만 재계산한다', async () => {
    vi.mocked(getCachedInterpretation).mockResolvedValue(null);
    // analyze 를 지연시켜 두 호출이 겹치게 함
    let resolveFn: (v: AnimalInterpretation) => void = () => {};
    vi.mocked(analyzeAnimalProfile).mockReturnValue(
      new Promise<AnimalInterpretation>((r) => { resolveFn = r; }),
    );

    const p1 = triggerRecompute('a1', 'farmer');
    const p2 = triggerRecompute('a1', 'farmer'); // inFlight → 즉시 무시
    resolveFn(interp);
    await Promise.all([p1, p2]);

    expect(analyzeAnimalProfile).toHaveBeenCalledTimes(1);
  });

  it('프로필이 없으면 재계산하지 않는다', async () => {
    vi.mocked(buildAnimalProfile).mockResolvedValue(null);
    await triggerRecompute('a1', 'farmer');
    expect(analyzeAnimalProfile).not.toHaveBeenCalled();
  });

  it('내부 에러를 삼키고 throw 하지 않는다 (요청 격리)', async () => {
    vi.mocked(getCachedInterpretation).mockRejectedValue(new Error('db down'));
    await expect(triggerRecompute('a1', 'farmer')).resolves.toBeUndefined();
  });
});

describe('getOrTriggerInterpretation — 백그라운드 트리거', () => {
  it('히트 시에도 백그라운드 freshness 점검을 트리거한다', async () => {
    const hash = hashAnimalProfile(profile);
    vi.mocked(getCachedInterpretation).mockResolvedValue({
      animalId: 'a1', role: 'farmer', model: 'claude-opus-4-8',
      profileHash: hash, result: interp, updatedAt: new Date(),
    });

    await getOrTriggerInterpretation('a1', 'farmer');
    await flush();

    // freshness 점검을 위해 프로필을 빌드함 (해시 같으므로 재계산은 없음)
    expect(buildAnimalProfile).toHaveBeenCalledWith('a1');
    expect(analyzeAnimalProfile).not.toHaveBeenCalled();
  });
});
