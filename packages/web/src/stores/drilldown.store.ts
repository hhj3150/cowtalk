// 드릴다운 스토어 — 4단계: 요약 → 농장 → 동물 → 상세

import { create } from 'zustand';

export type DrilldownLevel = 'summary' | 'farm' | 'animal' | 'detail';

export type DrilldownFilter =
  | 'health_risk'
  | 'estrus_candidate'
  | 'feeding_risk'
  | 'productivity_drop'
  | 'calving_soon'
  | 'pregnancy_recheck'
  | 'all';

interface DrilldownState {
  readonly isOpen: boolean;
  readonly level: DrilldownLevel;
  readonly filter: DrilldownFilter;
  readonly farmId: string | null;
  readonly animalId: string | null;
  readonly title: string;
  readonly history: readonly DrilldownSnapshot[];
}

export interface DrilldownSnapshot {
  readonly level: DrilldownLevel;
  readonly filter: DrilldownFilter;
  readonly farmId: string | null;
  readonly animalId: string | null;
  readonly title: string;
}

interface DrilldownActions {
  readonly open: (filter: DrilldownFilter, title: string) => void;
  readonly goToFarm: (farmId: string, title: string) => void;
  readonly goToAnimal: (animalId: string, title: string) => void;
  readonly goToDetail: (animalId: string, title: string) => void;
  readonly goBack: () => void;
  readonly close: () => void;
}

export const useDrilldownStore = create<DrilldownState & DrilldownActions>()(
  (set, get) => ({
    isOpen: false,
    level: 'summary',
    filter: 'all',
    farmId: null,
    animalId: null,
    title: '',
    history: [],

    open: (filter, title) =>
      set({
        isOpen: true,
        level: 'summary',
        filter,
        farmId: null,
        animalId: null,
        title,
        history: [],
      }),

    goToFarm: (farmId, title) => {
      const state = get();
      const snapshot: DrilldownSnapshot = {
        level: state.level,
        filter: state.filter,
        farmId: state.farmId,
        animalId: state.animalId,
        title: state.title,
      };
      set({
        level: 'farm',
        farmId,
        animalId: null,
        title,
        history: [...state.history, snapshot],
      });
    },

    goToAnimal: (animalId, title) => {
      const state = get();
      const snapshot: DrilldownSnapshot = {
        level: state.level,
        filter: state.filter,
        farmId: state.farmId,
        animalId: state.animalId,
        title: state.title,
      };
      set({
        level: 'animal',
        animalId,
        title,
        history: [...state.history, snapshot],
      });
    },

    goToDetail: (animalId, title) => {
      const state = get();
      const snapshot: DrilldownSnapshot = {
        level: state.level,
        filter: state.filter,
        farmId: state.farmId,
        animalId: state.animalId,
        title: state.title,
      };
      set({
        level: 'detail',
        animalId,
        title,
        history: [...state.history, snapshot],
      });
    },

    goBack: () => {
      const state = get();
      const prev = state.history[state.history.length - 1];
      if (!prev) {
        set({ isOpen: false, history: [] });
        return;
      }
      set({
        level: prev.level,
        filter: prev.filter,
        farmId: prev.farmId,
        animalId: prev.animalId,
        title: prev.title,
        history: state.history.slice(0, -1),
      });
    },

    close: () =>
      set({
        isOpen: false,
        level: 'summary',
        filter: 'all',
        farmId: null,
        animalId: null,
        title: '',
        history: [],
      }),
  }),
);
