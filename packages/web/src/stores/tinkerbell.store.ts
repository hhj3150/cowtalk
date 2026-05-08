// 팅커벨 글로벌 상태 — AppShell이 전역 TinkerbellAssistant 한 인스턴스를 렌더하고,
// 페이지에서는 trigger·dashboardContext를 store에 set하여 자동 전달.
//
// 이렇게 하면 어느 페이지든 wake word "팅커벨" 호출이 작동하면서 (한 인스턴스만 마이크 점유),
// 페이지별 자동 질문 트리거 기능도 유지됩니다.

import { create } from 'zustand';

export interface TinkerbellDashboardContext {
  readonly totalAlarms: number;
  readonly criticalCount: number;
  readonly healthIssues: number;
  readonly farmCount: number;
  readonly animalCount: number;
}

interface TinkerbellState {
  /** 페이지에서 set하면 팅커벨이 즉시 해당 질문을 자동 전송 */
  trigger: string | undefined;
  /** 메인 대시보드 컨텍스트 — 추천 질문 생성에 사용 */
  dashboardContext: TinkerbellDashboardContext | undefined;
  setTrigger: (t: string | undefined) => void;
  setDashboardContext: (ctx: TinkerbellDashboardContext | undefined) => void;
}

export const useTinkerbellStore = create<TinkerbellState>((set) => ({
  trigger: undefined,
  dashboardContext: undefined,
  setTrigger: (t) => set({ trigger: t }),
  setDashboardContext: (ctx) => set({ dashboardContext: ctx }),
}));
