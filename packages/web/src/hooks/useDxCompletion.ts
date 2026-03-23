// DX 워크플로우 — 할일/알람 완료 상태 관리 (localStorage 기반, 날짜별 리셋)

import { useState, useCallback, useMemo } from 'react';

// ── 타입 ──

interface DxCompletionState {
  readonly date: string;
  readonly completedTodos: Record<string, number>; // key → completedAt timestamp
  readonly acknowledgedAlarms: Record<string, number>; // eventId → acknowledgedAt timestamp
}

interface UseDxCompletionReturn {
  readonly completedTodos: ReadonlyMap<string, number>;
  readonly acknowledgedAlarms: ReadonlyMap<string, number>;
  readonly toggleTodo: (todoKey: string) => void;
  readonly acknowledgeAlarm: (eventId: string) => void;
  readonly todoCompletionCount: number;
  readonly alarmAckCount: number;
}

// ── 유틸 ──

function getTodayKey(): string {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function getStorageKey(date: string): string {
  return `cowtalk-dx-${date}`;
}

function loadState(date: string): DxCompletionState {
  const key = getStorageKey(date);
  try {
    const raw = localStorage.getItem(key);
    if (!raw) {
      return { date, completedTodos: {}, acknowledgedAlarms: {} };
    }
    const parsed: unknown = JSON.parse(raw);
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      'date' in parsed &&
      (parsed as DxCompletionState).date === date
    ) {
      const state = parsed as DxCompletionState;
      return {
        date: state.date,
        completedTodos: state.completedTodos ?? {},
        acknowledgedAlarms: state.acknowledgedAlarms ?? {},
      };
    }
    return { date, completedTodos: {}, acknowledgedAlarms: {} };
  } catch {
    return { date, completedTodos: {}, acknowledgedAlarms: {} };
  }
}

function saveState(state: DxCompletionState): void {
  const key = getStorageKey(state.date);
  try {
    localStorage.setItem(key, JSON.stringify(state));
  } catch {
    // localStorage 용량 초과 시 무시
  }
}

// ── 훅 ──

export function useDxCompletion(): UseDxCompletionReturn {
  const today = getTodayKey();

  const [state, setState] = useState<DxCompletionState>(() => loadState(today));

  // 날짜가 바뀌었으면 리셋
  const currentState = state.date === today ? state : loadState(today);
  if (state.date !== today) {
    setState(currentState);
  }

  const toggleTodo = useCallback((todoKey: string) => {
    setState((prev) => {
      const d = getTodayKey();
      const base = prev.date === d ? prev : loadState(d);
      const isCompleted = todoKey in base.completedTodos;

      const nextTodos = isCompleted
        ? Object.fromEntries(
            Object.entries(base.completedTodos).filter(([k]) => k !== todoKey),
          )
        : { ...base.completedTodos, [todoKey]: Date.now() };

      const next: DxCompletionState = {
        ...base,
        date: d,
        completedTodos: nextTodos,
      };
      saveState(next);
      return next;
    });
  }, []);

  const acknowledgeAlarm = useCallback((eventId: string) => {
    setState((prev) => {
      const d = getTodayKey();
      const base = prev.date === d ? prev : loadState(d);

      if (eventId in base.acknowledgedAlarms) return base;

      const next: DxCompletionState = {
        ...base,
        date: d,
        acknowledgedAlarms: { ...base.acknowledgedAlarms, [eventId]: Date.now() },
      };
      saveState(next);
      return next;
    });
  }, []);

  const completedTodos = useMemo(
    () => new Map(Object.entries(currentState.completedTodos)),
    [currentState.completedTodos],
  );

  const acknowledgedAlarms = useMemo(
    () => new Map(Object.entries(currentState.acknowledgedAlarms)),
    [currentState.acknowledgedAlarms],
  );

  return {
    completedTodos,
    acknowledgedAlarms,
    toggleTodo,
    acknowledgeAlarm,
    todoCompletionCount: completedTodos.size,
    alarmAckCount: acknowledgedAlarms.size,
  };
}
