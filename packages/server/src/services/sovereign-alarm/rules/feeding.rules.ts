/**
 * 사양/음수 알람 룰
 * - feeding_warning: 반추 패턴 급변 (급이 문제)
 * - water_decrease / water_increase: 음수량 이상 (기존 이식)
 */

import type { DailySummary, AnimalProfile, SovereignAlarm } from '../types.js';

function avgOf(arr: readonly (number | null)[]): number | null {
  const valid = arr.filter((v): v is number => v !== null && v !== undefined);
  return valid.length > 0 ? valid.reduce((s, v) => s + v, 0) / valid.length : null;
}

// ── 급이 이상 경고 ──

export function ruleFeedingWarning(summary: readonly DailySummary[], _animal: AnimalProfile): SovereignAlarm | null {
  // 반추 패턴 급변: 최근 2일 vs 이전 5일 — 반추 20%+ 감소인데 체온은 정상
  // (체온 상승 동반이면 질병 룰이 잡으므로, 체온 정상 + 반추만 감소 = 급이 문제 가능성)
  const recent2 = summary.slice(0, 2);
  const prev5 = summary.slice(2, 7);
  if (recent2.length < 2 || prev5.length < 2) return null;

  const recentRum = avgOf(recent2.map(d => d.rumAvg));
  const prevRum = avgOf(prev5.map(d => d.rumAvg));
  if (!recentRum || !prevRum || prevRum <= 0) return null;

  const rumDecline = (prevRum - recentRum) / prevRum;
  if (rumDecline < 0.20) return null;

  // 체온이 정상 범위(38.0-39.3)이면 급이 문제로 판단
  const recentTemp = avgOf(recent2.map(d => d.tempAvg));
  if (recentTemp && recentTemp > 39.4) return null; // 발열 동반 → 질병 룰이 처리

  const pct = Math.round(rumDecline * 100);

  return {
    alarmId: '', alarmSignature: '', animalId: '', earTag: '', animalName: null, farmId: '',
    type: 'feeding_warning',
    severity: rumDecline > 0.35 ? 'warning' : 'caution',
    title: `급이 이상 의심 (반추 ${pct}%↓, 체온 정상)`,
    reasoning: `최근 2일 반추시간(${Math.round(recentRum)}분/일)이 이전 5일(${Math.round(prevRum)}분/일) 대비 ${pct}% 감소했으나 체온은 정상 범위. 발열 없이 반추만 감소하면 사료 변경, 급이량 부족, 사료 품질 문제(곰팡이, 발효불량) 가능성이 높습니다.`,
    actionPlan: `① 사료 변경 이력 확인 ② TMR 혼합 균일도 점검 ③ 사료 곰팡이/부패 확인 ④ 급이량 적정성 확인 ⑤ 음수량 동시 확인`,
    confidence: Math.round(35 + rumDecline * 80),
    detectedAt: new Date().toISOString(),
    dataPoints: { rumDeclinePct: pct, recentRumMin: Math.round(recentRum), prevRumMin: Math.round(prevRum), tempAvg: recentTemp ?? 0 },
  };
}

// ── 음수량 이상 (기존 이식) ──

export function ruleWaterIntakeAnomaly(summary: readonly DailySummary[], _animal: AnimalProfile): SovereignAlarm | null {
  const recent2 = summary.slice(0, 2);
  const prev3 = summary.slice(2, 5);

  const rDr = recent2.filter(d => d.drSum && d.drSum > 10).map(d => d.drSum!);
  const pDr = prev3.filter(d => d.drSum && d.drSum > 10).map(d => d.drSum!);

  if (rDr.length === 0 || pDr.length === 0) return null;

  const recentDr = rDr.reduce((s, v) => s + v, 0) / rDr.length;
  const prevDr = pDr.reduce((s, v) => s + v, 0) / pDr.length;
  if (prevDr < 20) return null;

  const change = (recentDr - prevDr) / prevDr;
  if (Math.abs(change) < 0.35) return null;

  const isDecrease = change < 0;
  const pct = Math.round(Math.abs(change) * 100);

  return {
    alarmId: '', alarmSignature: '', animalId: '', earTag: '', animalName: null, farmId: '',
    type: isDecrease ? 'water_decrease' : 'water_increase',
    severity: pct > 60 ? 'warning' : 'caution',
    title: `음수량 ${isDecrease ? '급감' : '급증'} (${pct}% ${isDecrease ? '↓' : '↑'})`,
    reasoning: `최근 2일 음수량(${Math.round(recentDr)}L/일)이 이전 3일(${Math.round(prevDr)}L/일) 대비 ${pct}% ${isDecrease ? '감소' : '증가'}. ${isDecrease ? '음수량 감소는 발열, 통증, 스트레스의 초기 신호.' : '음수량 급증은 당뇨병, 신장질환, 고염분 사료 급여 시 발생.'}`,
    actionPlan: isDecrease
      ? `① 음수대 청결 및 수압 확인 ② 체온 측정 ③ 사료섭취량 변화 확인 ④ 스트레스 요인 제거 ⑤ 수의사 상담`
      : `① 사료 내 식염 함량 확인 ② 소변 검사(당뇨 확인) ③ 신장 기능 확인 ④ 전해질 균형 평가`,
    confidence: Math.round(30 + Math.abs(change) * 60),
    detectedAt: new Date().toISOString(),
    dataPoints: { recentDrL: Math.round(recentDr), prevDrL: Math.round(prevDr), changePct: pct },
  };
}
