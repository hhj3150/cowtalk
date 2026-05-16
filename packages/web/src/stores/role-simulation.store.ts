// 역할 시뮬레이션 store — master 계정이 다른 역할 화면을 미리보기 (FLOW-02 Step2.5)
//
// ⚠️ persist 미사용 (의도적): 시뮬레이션은 세션 휘발성.
//    새로고침 시 simulatedRole=null 로 초기화되어 본 계정(master) 뷰로 복귀한다.
//    user.role(실제 계정 역할)은 절대 변경하지 않는다 — 시뮬레이션은 별도 신호.

import { create } from 'zustand';
import type { Role } from '@cowtalk/shared';

/** null = 시뮬레이션 안 함 (본 계정 user.role 사용). */
export type SimulatedRole = Role | null;

interface RoleSimulationState {
  readonly simulatedRole: SimulatedRole;
  readonly setSimulatedRole: (role: SimulatedRole) => void;
  readonly clearSimulation: () => void;
}

export const useRoleSimulationStore = create<RoleSimulationState>((set) => ({
  simulatedRole: null,
  setSimulatedRole: (role) => set({ simulatedRole: role }),
  clearSimulation: () => set({ simulatedRole: null }),
}));
