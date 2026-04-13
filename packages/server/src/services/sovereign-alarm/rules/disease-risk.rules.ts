/**
 * 질병 위험 룰 — 기존 6종 (ketosis, mastitis, acidosis, laminitis, heat_stress, water)
 * sovereign-alarm.service.ts에서 1:1 이식
 */

import type { DailySummary, AnimalProfile, SovereignAlarm } from '../types.js';

// ── 헬퍼: 기간 평균 계산 ──

function avgOf(arr: readonly (number | null)[]): number | null {
  const valid = arr.filter((v): v is number => v !== null && v !== undefined);
  return valid.length > 0 ? valid.reduce((s, v) => s + v, 0) / valid.length : null;
}

// ── 케토시스 ──

export function ruleKetosisRisk(summary: readonly DailySummary[], animal: AnimalProfile): SovereignAlarm | null {
  const dim = animal.daysInMilk ?? 0;
  if (dim < 7 || dim > 70) return null;
  const recent3 = summary.slice(0, 3);
  const prev4to7 = summary.slice(3, 7);
  if (recent3.length < 2 || prev4to7.length < 2) return null;

  const recentRumAvg = avgOf(recent3.map(d => d.rumAvg));
  const prevRumAvg = avgOf(prev4to7.map(d => d.rumAvg));
  if (!recentRumAvg || !prevRumAvg) return null;

  const rumDecline = (prevRumAvg - recentRumAvg) / prevRumAvg;
  if (rumDecline < 0.15) return null;

  const recentTempAvg = avgOf(recent3.map(d => d.tempAvg));
  const severity = rumDecline > 0.35 ? 'critical' as const : rumDecline > 0.25 ? 'warning' as const : 'caution' as const;
  const pct = Math.round(rumDecline * 100);

  return {
    alarmId: '', alarmSignature: '', animalId: '', earTag: '', animalName: null, farmId: '',
    type: 'ketosis_risk',
    severity,
    title: `케토시스 위험 (DIM ${dim}일, 반추 ${pct}% 감소)`,
    reasoning: `분만 후 ${dim}일차(케토시스 고위험기)에 최근 3일 반추시간(${Math.round(recentRumAvg)}분/일)이 이전 4-7일(${Math.round(prevRumAvg)}분/일) 대비 ${pct}% 감소했습니다. 체온 ${recentTempAvg ? recentTempAvg.toFixed(1) : 'N/A'}°C. 케토시스는 분만 후 에너지 부족으로 발생하며 반추 감소가 첫 번째 지표입니다. 조기 발견 시 NEFA 수치 확인과 프로필렌 글리콜 투여로 완치 가능합니다.`,
    actionPlan: `① 혈중 BHBA 검사(>1.2mmol/L 케토시스 확진) ② 프로필렌 글리콜 300mL 1일 2회 경구투여 ③ 사료섭취량 확인 ④ 착유량 모니터링 ⑤ 2일 후 재평가`,
    confidence: Math.round(40 + rumDecline * 100),
    detectedAt: new Date().toISOString(),
    dataPoints: { rumDeclinePct: pct, recentRumMin: Math.round(recentRumAvg), prevRumMin: Math.round(prevRumAvg), dim, tempAvg: recentTempAvg ?? 0 },
  };
}

// ── 유방염 ──

export function ruleMastitisRisk(summary: readonly DailySummary[], _animal: AnimalProfile): SovereignAlarm | null {
  const recent2 = summary.slice(0, 2);
  if (recent2.length < 2) return null;

  const highTemp = recent2.filter(d => d.tempAvg && d.tempAvg > 39.4);
  if (highTemp.length < 1) return null;

  const recentRum = recent2.filter(d => d.rumAvg);
  const prev = summary.slice(2, 5).filter(d => d.rumAvg);

  const tempAvg = avgOf(recent2.map(d => d.tempAvg));
  if (!tempAvg || tempAvg <= 39.4) return null;

  let rumDecline = 0;
  if (recentRum.length > 0 && prev.length > 0) {
    const rAvg = avgOf(recentRum.map(d => d.rumAvg))!;
    const pAvg = avgOf(prev.map(d => d.rumAvg))!;
    rumDecline = pAvg > 0 ? (pAvg - rAvg) / pAvg : 0;
  }

  if (tempAvg <= 39.4 && rumDecline < 0.1) return null;

  const severity = tempAvg > 40.2 ? 'critical' as const : tempAvg > 39.7 ? 'warning' as const : 'caution' as const;

  return {
    alarmId: '', alarmSignature: '', animalId: '', earTag: '', animalName: null, farmId: '',
    type: 'mastitis_risk',
    severity,
    title: `유방염 의심 (체온 ${tempAvg.toFixed(1)}°C${rumDecline > 0.1 ? ` + 반추 ${Math.round(rumDecline*100)}%↓` : ''})`,
    reasoning: `최근 2일 평균 체온 ${tempAvg.toFixed(1)}°C로 정상범위(38.5-39.2°C) 초과. ${rumDecline > 0.1 ? `반추시간도 ${Math.round(rumDecline*100)}% 감소하여 ` : ''}전신염증 반응 동반 가능성. 유방염은 착유우에서 가장 흔한 질환으로 조기 치료 시 유방 손상과 착유량 손실을 최소화할 수 있습니다.`,
    actionPlan: `① CMT(유방염 간이검사) 4분방 실시 ② 유즙 이상(응고, 혈유) 육안확인 ③ 항생제 처방(수의사 상담) ④ 착유 전 체온 재확인 ⑤ 격리 고려`,
    confidence: Math.round(50 + (tempAvg - 39.4) * 60 + rumDecline * 30),
    detectedAt: new Date().toISOString(),
    dataPoints: { tempAvg, rumDeclinePct: Math.round(rumDecline * 100) },
  };
}

// ── 아급성 제1위산증(SARA) ──

export function ruleAcidosisRisk(summary: readonly DailySummary[], animal: AnimalProfile): SovereignAlarm | null {
  const recent3 = summary.slice(0, 3);
  const prev4 = summary.slice(3, 7);
  if (recent3.length < 2 || prev4.length < 2) return null;

  const recentRumAvg = avgOf(recent3.map(d => d.rumAvg));
  const prevRumAvg = avgOf(prev4.map(d => d.rumAvg));
  if (!recentRumAvg || !prevRumAvg || prevRumAvg <= 0) return null;
  const rumDecline = (prevRumAvg - recentRumAvg) / prevRumAvg;
  if (rumDecline < 0.28) return null;

  const recentActAvg = avgOf(recent3.map(d => d.actAvg));
  const prevActAvg = avgOf(prev4.map(d => d.actAvg));
  const actDecline = (recentActAvg && prevActAvg && prevActAvg > 0)
    ? (prevActAvg - recentActAvg) / prevActAvg
    : 0;

  const dim = animal.daysInMilk ?? 0;
  const severity = (rumDecline > 0.40 || actDecline > 0.20) ? 'critical' as const : 'warning' as const;

  return {
    alarmId: '', alarmSignature: '', animalId: '', earTag: '', animalName: null, farmId: '',
    type: 'acidosis_risk',
    severity,
    title: `아급성 제1위산증(SARA) 의심 (반추 ${Math.round(rumDecline*100)}%↓)`,
    reasoning: `최근 3일 반추시간(${Math.round(recentRumAvg)}분/일)이 이전 대비 ${Math.round(rumDecline*100)}% 급감. SARA는 사료의 급격한 변화, 과도한 농후사료 급여 시 발생하며 반추 감소가 핵심 지표입니다(정상 반추 400-600분/일). DIM ${dim}일.`,
    actionPlan: `① 조사료:농후사료 비율 확인(최소 50:50) ② 완충제(탄산수소나트륨) 사료 첨가 ③ 사료 변화 이력 확인 ④ 분변 점수(FCS) 평가 ⑤ 수의사 상담`,
    confidence: Math.round(45 + rumDecline * 100),
    detectedAt: new Date().toISOString(),
    dataPoints: { rumDeclinePct: Math.round(rumDecline*100), actDeclinePct: Math.round(actDecline*100), recentRumMin: Math.round(recentRumAvg), dim },
  };
}

// ── 제엽염 ──

export function ruleLaminitisRisk(summary: readonly DailySummary[], animal: AnimalProfile): SovereignAlarm | null {
  const dim = animal.daysInMilk ?? 0;
  if (dim < 14 || dim > 150) return null;

  const recent5 = summary.slice(0, 5);
  if (recent5.length < 4) return null;

  const actVals = recent5.filter(d => d.actAvg).map(d => d.actAvg!);
  if (actVals.length < 3) return null;

  const trend = actVals.slice(0, 3).reduce((s, v) => s + v, 0) / 3;
  const baseline = actVals.slice(2).reduce((s, v) => s + v, 0) / actVals.slice(2).length;
  if (baseline === 0) return null;
  const actDecline = (baseline - trend) / baseline;
  if (actDecline < 0.20) return null;

  const tempAvg = avgOf(recent5.map(d => d.tempAvg)) ?? 0;

  return {
    alarmId: '', alarmSignature: '', animalId: '', earTag: '', animalName: null, farmId: '',
    type: 'laminitis_risk',
    severity: 'warning',
    title: `제엽염 위험 (DIM ${dim}일, 활동 ${Math.round(actDecline*100)}%↓)`,
    reasoning: `최근 5일 활동량이 ${Math.round(actDecline*100)}% 감소 추세. DIM ${dim}일로 비유 성수기 제엽염 발생 고위험기. 제엽염은 발굽 내 혈류장애로 보행 통증을 유발하며, 활동량 감소가 초기 징후입니다.`,
    actionPlan: `① 보행 및 기립 패턴 육안 관찰 ② 발굽 상태 확인(발굽삭제, 부종) ③ 바닥 재질 개선(고무매트) ④ 영양 관리(아연, 비오틴 보충) ⑤ 발굽 전문가 상담`,
    confidence: Math.round(35 + actDecline * 80),
    detectedAt: new Date().toISOString(),
    dataPoints: { actDeclinePct: Math.round(actDecline*100), tempAvg, dim, parity: animal.parity ?? 0 },
  };
}

// ── 열스트레스 ──

export function ruleHeatStressRisk(summary: readonly DailySummary[], _animal: AnimalProfile): SovereignAlarm | null {
  const recent3 = summary.slice(0, 3);
  if (recent3.length < 2) return null;

  const tempVals = recent3.filter(d => d.tempAvg && d.tempAvg > 39.1).map(d => d.tempAvg!);
  if (tempVals.length < 2) return null;

  const avgTemp = tempVals.reduce((s, v) => s + v, 0) / tempVals.length;
  if (avgTemp <= 39.2) return null;

  const rumAvg = avgOf(recent3.map(d => d.rumAvg)) ?? 0;

  return {
    alarmId: '', alarmSignature: '', animalId: '', earTag: '', animalName: null, farmId: '',
    type: 'heat_stress',
    severity: avgTemp > 39.8 ? 'warning' : 'caution',
    title: `열스트레스 의심 (평균 체온 ${avgTemp.toFixed(1)}°C)`,
    reasoning: `최근 ${tempVals.length}일 연속 체온 ${avgTemp.toFixed(1)}°C로 정상범위(38.5-39.2°C) 초과. ${rumAvg > 0 && rumAvg < 350 ? `반추시간도 ${Math.round(rumAvg)}분/일로 저하. ` : ''}열스트레스(THI >72)는 착유량 15-20% 감소, 번식성적 저하의 주요 원인.`,
    actionPlan: `① 사육 환경 온습도(THI) 확인 ② 환기팬·쿨링시스템 가동 ③ 음수대 추가 설치 ④ 사료 급여 시간 조정(새벽/야간) ⑤ 착유량 모니터링`,
    confidence: Math.round(40 + (avgTemp - 39.2) * 50),
    detectedAt: new Date().toISOString(),
    dataPoints: { avgTemp, rumAvgMin: Math.round(rumAvg), highTempDays: tempVals.length },
  };
}
