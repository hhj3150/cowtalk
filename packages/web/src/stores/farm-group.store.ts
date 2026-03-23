// 농장 그룹 스토어 — 다중 농장 선택 + 그룹 저장
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface FarmGroup {
  readonly id: string;
  readonly name: string;
  readonly farmIds: readonly string[];
  readonly createdAt: string;
}

interface FarmGroupState {
  readonly savedGroups: readonly FarmGroup[];
  readonly activeGroupId: string | null; // null = 전체 농장
  readonly customSelection: readonly string[]; // 임시 선택 (저장 안 한 상태)
}

interface FarmGroupActions {
  readonly setCustomSelection: (farmIds: readonly string[]) => void;
  readonly toggleFarm: (farmId: string) => void;
  readonly selectAll: (farmIds: readonly string[]) => void;
  readonly clearSelection: () => void;
  readonly saveGroup: (name: string) => void;
  readonly deleteGroup: (groupId: string) => void;
  readonly activateGroup: (groupId: string | null) => void;
  readonly getActiveFarmIds: () => readonly string[];
}

export const useFarmGroupStore = create<FarmGroupState & FarmGroupActions>()(
  persist(
    (set, get) => ({
      savedGroups: [],
      activeGroupId: null,
      customSelection: [],

      setCustomSelection: (farmIds) => set({ customSelection: farmIds, activeGroupId: null }),

      toggleFarm: (farmId) => {
        const current = get().customSelection;
        const next = current.includes(farmId)
          ? current.filter((id) => id !== farmId)
          : [...current, farmId];
        set({ customSelection: next, activeGroupId: null });
      },

      selectAll: (farmIds) => set({ customSelection: farmIds, activeGroupId: null }),

      clearSelection: () => set({ customSelection: [], activeGroupId: null }),

      saveGroup: (name) => {
        const { customSelection, savedGroups } = get();
        if (customSelection.length === 0) return;
        const newGroup: FarmGroup = {
          id: `grp-${Date.now()}`,
          name,
          farmIds: customSelection,
          createdAt: new Date().toISOString(),
        };
        set({ savedGroups: [...savedGroups, newGroup], activeGroupId: newGroup.id });
      },

      deleteGroup: (groupId) => {
        const { savedGroups, activeGroupId } = get();
        set({
          savedGroups: savedGroups.filter((g) => g.id !== groupId),
          activeGroupId: activeGroupId === groupId ? null : activeGroupId,
        });
      },

      activateGroup: (groupId) => {
        if (!groupId) {
          set({ activeGroupId: null, customSelection: [] });
          return;
        }
        const group = get().savedGroups.find((g) => g.id === groupId);
        if (group) {
          set({ activeGroupId: groupId, customSelection: [...group.farmIds] });
        }
      },

      getActiveFarmIds: () => {
        const { activeGroupId, savedGroups, customSelection } = get();
        if (activeGroupId) {
          const group = savedGroups.find((g) => g.id === activeGroupId);
          return group?.farmIds ?? [];
        }
        return customSelection;
      },
    }),
    {
      name: 'cowtalk-farm-groups',
      partialize: (state) => ({
        savedGroups: state.savedGroups,
        activeGroupId: state.activeGroupId,
        customSelection: state.customSelection,
      }),
    },
  ),
);
