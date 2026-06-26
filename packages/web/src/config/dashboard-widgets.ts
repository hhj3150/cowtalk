// 역할별 대시보드 위젯 가시성 설정
// 각 역할에게 실제로 필요한 위젯만 보여줌

import type { Role } from '@cowtalk/shared';

export type DashboardWidgetId =
  | 'epidemic_alert_banner'
  | 'ai_briefing'
  | 'herd_overview'
  | 'breeding_pipeline'
  | 'epidemic_command_center'
  | 'farm_health_score'
  | 'farm_profit'
  | 'herd_composition_chart'
  | 'alert_trend_chart'
  | 'farm_comparison_radar'
  | 'vital_monitor_chart'
  | 'temperature_scatter'
  | 'event_timeline_chart'
  | 'farm_map'
  | 'live_alarm_feed'
  | 'todo_list'
  | 'fever_ranking'
  | 'farm_ranking'
  | 'epidemic_map'
  | 'inline_ai_chat'
  | 'vet_route'
  | 'sovereign_ai';

// 역할별 위젯 목록 (순서 = 표시 우선순위)
// farm_map을 최상단 배치 — 첫 화면에서 전국 농장 현황을 한눈에 보여줌
const ROLE_WIDGET_LAYOUTS: Readonly<Record<Role, readonly DashboardWidgetId[]>> = {
  // 농장주: 지도 + 할일 + 건강 + 번식 (내 농장 중심)
  farmer: [
    'epidemic_alert_banner',
    'farm_map',
    'herd_overview',
    'todo_list',
    'vital_monitor_chart',
    'alert_trend_chart',
    'ai_briefing',
  ],

  // 수의사: 지도 + 할일 + 발열/질병 + 센서
  veterinarian: [
    'epidemic_alert_banner',
    'farm_map',
    'herd_overview',
    'todo_list',
    'live_alarm_feed',
    'vital_monitor_chart',
    'fever_ranking',
    'farm_ranking',
    'ai_briefing',
  ],

  // 행정: 농장·시도·행정 관점 중심 (개체 단위 운영 위젯 제외 — 행정관은 집계/지역 관점)
  // 제외: breeding_pipeline·vital_monitor·temperature_scatter·event_timeline·live_alarm_feed·todo_list·inline_ai_chat·vet_route (개체/현장 운영용)
  government_admin: [
    'epidemic_alert_banner',
    'herd_overview',          // 집계 KPI
    'farm_map',               // 전국/시도 현황
    'farm_ranking',           // 농장 순위
    'farm_health_score',      // 농장 건강 긴급도
    'epidemic_command_center',// 역학
    'epidemic_map',           // 방역 지도
    'fever_ranking',          // 발열 순위(농장)
    'farm_comparison_radar',  // 농장 비교
    'herd_composition_chart', // 축군 구성(집계)
    'alert_trend_chart',      // 전국 발생 추이
    'farm_profit',            // 수급/경제
    'sovereign_ai',           // AI 지식 루프
    'ai_briefing',
  ],

  // 방역관: 지도 + 역학 + 발열
  quarantine_officer: [
    'epidemic_alert_banner',
    'farm_map',
    'epidemic_command_center',
    'epidemic_map',
    'farm_health_score',
    'fever_ranking',
    'herd_overview',
    'ai_briefing',
    'live_alarm_feed',
    'todo_list',
    'alert_trend_chart',
    'farm_ranking',
  ],

};

// 역할별 한글 라벨
export const ROLE_LABELS: Readonly<Record<Role, string>> = {
  farmer: '농장주',
  veterinarian: '수의사',
  government_admin: '행정관리',
  quarantine_officer: '방역관',
};

// 위젯 가시성 체크
export function isWidgetVisible(role: Role, widgetId: DashboardWidgetId): boolean {
  const layout = ROLE_WIDGET_LAYOUTS[role];
  if (!layout) return true; // 알 수 없는 역할이면 전부 표시
  return layout.includes(widgetId);
}

// 역할별 위젯 순서 반환
export function getWidgetOrder(role: Role): readonly DashboardWidgetId[] {
  return ROLE_WIDGET_LAYOUTS[role] ?? ROLE_WIDGET_LAYOUTS.government_admin;
}
