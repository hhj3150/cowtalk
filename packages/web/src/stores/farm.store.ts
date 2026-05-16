// 농장 스토어 — 선택된 농장, 그룹 농장 목록
//
// FLOW-01: 페르소나 시뮬레이션 시 농장 컨텍스트 자동 선택.
// - role-simulation.store 를 단방향 구독 (역방향 import 없음 → 순환 import 없음).
// - 페르소나 전환(role-change) + 농장 목록 로드(farms-loaded) 두 시점 모두 처리.

import { create } from 'zustand';
import { useRoleSimulationStore } from './role-simulation.store';
import { resolvePersonaFarmSelection } from './persona-farm';

export interface FarmSummary {
  readonly farmId: string;
  readonly name: string;
}

interface FarmState {
  readonly selectedFarmId: string | null;
  readonly selectedFarmIds: readonly string[]; // 다중 선택 (그룹)
  readonly farms: readonly FarmSummary[];
}

interface FarmActions {
  readonly selectFarm: (farmId: string | null) => void;
  readonly selectFarmGroup: (farmIds: readonly string[]) => void;
  readonly setFarms: (farms: readonly FarmSummary[]) => void;
  readonly clearSelection: () => void;
}

export const useFarmStore = create<FarmState & FarmActions>()((set, get) => ({
  selectedFarmId: null,
  selectedFarmIds: [],
  farms: [],

  selectFarm: (farmId) => set({ selectedFarmId: farmId, selectedFarmIds: [] }),
  selectFarmGroup: (farmIds) => set({
    selectedFarmIds: farmIds,
    selectedFarmId: farmIds.length === 1 ? farmIds[0] ?? null : null,
  }),
  setFarms: (farms) => {
    set({ farms });
    // FLOW-01: 농장 목록이 로드된 시점에 시뮬레이션 페르소나(농장주/수의사)면
    // selectedFarmId 가 비어 있을 때 첫 농장을 자동 선택한다.
    const simRole = useRoleSimulationStore.getState().simulatedRole;
    const action = resolvePersonaFarmSelection(simRole, farms, get().selectedFarmId, 'farms-loaded');
    if (action.kind === 'select') {
      set({ selectedFarmId: action.farmId, selectedFarmIds: [] });
    }
  },
  clearSelection: () => set({ selectedFarmId: null, selectedFarmIds: [] }),
}));

// FLOW-01: 페르소나(시뮬레이션 역할) 전환 시 농장 컨텍스트 자동 선택.
// role-simulation.store 단방향 구독 — setSimulatedRole/clearSimulation 호출 시 반응.
useRoleSimulationStore.subscribe((state, prev) => {
  if (state.simulatedRole === prev.simulatedRole) return;
  const farm = useFarmStore.getState();
  const action = resolvePersonaFarmSelection(
    state.simulatedRole,
    farm.farms,
    farm.selectedFarmId,
    'role-change',
  );
  if (action.kind === 'select') {
    farm.selectFarm(action.farmId);
  } else if (action.kind === 'clear') {
    farm.clearSelection();
  }
  // 'keep' (farmer/vet 인데 농장 목록 미로드) → farms-loaded 시 setFarms 가 처리.
});
