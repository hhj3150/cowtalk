// 차트 공용 색상 팔레트 — 대시보드 차트(Recharts) 색상 단일 출처
// Recharts 의 SVG 속성(stroke/fill)은 CSS 변수를 해석하지 못하므로 hex 상수로 중앙화한다.
// 값은 index.css 다크 테마 토큰과 같은 계열(tailwind 팔레트)로 유지할 것.

export const CHART_COLORS = {
  // 시맨틱 (알림 심각도)
  critical: '#dc2626',
  danger: '#ef4444',
  high: '#f97316',
  warning: '#f59e0b',
  info: '#3b82f6',
  infoLight: '#60a5fa',
  ok: '#22c55e',
  okDeep: '#16a34a',

  // 시리즈 보조색
  teal: '#10b981',
  purple: '#8b5cf6',
  pink: '#ec4899',

  // 차트 크롬 (축/그리드/툴팁) — 딥 네이비 테마 위 slate 계열
  axis: '#94a3b8',
  muted: '#64748b',
  grid: '#334155',
  panelBorder: '#1b2740',
  surface: '#0d1524',
  tooltipBg: '#0f172a',
  tooltipText: '#f8fafc',
} as const;
