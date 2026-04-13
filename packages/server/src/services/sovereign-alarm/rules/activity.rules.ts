/**
 * 활동량 알람 룰 — smaXtec 독립 감지
 * activity_increase, activity_decrease, activity_warning
 */

import type { DailySummary, AnimalProfile, SovereignAlarm } from '../types.js';

function avgOf(arr: readonly (number | null)[]): number | null {
  const valid = arr.filter((v): v is number => v !== null && v !== undefined);
  return valid.length > 0 ? valid.reduce((s, v) => s + v, 0) / valid.length : null;
}

// ── 활동량 급증 (activity_increase) ──

export function ruleActivityIncrease(summary: readonly DailySummary[], _animal: AnimalProfile): SovereignAlarm | null {
  const recent2 = summary.slice(0, 2);
  const prev5 = summary.slice(2, 7);
  if (recent2.length < 1 || prev5.length < 2) return null;

  const recentAct = avgOf(recent2.map(d => d.actAvg));
  const prevAct = avgOf(prev5.map(d => d.actAvg));
  if (!recentAct || !prevAct || prevAct <= 0) return null;

  const increase = (recentAct - prevAct) / prevAct;
  if (increase < 0.50) return null;

  const pct = Math.round(increase * 100);

  return {
    alarmId: '', alarmSignature: '', animalId: '', earTag: '', animalName: null, farmId: '',
    type: 'activity_increase',
    severity: increase > 0.80 ? 'warning' : 'caution',
    title: `활동량 급증 (${pct}%↑)`,
    reasoning: `최근 활동량(${Math.round(recentAct)})이 기준선(${Math.round(prevAct)}) 대비 ${pct}% 증가. 발정 가능성이 가장 높으며(활동 급증이 발정의 핵심 징후), 통증에 의한 안절부절(산통), 환경 스트레스(우군 재편성, 새로운 개체 도입)도 가능합니다.`,
    actionPlan: `① 발정 징후 확인(승가 허용, 점액 분비, 외음부 부종) ② 번식 상태 확인(수정 적기 여부) ③ 통증 원인 감별(제엽염, 산통) ④ 우군 환경 변화 확인`,
    confidence: Math.round(40 + increase * 40),
    detectedAt: new Date().toISOString(),
    dataPoints: { actIncreasePct: pct, recentAct: Math.round(recentAct), prevAct: Math.round(prevAct) },
  };
}

// ── 활동량 급감 (activity_decrease) ──

export function ruleActivityDecrease(summary: readonly DailySummary[], _animal: AnimalProfile): SovereignAlarm | null {
  const recent2 = summary.slice(0, 2);
  const prev5 = summary.slice(2, 7);
  if (recent2.length < 1 || prev5.length < 2) return null;

  const recentAct = avgOf(recent2.map(d => d.actAvg));
  const prevAct = avgOf(prev5.map(d => d.actAvg));
  if (!recentAct || !prevAct || prevAct <= 0) return null;

  const decline = (prevAct - recentAct) / prevAct;
  if (decline < 0.30) return null;

  // 체온 높으면 질병 룰이 담당
  const recentTemp = avgOf(recent2.map(d => d.tempAvg));
  if (recentTemp && recentTemp > 39.5) return null;

  const pct = Math.round(decline * 100);

  return {
    alarmId: '', alarmSignature: '', animalId: '', earTag: '', animalName: null, farmId: '',
    type: 'activity_decrease',
    severity: decline > 0.50 ? 'warning' : 'caution',
    title: `활동량 급감 (${pct}%↓)`,
    reasoning: `최근 활동량이 기준선 대비 ${pct}% 감소. 체온 정상이므로 급성 감염보다 파행(제엽염, 발굽 손상), 통증, 피로, 또는 초기 질병의 전구 증상 가능성. 지속 시 반드시 보행 상태를 확인해야 합니다.`,
    actionPlan: `① 보행 상태(BCS locomotion score) 확인 ② 기립/횡와 시간 비율 확인 ③ 발굽 상태 점검 ④ 사료섭취 정상 여부 ⑤ 24시간 추가 모니터링`,
    confidence: Math.round(35 + decline * 60),
    detectedAt: new Date().toISOString(),
    dataPoints: { actDeclinePct: pct, recentAct: Math.round(recentAct), prevAct: Math.round(prevAct) },
  };
}

// ── 활동량 경고 (activity_warning) — 경도 변화 ──

export function ruleActivityWarning(summary: readonly DailySummary[], _animal: AnimalProfile): SovereignAlarm | null {
  const recent2 = summary.slice(0, 2);
  const prev5 = summary.slice(2, 7);
  if (recent2.length < 1 || prev5.length < 2) return null;

  const recentAct = avgOf(recent2.map(d => d.actAvg));
  const prevAct = avgOf(prev5.map(d => d.actAvg));
  if (!recentAct || !prevAct || prevAct <= 0) return null;

  const change = (recentAct - prevAct) / prevAct;
  const absChange = Math.abs(change);

  // 20-30% 감소 또는 30-50% 증가 (더 큰 변화는 위 룰들이 처리)
  if (change < 0 && (absChange < 0.20 || absChange >= 0.30)) return null;
  if (change > 0 && (absChange < 0.30 || absChange >= 0.50)) return null;
  if (absChange < 0.20) return null;

  const direction = change > 0 ? '증가' : '감소';
  const pct = Math.round(absChange * 100);

  return {
    alarmId: '', alarmSignature: '', animalId: '', earTag: '', animalName: null, farmId: '',
    type: 'activity_warning',
    severity: 'info',
    title: `활동량 경미 ${direction} (${pct}%${change > 0 ? '↑' : '↓'})`,
    reasoning: `활동량이 기준선 대비 ${pct}% ${direction}. 정상 범위 내 변동이지만 추세 관찰이 필요합니다.`,
    actionPlan: `① 다음 24시간 활동 추이 관찰 ② ${change > 0 ? '발정 가능성 확인' : '보행 상태 확인'} ③ 다른 증상 동반 시 수의사 상담`,
    confidence: Math.round(20 + absChange * 50),
    detectedAt: new Date().toISOString(),
    dataPoints: { actChangePct: Math.round(change * 100), recentAct: Math.round(recentAct) },
  };
}
