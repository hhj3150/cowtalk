// DrilldownOverlay 테스트 — 4단계 네비게이션

import { describe, it, expect, beforeEach } from 'vitest';
import { act } from '@testing-library/react';
import { useDrilldownStore } from '@web/stores/drilldown.store';

describe('드릴다운 4단계 네비게이션', () => {
  beforeEach(() => {
    // 스토어 초기화
    act(() => {
      useDrilldownStore.getState().close();
    });
  });

  it('초기 상태: 닫혀 있음', () => {
    const state = useDrilldownStore.getState();
    expect(state.isOpen).toBe(false);
    expect(state.level).toBe('summary');
    expect(state.history).toHaveLength(0);
  });

  it('open → summary 레벨', () => {
    act(() => {
      useDrilldownStore.getState().open('health_risk', '건강이상');
    });
    const state = useDrilldownStore.getState();
    expect(state.isOpen).toBe(true);
    expect(state.level).toBe('summary');
    expect(state.filter).toBe('health_risk');
    expect(state.title).toBe('건강이상');
  });

  it('summary → farm → animal → detail 순차 이동', () => {
    act(() => {
      useDrilldownStore.getState().open('all', '전체');
    });

    // summary → farm
    act(() => {
      useDrilldownStore.getState().goToFarm('farm-1', '농장A');
    });
    expect(useDrilldownStore.getState().level).toBe('farm');
    expect(useDrilldownStore.getState().farmId).toBe('farm-1');
    expect(useDrilldownStore.getState().history).toHaveLength(1);

    // farm → animal
    act(() => {
      useDrilldownStore.getState().goToAnimal('animal-1', '개체 001');
    });
    expect(useDrilldownStore.getState().level).toBe('animal');
    expect(useDrilldownStore.getState().animalId).toBe('animal-1');
    expect(useDrilldownStore.getState().history).toHaveLength(2);

    // animal → detail
    act(() => {
      useDrilldownStore.getState().goToDetail('animal-1', '001 상세');
    });
    expect(useDrilldownStore.getState().level).toBe('detail');
    expect(useDrilldownStore.getState().history).toHaveLength(3);
  });

  it('goBack: 히스토리 스택에서 이전 상태 복원', () => {
    act(() => {
      useDrilldownStore.getState().open('health_risk', '건강이상');
    });
    act(() => {
      useDrilldownStore.getState().goToFarm('farm-1', '농장A');
    });
    act(() => {
      useDrilldownStore.getState().goToAnimal('animal-1', '개체 001');
    });

    // animal → farm
    act(() => {
      useDrilldownStore.getState().goBack();
    });
    expect(useDrilldownStore.getState().level).toBe('farm');
    expect(useDrilldownStore.getState().farmId).toBe('farm-1');
    expect(useDrilldownStore.getState().history).toHaveLength(1);

    // farm → summary
    act(() => {
      useDrilldownStore.getState().goBack();
    });
    expect(useDrilldownStore.getState().level).toBe('summary');
    expect(useDrilldownStore.getState().history).toHaveLength(0);

    // summary에서 goBack → 닫힘
    act(() => {
      useDrilldownStore.getState().goBack();
    });
    expect(useDrilldownStore.getState().isOpen).toBe(false);
  });

  it('close: 모든 상태 초기화', () => {
    act(() => {
      useDrilldownStore.getState().open('estrus_candidate', '발정');
    });
    act(() => {
      useDrilldownStore.getState().goToFarm('farm-2', '농장B');
    });
    act(() => {
      useDrilldownStore.getState().close();
    });

    const state = useDrilldownStore.getState();
    expect(state.isOpen).toBe(false);
    expect(state.level).toBe('summary');
    expect(state.farmId).toBeNull();
    expect(state.animalId).toBeNull();
    expect(state.history).toHaveLength(0);
  });

  it('히스토리가 올바른 스냅샷을 보존', () => {
    act(() => {
      useDrilldownStore.getState().open('feeding_risk', '사료위험');
    });
    act(() => {
      useDrilldownStore.getState().goToFarm('farm-3', '농장C');
    });

    const history = useDrilldownStore.getState().history;
    expect(history[0]).toEqual({
      level: 'summary',
      filter: 'feeding_risk',
      farmId: null,
      animalId: null,
      title: '사료위험',
    });
  });
});
