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
  | 'insemination_route'
  | 'sovereign_ai';

// 역할별 위젯 목록 (순서 = 표시 우선순위)
const ROLE_WIDGET_LAYOUTS: Readonly<Record<Role, readonly DashboardWidgetId[]>> = {
  // 농장주: 내 소 중심, 할 일, 센서, 번식
  farmer: [
    'epidemic_alert_banner',
    'ai_briefing',
    'herd_overview',
    'live_alarm_feed',
    'todo_list',
    'inline_ai_chat',
    'vital_monitor_chart',
    'temperature_scatter',
    'event_timeline_chart',
    'breeding_pipeline',
    'alert_trend_chart',
    'herd_composition_chart',
    'sovereign_ai',
  ],

  // 수의사: 진료 경로, 발열, 센서 분석
  veterinarian: [
    'epidemic_alert_banner',
    'ai_briefing',
    'herd_overview',
    'live_alarm_feed',
    'todo_list',
    'vet_route',
    'fever_ranking',
    'vital_monitor_chart',
    'temperature_scatter',
    'event_timeline_chart',
    'alert_trend_chart',
    'farm_ranking',
    'farm_map',
  ],

  // 수정사: 오늘 수정할 소가 전부. 깔끔하게.
  inseminator: [
    'ai_briefing',
    'herd_overview',
    'todo_list',
    'insemination_route',
  ],

  // 행정: 전체 (모든 위젯)
  government_admin: [
    'epidemic_alert_banner',
    'ai_briefing',
    'herd_overview',
    'breeding_pipeline',
    'epidemic_command_center',
    'farm_health_score',
    'farm_profit',
    'herd_composition_chart',
    'alert_trend_chart',
    'farm_comparison_radar',
    'vital_monitor_chart',
    'temperature_scatter',
    'event_timeline_chart',
    'farm_map',
    'live_alarm_feed',
    'todo_list',
    'fever_ranking',
    'farm_ranking',
    'epidemic_map',
    'inline_ai_chat',
    'vet_route',
    'insemination_route',
    'sovereign_ai',
  ],

  // 방역관: 역학, 지도, 발열
  quarantine_officer: [
    'epidemic_alert_banner',
    'epidemic_command_center',
    'epidemic_map',
    'farm_health_score',
    'fever_ranking',
    'farm_map',
    'herd_overview',
    'ai_briefing',
    'live_alarm_feed',
    'todo_list',
    'alert_trend_chart',
    'farm_ranking',
  ],

  // 사료회사: 축군 구성, 반추, 농장 비교
  feed_company: [
    'epidemic_alert_banner',
    'ai_briefing',
    'herd_overview',
    'live_alarm_feed',
    'todo_list',
    'herd_composition_chart',
    'vital_monitor_chart',
    'farm_comparison_radar',
    'farm_ranking',
  ],
};

// 역할별 한글 라벨
export const ROLE_LABELS: Readonly<Record<Role, string>> = {
  farmer: '농장주',
  veterinarian: '수의사',
  inseminator: '수정사',
  government_admin: '행정관리',
  quarantine_officer: '방역관',
  feed_company: '사료회사',
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
