/**
 * 복합 건강 알람 룰 — 다중 메트릭 동시 이상
 * health_general: 2/3 메트릭 이상 (중등도)
 * clinical_condition: 3/3 메트릭 심각 이상
 */

import type { DailySummary, AnimalProfile, SovereignAlarm } from '../types.js';

function avgOf(arr: readonly (number | null)[]): number | null {
  const valid = arr.filter((v): v is number => v !== null && v !== undefined);
  return valid.length > 0 ? valid.reduce((s, v) => s + v, 0) / valid.length : null;
}

interface MetricDeviation {
  readonly metric: string;
  readonly deviation: number; // 0-1 정규화된 편차
  readonly description: string;
}

function assessDeviations(summary: readonly DailySummary[]): MetricDeviation[] {
  if (summary.length < 4) return [];

  const recent2 = summary.slice(0, 2);
  const prev5 = summary.slice(2, 7);
  const deviations: MetricDeviation[] = [];

  // 체온 편차
  const recentTemp = avgOf(recent2.map(d => d.tempAvg));
  const prevTemp = avgOf(prev5.map(d => d.tempAvg));
  if (recentTemp && prevTemp) {
    const tempDev = Math.abs(recentTemp - prevTemp);
    if (tempDev > 0.3) {
      deviations.push({
        metric: 'temperature',
        deviation: Math.min(1, tempDev / 1.5),
        description: `체온 ${recentTemp > prevTemp ? '+' : ''}${(recentTemp - prevTemp).toFixed(1)}°C`,
      });
    }
  }

  // 반추 편차
  const recentRum = avgOf(recent2.map(d => d.rumAvg));
  const prevRum = avgOf(prev5.map(d => d.rumAvg));
  if (recentRum && prevRum && prevRum > 0) {
    const rumDev = (prevRum - recentRum) / prevRum;
    if (rumDev > 0.15) {
      deviations.push({
        metric: 'rumination',
        deviation: Math.min(1, rumDev / 0.5),
        description: `반추 ${Math.round(rumDev * 100)}%↓`,
      });
    }
  }

  // 활동량 편차
  const recentAct = avgOf(recent2.map(d => d.actAvg));
  const prevAct = avgOf(prev5.map(d => d.actAvg));
  if (recentAct && prevAct && prevAct > 0) {
    const actDev = Math.abs((prevAct - recentAct) / prevAct);
    if (actDev > 0.20) {
      deviations.push({
        metric: 'activity',
        deviation: Math.min(1, actDev / 0.6),
        description: `활동 ${Math.round(actDev * 100)}%${recentAct < prevAct ? '↓' : '↑'}`,
      });
    }
  }

  return deviations;
}

// ── 종합 건강 경고 (health_general) ──

export function ruleHealthGeneral(summary: readonly DailySummary[], _animal: AnimalProfile): SovereignAlarm | null {
  const devs = assessDeviations(summary);
  if (devs.length < 2) return null; // 최소 2개 메트릭 동시 이상

  // 3개 모두 이상이면 clinical_condition이 처리
  if (devs.length >= 3 && devs.every(d => d.deviation > 0.5)) return null;

  const avgDev = devs.reduce((s, d) => s + d.deviation, 0) / devs.length;
  const descriptions = devs.map(d => d.description).join(', ');

  return {
    alarmId: '', alarmSignature: '', animalId: '', earTag: '', animalName: null, farmId: '',
    type: 'health_general',
    severity: avgDev > 0.6 ? 'warning' : 'caution',
    title: `종합 건강 이상 (${descriptions})`,
    reasoning: `${devs.length}개 메트릭에서 동시 이상 감지: ${descriptions}. 단일 메트릭 변화보다 복수 메트릭 동시 변화가 질병의 더 강한 지표입니다. 조합 패턴에 따라 유방염, 케토시스, 제4위변위, 자궁내막염 등 다양한 질병이 의심됩니다.`,
    actionPlan: `① 전신 임상 검사(체온, 심박, 호흡수, 탈수도) ② 식욕·반추·착유량 종합 확인 ③ 감별진단 의뢰(팅커벨 감별진단 도구 활용) ④ 수의사 진찰 예약`,
    confidence: Math.round(40 + avgDev * 40),
    detectedAt: new Date().toISOString(),
    dataPoints: Object.fromEntries(devs.map(d => [d.metric + 'Dev', Math.round(d.deviation * 100)])),
  };
}

// ── 임상 증상 (clinical_condition) — 3/3 메트릭 심각 이상 ──

export function ruleClinicalCondition(summary: readonly DailySummary[], _animal: AnimalProfile): SovereignAlarm | null {
  const devs = assessDeviations(summary);
  if (devs.length < 3) return null; // 3개 메트릭 모두 이상

  const allSevere = devs.every(d => d.deviation > 0.4);
  if (!allSevere) return null;

  const avgDev = devs.reduce((s, d) => s + d.deviation, 0) / devs.length;
  const descriptions = devs.map(d => d.description).join(', ');

  return {
    alarmId: '', alarmSignature: '', animalId: '', earTag: '', animalName: null, farmId: '',
    type: 'clinical_condition',
    severity: avgDev > 0.7 ? 'critical' : 'warning',
    title: `심각한 임상 증상 (${descriptions})`,
    reasoning: `체온, 반추, 활동량 3개 메트릭 모두에서 심각한 이상 감지: ${descriptions}. 전신성 질환(패혈증, 급성 유방염, 제4위변위, 중증 폐렴) 가능성이 높습니다. 즉시 수의학적 개입이 필요합니다.`,
    actionPlan: `① 즉시 수의사 호출 ② 격리 조치 ③ 활력 징후 집중 모니터링(15분 간격) ④ 수액 치료 준비 ⑤ 착유 중단 고려`,
    confidence: Math.round(60 + avgDev * 30),
    detectedAt: new Date().toISOString(),
    dataPoints: Object.fromEntries(devs.map(d => [d.metric + 'Dev', Math.round(d.deviation * 100)])),
  };
}
