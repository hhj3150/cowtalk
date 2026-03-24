// 드릴다운 훅 — 개체 클릭 시 /cow/:id로 직접 이동

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

  /** 개체 상세 → /cow/:id 페이지로 직접 이동 (드릴다운 모달 닫기) */
  const navigateToDetail = useCallback(
    (animalId: string, _earTag: string) => {
      store.close();
      window.location.href = `/cow/${animalId}`;
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
