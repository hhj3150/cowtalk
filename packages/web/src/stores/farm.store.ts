// 농장 스토어 — 선택된 농장, 그룹 농장 목록

import { create } from 'zustand';

export interface FarmSummary {
  readonly farmId: string;
  readonly name: string;
  readonly totalAnimals: number;
  readonly region: string;
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

export const useFarmStore = create<FarmState & FarmActions>()((set) => ({
  selectedFarmId: null,
  selectedFarmIds: [],
  farms: [],

  selectFarm: (farmId) => set({ selectedFarmId: farmId, selectedFarmIds: [] }),
  selectFarmGroup: (farmIds) => set({
    selectedFarmIds: farmIds,
    selectedFarmId: farmIds.length === 1 ? farmIds[0] ?? null : null,
  }),
  setFarms: (farms) => set({ farms }),
  clearSelection: () => set({ selectedFarmId: null, selectedFarmIds: [] }),
}));
