/**
 * 체온 알람 룰 — smaXtec 독립 감지
 * temperature_high, temperature_low, temperature_warning
 */

import type { DailySummary, AnimalProfile, SovereignAlarm } from '../types.js';

function avgOf(arr: readonly (number | null)[]): number | null {
  const valid = arr.filter((v): v is number => v !== null && v !== undefined);
  return valid.length > 0 ? valid.reduce((s, v) => s + v, 0) / valid.length : null;
}

// ── 고열 (temperature_high) ──

export function ruleTemperatureHigh(summary: readonly DailySummary[], _animal: AnimalProfile): SovereignAlarm | null {
  const recent2 = summary.slice(0, 2);
  if (recent2.length < 1) return null;

  const highDays = recent2.filter(d => d.tempAvg && d.tempAvg > 39.5);
  if (highDays.length === 0) return null;

  const tempAvg = avgOf(highDays.map(d => d.tempAvg))!;
  const severity = tempAvg > 40.5 ? 'critical' as const
    : tempAvg > 40.0 ? 'warning' as const
    : 'caution' as const;

  return {
    alarmId: '', alarmSignature: '', animalId: '', earTag: '', animalName: null, farmId: '',
    type: 'temperature_high',
    severity,
    title: `고열 감지 (${tempAvg.toFixed(1)}°C)`,
    reasoning: `최근 ${highDays.length}일 체온 ${tempAvg.toFixed(1)}°C로 정상범위(38.5-39.3°C) 초과. 감염성 질환(유방염, 폐렴, 자궁내막염), 열사병, 또는 백신 접종 후 발열 가능성. 39.5°C 이상은 즉시 원인 감별이 필요합니다.`,
    actionPlan: `① 직장 체온 재확인 ② 임상 증상 관찰(식욕, 반추, 유즙 이상) ③ 감별진단(CMT, 호흡수, 자궁 분비물) ④ 항생제/소염제 투여 판단 ⑤ 격리 및 모니터링`,
    confidence: Math.round(60 + (tempAvg - 39.5) * 40),
    detectedAt: new Date().toISOString(),
    dataPoints: { tempAvg, highDays: highDays.length },
  };
}

// ── 저체온 (temperature_low) ──

export function ruleTemperatureLow(summary: readonly DailySummary[], _animal: AnimalProfile): SovereignAlarm | null {
  const recent2 = summary.slice(0, 2);
  if (recent2.length < 1) return null;

  const lowDays = recent2.filter(d => d.tempAvg && d.tempAvg < 37.5);
  if (lowDays.length === 0) return null;

  const tempAvg = avgOf(lowDays.map(d => d.tempAvg))!;
  const severity = tempAvg < 36.5 ? 'critical' as const
    : tempAvg < 37.0 ? 'warning' as const
    : 'caution' as const;

  return {
    alarmId: '', alarmSignature: '', animalId: '', earTag: '', animalName: null, farmId: '',
    type: 'temperature_low',
    severity,
    title: `저체온 감지 (${tempAvg.toFixed(1)}°C)`,
    reasoning: `체온 ${tempAvg.toFixed(1)}°C로 정상범위(38.5-39.3°C) 미만. 저체온은 쇼크(출혈, 패혈증), 심한 탈수, 분만 직전 체온 강하, 또는 센서 이상 가능성. 분만 예정 개체라면 24시간 이내 분만 신호일 수 있습니다.`,
    actionPlan: `① 분만 예정 여부 확인 (예정이면 분만 준비) ② 쇼크 증상 확인(점막 창백, 심박 증가) ③ 보온 조치 ④ 탈수 평가 및 수액 치료 ⑤ 수의사 긴급 상담`,
    confidence: Math.round(50 + (37.5 - tempAvg) * 40),
    detectedAt: new Date().toISOString(),
    dataPoints: { tempAvg, lowDays: lowDays.length },
  };
}

// ── 체온 편차 경고 (temperature_warning) ──

export function ruleTemperatureWarning(summary: readonly DailySummary[], _animal: AnimalProfile): SovereignAlarm | null {
  if (summary.length < 5) return null;

  const recent2 = summary.slice(0, 2);
  const baseline5 = summary.slice(2, 7);

  const recentTemp = avgOf(recent2.map(d => d.tempAvg));
  const baselineTemp = avgOf(baseline5.map(d => d.tempAvg));
  if (!recentTemp || !baselineTemp) return null;

  const deviation = Math.abs(recentTemp - baselineTemp);
  if (deviation < 0.5) return null;

  // 이미 temperature_high/low에 해당하면 중복 방지
  if (recentTemp > 39.5 || recentTemp < 37.5) return null;

  const direction = recentTemp > baselineTemp ? '상승' : '하강';

  return {
    alarmId: '', alarmSignature: '', animalId: '', earTag: '', animalName: null, farmId: '',
    type: 'temperature_warning',
    severity: deviation > 0.8 ? 'warning' : 'caution',
    title: `체온 추세 ${direction} (기준선 대비 ${deviation.toFixed(1)}°C)`,
    reasoning: `최근 2일 체온(${recentTemp.toFixed(1)}°C)이 이전 5일 기준선(${baselineTemp.toFixed(1)}°C) 대비 ${deviation.toFixed(1)}°C ${direction}. 정상범위 내이지만 개체별 기준선에서 벗어나고 있어 건강 변화 초기 신호일 수 있습니다.`,
    actionPlan: `① 체온 추이 24시간 추가 모니터링 ② 식욕·반추·활동량 변화 관찰 ③ 다른 임상 증상 여부 확인 ④ 환경 변화(사육환경, 기온) 확인`,
    confidence: Math.round(30 + deviation * 40),
    detectedAt: new Date().toISOString(),
    dataPoints: { recentTemp, baselineTemp, deviationC: Math.round(deviation * 10) / 10 },
  };
}
