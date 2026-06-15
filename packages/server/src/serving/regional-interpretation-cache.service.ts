// 지역 AI 해석 캐시 서비스 — GET /regional/:regionId 의 ~40초 동기 블로킹 제거
//
// 문제: regional.routes 가 `await analyzeRegion()` 으로 deep(Opus) 해석을 매 요청마다
//   끝까지(~40초) 동기 대기했고 캐시도 없어 재요청마다 재계산했다.
// 해결(animal 캐시와 동일 패턴): 캐시 히트면 즉시 반환(<1s), 미스면 'computing' +
//   백그라운드 계산. 프로필 해시가 바뀐 경우에만 재계산(불필요 재계산 0건). in-process 중복방지.
//
// NOTE: 사용자 코딩룰(반복 3회 미만이면 추상화 보류)에 따라 animal 서비스와의 공통 추출은
//   보류하고 의도적으로 병렬 구현(작동 중 animal 경로 비파괴). 3번째 대상 생기면 그때 일반화.

import { config } from '../config/index.js';
import { logger } from '../lib/logger.js';
import { buildRegionalProfile } from '../pipeline/profile-builder.js';
import { interpretRegion } from '../ai-brain/claude-interpreter.js';
import { hashProfile } from './interpretation-hash.js';
import {
  getCachedRegionalInterpretation,
  upsertCachedRegionalInterpretation,
} from '../db/repositories/regional-interpretation-cache.repo.js';
import type { RegionalInterpretation, Role } from '@cowtalk/shared';

export type InterpretationStatus = 'ready' | 'computing';

export interface RegionalInterpretationCacheResult {
  readonly status: InterpretationStatus;
  readonly interpretation: RegionalInterpretation | null;
}

function currentModel(): string {
  return config.ANTHROPIC_MODEL_DEEP;
}

const inFlight = new Set<string>();

function flightKey(regionId: string, role: Role): string {
  return `${regionId}:${role}`;
}

// 캐시 우선 조회 — 히트면 즉시 반환, 미스면 'computing'. 두 경우 모두 백그라운드 점검 트리거.
export async function getOrTriggerRegionalInterpretation(
  regionId: string,
  role: Role,
): Promise<RegionalInterpretationCacheResult> {
  const cached = await getCachedRegionalInterpretation(regionId, role, currentModel());

  void triggerRegionalRecompute(regionId, role);

  if (cached) {
    return { status: 'ready', interpretation: cached.result };
  }
  return { status: 'computing', interpretation: null };
}

// 백그라운드 재계산 진입점 — 중복방지 + 에러 격리. 절대 throw 하지 않는다.
export async function triggerRegionalRecompute(regionId: string, role: Role): Promise<void> {
  const key = flightKey(regionId, role);
  if (inFlight.has(key)) return;
  inFlight.add(key);
  try {
    await recomputeIfStale(regionId, role);
  } catch (err) {
    logger.error({ err, regionId, role }, '[RegionalInterpretationCache] 백그라운드 재계산 실패');
  } finally {
    inFlight.delete(key);
  }
}

// 프로필 해시가 캐시와 다를 때만 재계산. 같으면 즉시 반환(불필요 재계산 0건).
async function recomputeIfStale(regionId: string, role: Role): Promise<void> {
  const model = currentModel();

  const profile = await buildRegionalProfile(regionId);
  if (!profile) {
    logger.warn({ regionId }, '[RegionalInterpretationCache] 프로필 없음 — 재계산 생략');
    return;
  }

  const profileHash = hashProfile(profile);
  const cached = await getCachedRegionalInterpretation(regionId, role, model);
  if (cached && cached.profileHash === profileHash) {
    return;
  }

  const interpretation = await interpretRegion(profile, role);
  if (!interpretation) return;

  await upsertCachedRegionalInterpretation({ regionId, role, model, profileHash, result: interpretation });
  logger.info({ regionId, role, model }, '[RegionalInterpretationCache] 해석 갱신 완료');
}

// 테스트 격리용
export function __resetRegionalInFlightForTest(): void {
  inFlight.clear();
}
