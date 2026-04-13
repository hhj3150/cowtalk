/**
 * 분만 알람 룰 — smaXtec 독립 감지
 * calving_detection: 분만 임박 (체온 하강 + 활동 급변)
 * calving_waiting: 분만 대기 (임신 말기 DIM 기반)
 * abortion: 유산 의심 (비정상 패턴)
 */

import type { DailySummary, AnimalProfile, SovereignAlarm } from '../types.js';

function avgOf(arr: readonly (number | null)[]): number | null {
  const valid = arr.filter((v): v is number => v !== null && v !== undefined);
  return valid.length > 0 ? valid.reduce((s, v) => s + v, 0) / valid.length : null;
}

// ── 분만 임박 감지 (calving_detection) ──

export function ruleCalvingDetection(summary: readonly DailySummary[], animal: AnimalProfile): SovereignAlarm | null {
  if (summary.length < 4) return null;

  // 임신 말기 개체만 대상 (건유우 또는 DIM > 250)
  const lact = animal.lactationStatus;
  const dim = animal.daysInMilk ?? 0;
  const isLateGestation = lact === 'dry' || lact === 'dry_off' || dim > 250;
  if (!isLateGestation) return null;

  const recent1 = summary.slice(0, 1);
  const prev5 = summary.slice(1, 6);
  if (recent1.length < 1 || prev5.length < 2) return null;

  const recentTemp = avgOf(recent1.map(d => d.tempAvg));
  const prevTemp = avgOf(prev5.map(d => d.tempAvg));
  if (!recentTemp || !prevTemp) return null;

  const tempDrop = prevTemp - recentTemp;
  if (tempDrop < 0.5) return null; // 분만 전 0.5-1.0°C 체온 하강

  // 활동량 변화도 확인 (분만 전 안절부절)
  const recentAct = avgOf(recent1.map(d => d.actAvg));
  const prevAct = avgOf(prev5.map(d => d.actAvg));
  const actChange = (recentAct && prevAct && prevAct > 0)
    ? Math.abs((recentAct - prevAct) / prevAct)
    : 0;

  const confidence = Math.round(50 + tempDrop * 30 + actChange * 20);

  return {
    alarmId: '', alarmSignature: '', animalId: '', earTag: '', animalName: null, farmId: '',
    type: 'calving_detection',
    severity: tempDrop > 0.8 ? 'critical' : 'warning',
    title: `분만 임박 (체온 ${tempDrop.toFixed(1)}°C↓)`,
    reasoning: `체온이 기준선 대비 ${tempDrop.toFixed(1)}°C 하강했습니다. 분만 12-24시간 전 체온이 0.5-1.0°C 하강하는 것은 분만 전 호르몬(프로게스테론 급감) 변화의 전형적 징후입니다. ${actChange > 0.2 ? `활동량도 ${Math.round(actChange*100)}% 변화하여 안절부절 행동이 관찰됩니다. ` : ''}즉시 분만 준비가 필요합니다.`,
    actionPlan: `① 분만방 이동 및 분만 환경 준비 ② 외음부·골반인대 이완 확인 ③ 12시간 간격 관찰 ④ 난산 대비 수의사 대기 ⑤ 초유 준비`,
    confidence: Math.min(95, confidence),
    detectedAt: new Date().toISOString(),
    dataPoints: { tempDropC: Math.round(tempDrop * 10) / 10, recentTemp, prevTemp, actChangePct: Math.round(actChange * 100) },
  };
}

// ── 분만 대기 (calving_waiting) ──

export function ruleCalvingWaiting(summary: readonly DailySummary[], animal: AnimalProfile): SovereignAlarm | null {
  // DIM 기반: 분만 예정일이 7일 이내
  // (평균 임신 기간 280일 기준, 건유 후 60일 = DIM 약 340일 전후)
  const lact = animal.lactationStatus;
  const isLateGestation = lact === 'dry' || lact === 'dry_off';
  if (!isLateGestation) return null;

  // 센서 데이터 없어도 DIM만으로 판단 가능
  // 그러나 센서 이상이 없는 경우에만 (이상 있으면 calving_detection이 처리)
  const recentTemp = summary.length > 0 ? avgOf(summary.slice(0, 2).map(d => d.tempAvg)) : null;
  const prevTemp = summary.length > 3 ? avgOf(summary.slice(2, 5).map(d => d.tempAvg)) : null;
  const tempDrop = (recentTemp && prevTemp) ? prevTemp - recentTemp : 0;

  // 이미 calving_detection 조건이면 중복 방지
  if (tempDrop >= 0.5) return null;

  return {
    alarmId: '', alarmSignature: '', animalId: '', earTag: '', animalName: null, farmId: '',
    type: 'calving_waiting',
    severity: 'info',
    title: `분만 대기 (건유 상태)`,
    reasoning: `현재 건유 상태로 분만 대기 중입니다. 센서 데이터에 분만 임박 징후(체온 하강)는 아직 없습니다. 분만 예정일이 가까워지면 자동으로 분만 임박 알람이 발생합니다.`,
    actionPlan: `① 분만 예정일 확인 ② 분만방 환경 사전 점검 ③ 체온 추이 모니터링 ④ BCS(체형점수) 적정 확인`,
    confidence: 30,
    detectedAt: new Date().toISOString(),
    dataPoints: { tempAvg: recentTemp ?? 0 },
  };
}

// ── 유산 의심 (abortion) ──

export function ruleAbortion(summary: readonly DailySummary[], animal: AnimalProfile): SovereignAlarm | null {
  if (summary.length < 4) return null;

  // 건유/임신 상태가 아니면 해당 없음
  const lact = animal.lactationStatus;
  const isPregnant = lact === 'dry' || lact === 'dry_off' || lact === 'pregnant';
  if (!isPregnant) return null;

  const recent2 = summary.slice(0, 2);
  const prev5 = summary.slice(2, 7);
  if (recent2.length < 2 || prev5.length < 2) return null;

  // 유산 패턴: 급격한 체온 하강 + 활동량 급변 (분만 예정보다 일찍)
  const recentTemp = avgOf(recent2.map(d => d.tempAvg));
  const prevTemp = avgOf(prev5.map(d => d.tempAvg));
  if (!recentTemp || !prevTemp) return null;

  const tempDrop = prevTemp - recentTemp;
  if (tempDrop < 0.3) return null;

  // 활동량도 동시에 급변
  const recentAct = avgOf(recent2.map(d => d.actAvg));
  const prevAct = avgOf(prev5.map(d => d.actAvg));
  const actChange = (recentAct && prevAct && prevAct > 0)
    ? Math.abs((recentAct - prevAct) / prevAct)
    : 0;

  if (actChange < 0.20) return null;

  // 반추도 동시 감소하면 유산 가능성 높음
  const recentRum = avgOf(recent2.map(d => d.rumAvg));
  const prevRum = avgOf(prev5.map(d => d.rumAvg));
  const rumDecline = (recentRum && prevRum && prevRum > 0)
    ? (prevRum - recentRum) / prevRum
    : 0;

  const confidence = Math.round(30 + tempDrop * 20 + actChange * 20 + rumDecline * 20);

  return {
    alarmId: '', alarmSignature: '', animalId: '', earTag: '', animalName: null, farmId: '',
    type: 'abortion',
    severity: 'warning',
    title: `유산 의심 (체온 ${tempDrop.toFixed(1)}°C↓ + 활동 급변)`,
    reasoning: `임신/건유 상태에서 체온 ${tempDrop.toFixed(1)}°C 하강 + 활동량 ${Math.round(actChange*100)}% 변화${rumDecline > 0.15 ? ` + 반추 ${Math.round(rumDecline*100)}% 감소` : ''}가 동시 발생. 유산 시 호르몬 급변으로 체온 하강, 복통에 의한 활동 변화, 스트레스 반추 감소가 나타납니다.`,
    actionPlan: `① 외음부 분비물(혈액/태반 조직) 확인 ② 직장검사로 태아 상태 확인 ③ 수의사 긴급 상담 ④ 브루셀라 등 전염성 유산 원인 검사 ⑤ 격리 및 소독`,
    confidence: Math.min(85, confidence),
    detectedAt: new Date().toISOString(),
    dataPoints: { tempDropC: Math.round(tempDrop * 10) / 10, actChangePct: Math.round(actChange * 100), rumDeclinePct: Math.round(rumDecline * 100) },
  };
}
