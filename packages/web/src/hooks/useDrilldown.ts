// 드릴다운 훅 — 4단계 네비게이션 편의

import { useCallback } from 'react';
import { useDrilldownStore, type DrilldownFilter } from '@web/stores/drilldown.store';

export function useDrilldown() {
  const store = useDrilldownStore();

  const openDrilldown = useCallback(
    (filter: DrilldownFilter, title: string) => {
      store.open(filter, title);
    },
    [store],
  );

  const navigateToFarm = useCallback(
    (farmId: string, farmName: string) => {
      store.goToFarm(farmId, farmName);
    },
    [store],
  );

  const navigateToAnimal = useCallback(
    (animalId: string, earTag: string) => {
      store.goToAnimal(animalId, `개체 ${earTag}`);
    },
    [store],
  );

  const navigateToDetail = useCallback(
    (animalId: string, earTag: string) => {
      store.goToDetail(animalId, `${earTag} 상세`);
    },
    [store],
  );

  return {
    ...store,
    openDrilldown,
    navigateToFarm,
    navigateToAnimal,
    navigateToDetail,
  };
}
