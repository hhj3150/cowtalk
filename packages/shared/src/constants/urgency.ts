// 사용자향 5단계 긴급도 — "언제까지 해야 하는가"를 항상 함께 말한다
//
// severity(심각도)는 판단의 무게, urgency(긴급도)는 행동의 마감이다.
// 분류는 결정적(rule-based)·감사 가능해야 하며, 알림 표면(결정 큐/알림함)이
// 같은 분류기를 공유해 화면마다 다른 긴급도가 나오는 일을 막는다.

import type { ActionUrgency, DecisionSeverity } from '../types/decision-queue.js';

export const URGENCY_ORDER: readonly ActionUrgency[] = [
  'emergency',
  'today',
  'within_48h',
  'watch',
  'info',
];

export const URGENCY_LABELS: Readonly<Record<ActionUrgency, string>> = {
  emergency: '응급',
  today: '오늘 조치',
  within_48h: '48시간 이내',
  watch: '관찰',
  info: '정보',
};

/**
 * 5단계 긴급도 분류 (순수 함수).
 * - 응급: critical, 또는 골든타임 6시간 이내
 * - 오늘 조치: high, 또는 골든타임 24시간 이내
 * - 48시간 이내: 골든타임 48시간 이내
 * - 관찰: medium (마감 없음)
 * - 정보: low (마감 없음)
 */
export function classifyUrgency(
  severity: DecisionSeverity,
  dueInHours?: number,
): ActionUrgency {
  const due = dueInHours != null && Number.isFinite(dueInHours) && dueInHours >= 0
    ? dueInHours
    : null;
  if (severity === 'critical' || (due !== null && due <= 6)) return 'emergency';
  if (severity === 'high' || (due !== null && due <= 24)) return 'today';
  if (due !== null && due <= 48) return 'within_48h';
  if (severity === 'medium') return 'watch';
  return 'info';
}
