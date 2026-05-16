// 페르소나 시뮬레이션 → 농장 컨텍스트 자동 선택 결정 (FLOW-01)
//
// master 가 농장주/수의사로 시뮬레이션하면 단일 농장 사용감을 재현해야 하므로
// 농장 select 를 첫 농장으로 자동 선택한다. 방역관/행정관/master 본질은 전체(광역).
//
// 순수 함수 — store 런타임 의존 없음 (테스트 용이, 순환 import 없음).

import type { SimulatedRole } from './role-simulation.store';

export type FarmSelectionAction =
  | { readonly kind: 'select'; readonly farmId: string }
  | { readonly kind: 'clear' }
  | { readonly kind: 'keep' };

/**
 * 시뮬레이션 역할 + 농장 목록 → 농장 선택 동작.
 *
 * - farmer / veterinarian: 단일 농장 컨텍스트 → 첫 농장.
 *   · trigger='role-change': 항상 첫 농장 (farms 비면 keep — farms-loaded 가 후속 처리)
 *   · trigger='farms-loaded': selectedFarmId 가 null 일 때만 첫 농장 (사용자 선택 보존)
 * - quarantine_officer / government_admin / null: 광역(전체 농장) → clear.
 *
 * 첫 농장 순서는 호출처가 넘기는 farms 배열 순서 = dashboard select 표시 순서.
 */
export function resolvePersonaFarmSelection(
  role: SimulatedRole,
  farms: readonly { readonly farmId: string }[],
  selectedFarmId: string | null,
  trigger: 'role-change' | 'farms-loaded',
): FarmSelectionAction {
  if (role === 'farmer' || role === 'veterinarian') {
    const first = farms[0];
    if (!first) return { kind: 'keep' };
    if (trigger === 'role-change') return { kind: 'select', farmId: first.farmId };
    return selectedFarmId === null ? { kind: 'select', farmId: first.farmId } : { kind: 'keep' };
  }
  // quarantine_officer | government_admin | null → 전체(광역) 모드
  return { kind: 'clear' };
}
