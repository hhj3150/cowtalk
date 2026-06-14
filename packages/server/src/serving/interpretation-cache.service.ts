// AI 해석 캐시 서비스 — deep(Opus) 해석의 throwaway 재계산 제거
//
// 문제: 기존 GET /interpretation 은 매 요청마다 ~40초 Claude 호출을 8초 Promise.race 로
//   감싸 항상 타임아웃 null 을 반환하면서도, 패자(Claude 호출)는 끝까지 실행돼 버려졌다.
//
// 해결:
//   1) 해석 결과를 DB(animal_interpretations)에 (animalId, role, model) 키로 영속화.
//   2) GET 은 캐시를 즉시 반환(<1s)하고, 백그라운드로 freshness 만 점검.
//   3) 백그라운드 점검은 프로필 해시가 바뀌었을 때만 재계산 → 변경 없으면 Claude 호출 0건.
//   4) in-process 중복방지(inFlight)로 동시 요청이 같은 개체를 중복 계산하지 않음.

import { config } from '../config/index.js';
import { logger } from '../lib/logger.js';
import { buildAnimalProfile } from '../pipeline/profile-builder.js';
import { analyzeAnimalProfile } from '../ai-brain/index.js';
import { hashAnimalProfile } from './interpretation-hash.js';
import {
  getCachedInterpretation,
  upsertCachedInterpretation,
} from '../db/repositories/interpretation-cache.repo.js';
import type { AnimalInterpretation, Role } from '@cowtalk/shared';

export type InterpretationStatus = 'ready' | 'computing';

export interface InterpretationCacheResult {
  readonly status: InterpretationStatus;
  readonly interpretation: AnimalInterpretation | null;
}

// 현재 개체 해석에 쓰이는 모델(deep) — 모델이 바뀌면 캐시 미스 → 재계산.
function currentModel(): string {
  return config.ANTHROPIC_MODEL_DEEP;
}

// 같은 (animalId, role) 백그라운드 작업이 동시에 여럿 뜨지 않도록 중복방지.
const inFlight = new Set<string>();

function flightKey(animalId: string, role: Role): string {
  return `${animalId}:${role}`;
}

// 캐시 우선 조회 — 히트면 즉시 반환, 미스면 'computing'. 두 경우 모두 백그라운드 점검을 트리거.
export async function getOrTriggerInterpretation(
  animalId: string,
  role: Role,
): Promise<InterpretationCacheResult> {
  const cached = await getCachedInterpretation(animalId, role, currentModel());

  // 결과 유무와 무관하게 백그라운드 freshness 점검 (fire-and-forget, 중복방지 내장)
  void triggerRecompute(animalId, role);

  if (cached) {
    return { status: 'ready', interpretation: cached.result };
  }
  return { status: 'computing', interpretation: null };
}

// 백그라운드 재계산 진입점 — 중복방지 + 에러 격리. 절대 throw 하지 않는다.
export async function triggerRecompute(animalId: string, role: Role): Promise<void> {
  const key = flightKey(animalId, role);
  if (inFlight.has(key)) return; // 이미 진행 중 → 중복 호출 무시
  inFlight.add(key);
  try {
    await recomputeIfStale(animalId, role);
  } catch (err) {
    logger.error({ err, animalId, role }, '[InterpretationCache] 백그라운드 재계산 실패');
  } finally {
    inFlight.delete(key);
  }
}

// 프로필 해시가 캐시와 다를 때만 Claude 재계산. 같으면 즉시 반환(throwaway 0건).
async function recomputeIfStale(animalId: string, role: Role): Promise<void> {
  const model = currentModel();

  const profile = await buildAnimalProfile(animalId);
  if (!profile) {
    logger.warn({ animalId }, '[InterpretationCache] 프로필 없음 — 재계산 생략');
    return;
  }

  const profileHash = hashAnimalProfile(profile);
  const cached = await getCachedInterpretation(animalId, role, model);
  if (cached && cached.profileHash === profileHash) {
    return; // 프로필 변경 없음 → 재계산 불필요
  }

  const interpretation = await analyzeAnimalProfile(profile, role);
  if (!interpretation) return;

  await upsertCachedInterpretation({ animalId, role, model, profileHash, result: interpretation });
  logger.info({ animalId, role, model }, '[InterpretationCache] 해석 갱신 완료');
}

// 테스트 격리용 — 모듈 레벨 inFlight 초기화
export function __resetInFlightForTest(): void {
  inFlight.clear();
}
