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
  readonly farms: readonly FarmSummary[];
}

interface FarmActions {
  readonly selectFarm: (farmId: string | null) => void;
  readonly setFarms: (farms: readonly FarmSummary[]) => void;
  readonly clearSelection: () => void;
}

export const useFarmStore = create<FarmState & FarmActions>()((set) => ({
  selectedFarmId: null,
  farms: [],

  selectFarm: (farmId) => set({ selectedFarmId: farmId }),
  setFarms: (farms) => set({ farms }),
  clearSelection: () => set({ selectedFarmId: null }),
}));
