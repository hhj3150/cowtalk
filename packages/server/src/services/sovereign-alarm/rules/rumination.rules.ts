/**
 * 반추 알람 룰 — smaXtec 독립 감지
 * rumination_decrease, rumination_warning
 */

import type { DailySummary, AnimalProfile, SovereignAlarm } from '../types.js';

function avgOf(arr: readonly (number | null)[]): number | null {
  const valid = arr.filter((v): v is number => v !== null && v !== undefined);
  return valid.length > 0 ? valid.reduce((s, v) => s + v, 0) / valid.length : null;
}

// ── 반추 감소 (rumination_decrease) ──

export function ruleRuminationDecrease(summary: readonly DailySummary[], _animal: AnimalProfile): SovereignAlarm | null {
  const recent3 = summary.slice(0, 3);
  const prev4 = summary.slice(3, 7);
  if (recent3.length < 2 || prev4.length < 2) return null;

  const recentRum = avgOf(recent3.map(d => d.rumAvg));
  const prevRum = avgOf(prev4.map(d => d.rumAvg));
  if (!recentRum || !prevRum || prevRum <= 0) return null;

  const decline = (prevRum - recentRum) / prevRum;
  if (decline < 0.25) return null;

  // 체온이 동시에 높으면 질병 룰이 담당 → 중복 방지
  const recentTemp = avgOf(recent3.map(d => d.tempAvg));
  if (recentTemp && recentTemp > 39.5) return null;

  const pct = Math.round(decline * 100);
  const severity = decline > 0.40 ? 'warning' as const : 'caution' as const;

  return {
    alarmId: '', alarmSignature: '', animalId: '', earTag: '', animalName: null, farmId: '',
    type: 'rumination_decrease',
    severity,
    title: `반추시간 감소 (${pct}%↓)`,
    reasoning: `최근 3일 반추시간(${Math.round(recentRum)}분/일)이 이전 4일(${Math.round(prevRum)}분/일) 대비 ${pct}% 감소. 체온은 정상범위이므로 급성 질병보다 스트레스, 사료 문제, 환경 변화 가능성이 높습니다. 정상 반추 400-600분/일.`,
    actionPlan: `① 사료섭취량 확인 ② 사육환경 스트레스 요인 점검 ③ 우군 이동/재편성 여부 확인 ④ 24시간 추가 모니터링 ⑤ 지속 시 수의사 상담`,
    confidence: Math.round(40 + decline * 80),
    detectedAt: new Date().toISOString(),
    dataPoints: { rumDeclinePct: pct, recentRumMin: Math.round(recentRum), prevRumMin: Math.round(prevRum) },
  };
}

// ── 반추 경고 (rumination_warning) — 경도 감소 ──

export function ruleRuminationWarning(summary: readonly DailySummary[], _animal: AnimalProfile): SovereignAlarm | null {
  const recent3 = summary.slice(0, 3);
  const prev4 = summary.slice(3, 7);
  if (recent3.length < 2 || prev4.length < 2) return null;

  const recentRum = avgOf(recent3.map(d => d.rumAvg));
  const prevRum = avgOf(prev4.map(d => d.rumAvg));
  if (!recentRum || !prevRum || prevRum <= 0) return null;

  const decline = (prevRum - recentRum) / prevRum;
  if (decline < 0.15 || decline >= 0.25) return null; // 15-25% 구간만

  const recentTemp = avgOf(recent3.map(d => d.tempAvg));
  if (recentTemp && recentTemp > 39.5) return null;

  const pct = Math.round(decline * 100);

  return {
    alarmId: '', alarmSignature: '', animalId: '', earTag: '', animalName: null, farmId: '',
    type: 'rumination_warning',
    severity: 'info',
    title: `반추 경미 감소 (${pct}%↓)`,
    reasoning: `최근 3일 반추시간이 이전 대비 ${pct}% 소폭 감소. 아직 정상 범위 내이지만 추세가 지속되면 건강 변화의 초기 신호일 수 있습니다.`,
    actionPlan: `① 다음 24시간 반추 추이 관찰 ② 사료섭취 정상 여부 확인 ③ 다른 증상 동반 시 질병 감별`,
    confidence: Math.round(25 + decline * 60),
    detectedAt: new Date().toISOString(),
    dataPoints: { rumDeclinePct: pct, recentRumMin: Math.round(recentRum) },
  };
}
