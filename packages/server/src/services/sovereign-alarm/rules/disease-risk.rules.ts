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
  if (dim < 3 || dim > 70) return null;  // DIM 3~70일 (분만 직후부터 감시)
  const recent3 = summary.slice(0, 3);
  const prev4to7 = summary.slice(3, 7);
  if (recent3.length < 2 || prev4to7.length < 2) return null;

  const recentRumAvg = avgOf(recent3.map(d => d.rumAvg));
  const prevRumAvg = avgOf(prev4to7.map(d => d.rumAvg));
  if (!recentRumAvg || !prevRumAvg) return null;

  const rumDecline = (prevRumAvg - recentRumAvg) / prevRumAvg;
  if (rumDecline < 0.15) return null;

  // 활동량 감소 동반 여부 (케토시스 복합 징후)
  const recentActAvg = avgOf(recent3.map(d => d.actAvg));
  const prevActAvg = avgOf(prev4to7.map(d => d.actAvg));
  const actDecline = (recentActAvg && prevActAvg && prevActAvg > 0)
    ? (prevActAvg - recentActAvg) / prevActAvg : 0;

  const recentTempAvg = avgOf(recent3.map(d => d.tempAvg));

  // 산차별 위험 가중: 3산 이상 고산차우는 케토시스 발생률 2배
  const parity = animal.parity ?? 1;
  const parityBonus = parity >= 3 ? 10 : 0;
  const actBonus = actDecline > 0.10 ? 10 : 0;

  const severity = (rumDecline > 0.35 || (rumDecline > 0.25 && actDecline > 0.15))
    ? 'critical' as const
    : rumDecline > 0.25 ? 'warning' as const
    : 'caution' as const;
  const pct = Math.round(rumDecline * 100);

  const parityNote = parity >= 3 ? ` ${parity}산 고산차우로 케토시스 고위험군.` : '';
  const actNote = actDecline > 0.10 ? ` 활동량도 ${Math.round(actDecline * 100)}% 감소하여 에너지 부족 징후 동반.` : '';

  return {
    alarmId: '', alarmSignature: '', animalId: '', earTag: '', animalName: null, farmId: '',
    type: 'ketosis_risk',
    severity,
    title: `케토시스 위험 (DIM ${dim}일, 반추 ${pct}%↓${actDecline > 0.10 ? ` + 활동 ${Math.round(actDecline*100)}%↓` : ''}${parity >= 3 ? ` [${parity}산]` : ''})`,
    reasoning: `분만 후 ${dim}일차(케토시스 고위험기)에 최근 3일 반추시간(${Math.round(recentRumAvg)}분/일)이 이전 4-7일(${Math.round(prevRumAvg)}분/일) 대비 ${pct}% 감소했습니다.${actNote}${parityNote} 체온 ${recentTempAvg ? recentTempAvg.toFixed(1) : 'N/A'}°C(정상범위). 케토시스는 분만 후 에너지 부족(음에너지 균형)으로 체지방 분해가 과도해져 발생하며, 반추 감소+활동 저하가 초기 지표입니다.`,
    actionPlan: `① 혈중 BHBA 검사(>1.2mmol/L 준임상, >3.0 임상형) ② 프로필렌 글리콜 300mL 1일 2회 경구투여 ③ 사료섭취량 확인 (TMR 잔량) ④ 착유량 변화 모니터링 ⑤ BCS 평가 (과비우 → 고위험) ⑥ 2일 후 재평가`,
    confidence: Math.min(100, Math.round(40 + rumDecline * 100 + parityBonus + actBonus)),
    detectedAt: new Date().toISOString(),
    dataPoints: { rumDeclinePct: pct, actDeclinePct: Math.round(actDecline * 100), recentRumMin: Math.round(recentRumAvg), prevRumMin: Math.round(prevRumAvg), dim, parity, tempAvg: recentTempAvg ?? 0 },
  };
}

// ── 유방염 ──

export function ruleMastitisRisk(summary: readonly DailySummary[], _animal: AnimalProfile): SovereignAlarm | null {
  const recent2 = summary.slice(0, 2);
  const prev3to5 = summary.slice(2, 5);
  if (recent2.length < 2) return null;

  const tempAvg = avgOf(recent2.map(d => d.tempAvg));
  if (!tempAvg) return null;

  // 체온 기준선 (이전 3일)
  const prevTempAvg = avgOf(prev3to5.map(d => d.tempAvg));
  const tempRise = prevTempAvg ? tempAvg - prevTempAvg : 0;

  // 반추 감소 계산
  const recentRumAvg = avgOf(recent2.map(d => d.rumAvg));
  const prevRumAvg = avgOf(prev3to5.map(d => d.rumAvg));
  const rumDecline = (recentRumAvg && prevRumAvg && prevRumAvg > 0)
    ? (prevRumAvg - recentRumAvg) / prevRumAvg : 0;

  // 3단계 유방염 감지 (subclinical → clinical → acute)

  // 3단계: 급성 유방염 (체온 > 40.0 + 반추 20%↓ + 활동↓)
  if (tempAvg > 40.0 && rumDecline > 0.15) {
    return {
      alarmId: '', alarmSignature: '', animalId: '', earTag: '', animalName: null, farmId: '',
      type: 'mastitis_risk',
      severity: tempAvg > 40.5 ? 'critical' : 'warning',
      title: `🔴 급성 유방염 (체온 ${tempAvg.toFixed(1)}°C, 반추 ${Math.round(rumDecline*100)}%↓)`,
      reasoning: `체온 ${tempAvg.toFixed(1)}°C + 반추 ${Math.round(rumDecline*100)}% 감소. 급성 유방염(대장균 등)은 패혈증으로 급속 진행 가능. 유방 부종·통증·유즙 이상이 동반되며, 전통적 발견(유즙 확인) 시점에는 이미 늦음. 센서 조기 감지로 치료 골든타임을 확보합니다.`,
      actionPlan: `① 즉시 수의사 호출 ② CMT 4분방 실시 + 유즙 세균배양 ③ 전신 항생제 투여 시작 ④ 소염제 병용 ⑤ 격리 ⑥ 수액 치료 고려`,
      confidence: Math.min(100, Math.round(65 + (tempAvg - 40.0) * 30 + rumDecline * 40)),
      detectedAt: new Date().toISOString(),
      dataPoints: { tempAvg, tempRise, rumDeclinePct: Math.round(rumDecline * 100), stage: 3 },
    };
  }

  // 2단계: 임상형 유방염 (체온 > 39.4 + 반추 10%↓)
  if (tempAvg > 39.4 && (rumDecline > 0.08 || tempRise > 0.5)) {
    return {
      alarmId: '', alarmSignature: '', animalId: '', earTag: '', animalName: null, farmId: '',
      type: 'mastitis_risk',
      severity: tempAvg > 39.8 ? 'warning' : 'caution',
      title: `🟡 유방염 의심 (체온 ${tempAvg.toFixed(1)}°C${rumDecline > 0.08 ? ` + 반추 ${Math.round(rumDecline*100)}%↓` : ''})`,
      reasoning: `체온 ${tempAvg.toFixed(1)}°C(+${tempRise.toFixed(1)}°C 상승)로 정상범위 초과. ${rumDecline > 0.08 ? `반추 ${Math.round(rumDecline*100)}% 감소 동반. ` : ''}임상형 유방염은 치료 시작이 12시간 늦어질 때마다 회복 기간이 2~3일 연장됩니다. CMT 검사로 조기 확인이 핵심.`,
      actionPlan: `① CMT 4분방 실시 ② 유즙 이상(응고, 혈유) 육안확인 ③ 양성 시 항생제 유방내 주입 ④ 체온 재측정 (6시간 후) ⑤ 착유량 변화 모니터링`,
      confidence: Math.round(50 + (tempAvg - 39.4) * 50 + rumDecline * 30),
      detectedAt: new Date().toISOString(),
      dataPoints: { tempAvg, tempRise, rumDeclinePct: Math.round(rumDecline * 100), stage: 2 },
    };
  }

  // 1단계: 준임상형 의심 (체온 정상 상한 + 반추 소폭 감소)
  // 이것이 핵심 — "전통적 발견은 이미 늦다"를 해결하는 조기 감지
  if (tempAvg > 39.0 && tempRise > 0.3 && rumDecline > 0.05) {
    return {
      alarmId: '', alarmSignature: '', animalId: '', earTag: '', animalName: null, farmId: '',
      type: 'mastitis_risk',
      severity: 'info',
      title: `⚡ 유방염 조기경보 (체온 ${tempAvg.toFixed(1)}°C ↑${tempRise.toFixed(1)}°C, 반추 ${Math.round(rumDecline*100)}%↓)`,
      reasoning: `체온이 정상 상한(39.0°C)에서 +${tempRise.toFixed(1)}°C 상승하고 반추가 ${Math.round(rumDecline*100)}% 소폭 감소했습니다. 아직 눈에 보이는 증상은 없지만, 유방 내 염증이 진행 중일 수 있습니다. 준임상형 유방염은 유량·유질 손실이 이미 시작된 상태이며, 이 시점이 치료 골든타임입니다.`,
      actionPlan: `① CMT 검사 권장 (4분방) ② 양성 시 수의사 상담 ③ 체세포수(SCC) 확인 ④ 12시간 후 재평가`,
      confidence: Math.round(30 + tempRise * 40 + rumDecline * 30),
      detectedAt: new Date().toISOString(),
      dataPoints: { tempAvg, tempRise, rumDeclinePct: Math.round(rumDecline * 100), stage: 1 },
    };
  }

  return null;
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

// ── 유열 (저칼슘혈증) — 분만 직후 24~72시간 ──

export function ruleMilkFever(summary: readonly DailySummary[], animal: AnimalProfile): SovereignAlarm | null {
  const dim = animal.daysInMilk ?? -1;
  // 분만 직후 0~3일만 대상 (lactationStatus가 fresh이거나 DIM 0~3)
  if (dim < 0 || dim > 3) return null;

  const recent2 = summary.slice(0, 2);
  if (recent2.length < 1) return null;

  const tempAvg = avgOf(recent2.map(d => d.tempAvg));
  const actAvg = avgOf(recent2.map(d => d.actAvg));
  const rumAvg = avgOf(recent2.map(d => d.rumAvg));

  // 유열: 저체온 + 활동 급감 + 반추 급감
  if (!tempAvg || tempAvg > 37.8) return null;  // 37.8°C 이하여야 의심
  if (!actAvg || actAvg > 1.5) return null;      // 거의 움직이지 않음

  const severity = tempAvg < 37.0 ? 'critical' as const : 'warning' as const;

  return {
    alarmId: '', alarmSignature: '', animalId: '', earTag: '', animalName: null, farmId: '',
    type: 'milk_fever',
    severity,
    title: `유열(저칼슘혈증) 의심 (DIM ${dim}일, 체온 ${tempAvg.toFixed(1)}°C, 활동 급감)`,
    reasoning: `분만 후 ${dim}일차에 체온 ${tempAvg.toFixed(1)}°C로 저하(정상 38.5~39.2°C)되고 활동량이 ${actAvg.toFixed(1)}(정상 2~4)로 급감했습니다. ${rumAvg ? `반추 ${Math.round(rumAvg)}분/일. ` : ''}유열(저칼슘혈증)은 분만 후 72시간 이내 발생하며, 저체온+근력 저하+기립 곤란이 특징입니다. 응급 치료가 지연되면 기립불능→폐사로 진행합니다.`,
    actionPlan: `① 즉시 글루콘산칼슘 500mL 정맥주사 (천천히, 심장 모니터링) ② 경구 칼슘 보충제 투여 ③ 기립 시도 보조 ④ 체온 재측정 (1시간 후) ⑤ 반응 없으면 수의사 재진`,
    confidence: Math.round(55 + (37.8 - tempAvg) * 30 + (1.5 - actAvg) * 20),
    detectedAt: new Date().toISOString(),
    dataPoints: { tempAvg, actAvg, rumAvg: rumAvg ?? 0, dim },
  };
}

// ── 후산정체 — 분만 후 12~48시간 ──

export function ruleRetainedPlacenta(summary: readonly DailySummary[], animal: AnimalProfile): SovereignAlarm | null {
  const dim = animal.daysInMilk ?? -1;
  if (dim < 0 || dim > 2) return null;  // 분만 후 0~2일

  const recent2 = summary.slice(0, 2);
  const prev3 = summary.slice(2, 5);
  if (recent2.length < 1 || prev3.length < 1) return null;

  const recentTemp = avgOf(recent2.map(d => d.tempAvg));
  const prevTemp = avgOf(prev3.map(d => d.tempAvg));
  const recentRum = avgOf(recent2.map(d => d.rumAvg));
  const prevRum = avgOf(prev3.map(d => d.rumAvg));

  // 후산정체: 분만 후 체온 상승 + 반추 감소 (감염 진행 징후)
  if (!recentTemp || recentTemp < 39.3) return null;
  const tempRise = prevTemp ? recentTemp - prevTemp : 0;
  if (tempRise < 0.3) return null;  // 최소 0.3°C 상승

  const rumDecline = (recentRum && prevRum && prevRum > 0)
    ? (prevRum - recentRum) / prevRum : 0;

  return {
    alarmId: '', alarmSignature: '', animalId: '', earTag: '', animalName: null, farmId: '',
    type: 'retained_placenta',
    severity: recentTemp > 39.8 ? 'warning' as const : 'caution' as const,
    title: `후산정체 의심 (DIM ${dim}일, 체온 ${recentTemp.toFixed(1)}°C ↑${tempRise.toFixed(1)}°C)`,
    reasoning: `분만 후 ${dim}일차에 체온이 ${recentTemp.toFixed(1)}°C로 ${tempRise.toFixed(1)}°C 상승했습니다. ${rumDecline > 0.05 ? `반추도 ${Math.round(rumDecline * 100)}% 감소. ` : ''}정상 분만 시 후산(태반)은 12시간 이내에 배출되며, 24시간 이상 잔류 시 자궁감염 위험이 급증합니다. 분만 후 체온 상승은 후산정체 + 자궁감염 진행의 핵심 지표입니다.`,
    actionPlan: `① 후산 배출 여부 육안 확인 ② 무리한 수동 제거 금지 (자궁 손상 위험) ③ 체온 39.5°C 이상 시 항생제 투여 시작 ④ 수의사 상담 ⑤ 3일 후 재평가`,
    confidence: Math.round(40 + tempRise * 30 + rumDecline * 20),
    detectedAt: new Date().toISOString(),
    dataPoints: { tempAvg: recentTemp, tempRise, rumDeclinePct: Math.round(rumDecline * 100), dim },
  };
}

// ── 기립불능 (Downer Cow) — 분만 직후 ──

export function ruleDownerCow(summary: readonly DailySummary[], animal: AnimalProfile): SovereignAlarm | null {
  const dim = animal.daysInMilk ?? -1;
  if (dim < 0 || dim > 3) return null;

  const recent2 = summary.slice(0, 2);
  if (recent2.length < 1) return null;

  const actAvg = avgOf(recent2.map(d => d.actAvg));
  const tempAvg = avgOf(recent2.map(d => d.tempAvg));

  // 기립불능: 활동 극저 (거의 0) + 저체온
  if (!actAvg || actAvg > 0.8) return null;  // 극저 활동
  if (!tempAvg || tempAvg > 38.0) return null;  // 저체온 동반

  return {
    alarmId: '', alarmSignature: '', animalId: '', earTag: '', animalName: null, farmId: '',
    type: 'downer_cow',
    severity: 'critical',
    title: `기립불능 의심 (DIM ${dim}일, 활동 ${actAvg.toFixed(1)}, 체온 ${tempAvg.toFixed(1)}°C)`,
    reasoning: `분만 후 ${dim}일차에 활동량 ${actAvg.toFixed(1)}(정상 2~4)로 거의 움직이지 않으며 체온 ${tempAvg.toFixed(1)}°C로 저하되었습니다. 기립불능은 유열(저칼슘) 또는 저인혈증, 근육/신경 손상으로 발생하며, 장시간 기립불능 시 근육 괴사(Compartment Syndrome)로 예후가 급격히 나빠집니다. 2시간마다 체위 변경이 필수입니다.`,
    actionPlan: `① 즉시 수의사 호출 ② 칼슘+인+마그네슘 복합 수액 투여 ③ 2시간마다 체위 변경 (좌우 교대) ④ 모래/고무매트 위에 안치 ⑤ 음수+사료 접근 보장 ⑥ 24시간 후에도 기립 불가 시 예후 판단`,
    confidence: Math.round(60 + (0.8 - actAvg) * 30 + (38.0 - tempAvg) * 15),
    detectedAt: new Date().toISOString(),
    dataPoints: { actAvg, tempAvg, dim, parity: animal.parity ?? 0 },
  };
}
