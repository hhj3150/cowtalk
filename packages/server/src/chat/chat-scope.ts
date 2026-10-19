// 채팅 요청 스코프 정화 — 클라이언트가 보낸 farmId/farmIds/animalId를 권한과 대조한다
//
// 왜 필요한가:
//   도구 게이트웨이(tool-scope.ts)는 AI가 부르는 도구를 막는다. 그런데 채팅은 도구를 부르기 전에
//   맥락을 먼저 만든다 — resolveContext(개체·농장 프로필), 농장 펄스, 학습 스냅샷, 보고서 데이터.
//   이 단계가 body.farmId/animalId를 그대로 쓰면 남의 목장 데이터가 프롬프트에 실린다.
//   그래서 입구(채팅 라우트)에서 한 번 정화하고, 이후 단계는 정화된 값만 본다.
//
// 규칙 (rbac.scopedFarmIds와 같은 근거 — JWT 배정 목장):
//   - scope === null (마스터·미배정 관리역할) → 요청 그대로
//   - farmId: 범위 안이면 유지. 아니면, 배정 목장이 정확히 하나일 때 그 목장으로, 아니면 null
//   - farmIds: 범위 안의 것만. 남는 게 없으면 undefined
//   - animalId: 실제 소속 목장이 범위 안일 때만 유지

import { NO_FARM_SENTINEL } from '../api/middleware/rbac.js';

export interface ChatScopeInput {
  readonly farmId: string | null;
  readonly farmIds?: readonly string[];
  readonly animalId: string | null;
}

export interface ChatScopeResult {
  readonly farmId: string | null;
  readonly farmIds?: readonly string[];
  readonly animalId: string | null;
  /** 정화로 무언가 버려졌는지 — 감사 로그용 */
  readonly narrowed: boolean;
}

export type AnimalFarmResolver = (animalId: string) => Promise<string | null>;

/** 배정 목장 중 실제 목장(센티널 제외) */
function realFarms(scope: readonly string[]): readonly string[] {
  return scope.filter((f) => f !== NO_FARM_SENTINEL);
}

export async function sanitizeChatScope(
  input: ChatScopeInput,
  scope: readonly string[] | null,
  resolveAnimalFarm: AnimalFarmResolver,
): Promise<ChatScopeResult> {
  if (scope === null) {
    return { ...input, narrowed: false };
  }

  const allowed = realFarms(scope);
  let narrowed = false;

  let farmId: string | null = null;
  if (input.farmId && allowed.includes(input.farmId)) {
    farmId = input.farmId;
  } else {
    if (input.farmId) narrowed = true;
    farmId = allowed.length === 1 ? allowed[0]! : null;
  }

  let farmIds: readonly string[] | undefined;
  if (input.farmIds && input.farmIds.length > 0) {
    const kept = input.farmIds.filter((f) => allowed.includes(f));
    if (kept.length !== input.farmIds.length) narrowed = true;
    farmIds = kept.length > 0 ? kept : undefined;
  }

  let animalId: string | null = null;
  if (input.animalId) {
    const owner = await resolveAnimalFarm(input.animalId);
    if (owner && allowed.includes(owner)) {
      animalId = input.animalId;
    } else {
      narrowed = true;
    }
  }

  return { farmId, farmIds, animalId, narrowed };
}
