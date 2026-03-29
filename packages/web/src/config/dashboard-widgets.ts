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

  // 수정사: 지도 + 발정 대상우 + 번식성적 + AI 정액 추천
  inseminator: [
    'farm_map',
    'herd_overview',
    'insemination_route',
    'ai_briefing',
  ],

  // 행정: 지도 + 전체 (모든 위젯)
  government_admin: [
    'epidemic_alert_banner',
    'farm_map',
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
    'live_alarm_feed',
    'todo_list',
    'fever_ranking',
    'farm_ranking',
    'epidemic_map',
    'inline_ai_chat',
    'vet_route',
    'sovereign_ai',
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

  // 사료회사: 지도 + 축군 구성 + 반추 + 농장 비교
  feed_company: [
    'epidemic_alert_banner',
    'farm_map',
    'herd_overview',
    'todo_list',
    'vital_monitor_chart',
    'herd_composition_chart',
    'ai_briefing',
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
