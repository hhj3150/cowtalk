/**
 * 발정 알람 룰 — smaXtec 독립 감지
 * estrus: 활동 급증 + 체온 상승 복합 패턴
 * estrus_dnb: 동일 패턴 + 교배금지 플래그
 *
 * smaXtec의 발정 감지와 독립적으로 동일 패턴을 센서 데이터만으로 감지.
 * breeding-advisor의 정교한 추천과 별개로, 순수 센서 시그니처만 사용.
 */

import type { DailySummary, AnimalProfile, SovereignAlarm } from '../types.js';

const ESTRUS_TEMP_RISE = { min: 0.2, max: 0.5 } as const;

function avgOf(arr: readonly (number | null)[]): number | null {
  const valid = arr.filter((v): v is number => v !== null && v !== undefined);
  return valid.length > 0 ? valid.reduce((s, v) => s + v, 0) / valid.length : null;
}

// ── 발정 감지 (estrus) ──

export function ruleEstrus(summary: readonly DailySummary[], animal: AnimalProfile): SovereignAlarm | null {
  if (summary.length < 4) return null;

  // 비유 상태 확인: dry/heifer 포함 모든 가임 암소 대상
  const recent1 = summary.slice(0, 1);
  const prev5 = summary.slice(1, 6);
  if (recent1.length < 1 || prev5.length < 2) return null;

  const recentAct = avgOf(recent1.map(d => d.actAvg));
  const prevAct = avgOf(prev5.map(d => d.actAvg));
  if (!recentAct || !prevAct || prevAct <= 0) return null;

  const actIncrease = (recentAct - prevAct) / prevAct;
  if (actIncrease < 0.50) return null; // 활동량 50%+ 증가 필수

  // 체온 상승 확인 (0.2-0.5°C)
  const recentTemp = avgOf(recent1.map(d => d.tempAvg));
  const prevTemp = avgOf(prev5.map(d => d.tempAvg));
  const tempRise = (recentTemp && prevTemp) ? recentTemp - prevTemp : 0;

  // 활동량 급증만으로도 발정 의심 가능, 체온 상승 동반 시 확신도 증가
  const hasActivitySignature = actIncrease >= 0.50;
  const hasTemperatureSignature = tempRise >= ESTRUS_TEMP_RISE.min;

  if (!hasActivitySignature) return null;

  const confidence = Math.round(
    40
    + actIncrease * 30
    + (hasTemperatureSignature ? tempRise * 40 : 0),
  );

  const dim = animal.daysInMilk ?? 0;

  return {
    alarmId: '', alarmSignature: '', animalId: '', earTag: '', animalName: null, farmId: '',
    type: 'estrus',
    severity: confidence > 70 ? 'warning' : 'caution',
    title: `발정 의심 (활동 ${Math.round(actIncrease*100)}%↑${hasTemperatureSignature ? ` + 체온 +${tempRise.toFixed(1)}°C` : ''})`,
    reasoning: `활동량이 기준선 대비 ${Math.round(actIncrease*100)}% 급증${hasTemperatureSignature ? `, 체온도 ${tempRise.toFixed(1)}°C 상승` : ''}. 발정 시 활동량 50-300% 증가 + 체온 0.2-0.5°C 상승이 전형적 패턴입니다. DIM ${dim}일. 수정 적기는 발정 시작 후 12-18시간입니다.`,
    actionPlan: `① 발정 징후 육안 확인(승가 허용, 점액, 외음부 부종) ② 수정 적기 계산(발정 시작 후 12-18h) ③ 수정사 연락 ④ 정액 선택 및 준비 ⑤ 수정 기록`,
    confidence: Math.min(95, confidence),
    detectedAt: new Date().toISOString(),
    dataPoints: {
      actIncreasePct: Math.round(actIncrease * 100),
      tempRiseC: Math.round(tempRise * 10) / 10,
      recentAct: Math.round(recentAct),
      dim,
    },
  };
}

// ── 발정(교배금지) 감지 (estrus_dnb) ──

export function ruleEstrusDnb(summary: readonly DailySummary[], animal: AnimalProfile): SovereignAlarm | null {
  // 동일한 발정 패턴이지만 교배금지 상태인 개체
  // lactationStatus가 특정 값이거나 DIM이 너무 낮으면 교배금지
  const dim = animal.daysInMilk ?? 0;
  const isDoNotBreed = dim < 45 || animal.lactationStatus === 'dry_off_recent';

  if (!isDoNotBreed) return null;

  // 발정 패턴 감지 (estrus와 동일 로직)
  if (summary.length < 4) return null;
  const recent1 = summary.slice(0, 1);
  const prev5 = summary.slice(1, 6);
  if (recent1.length < 1 || prev5.length < 2) return null;

  const recentAct = avgOf(recent1.map(d => d.actAvg));
  const prevAct = avgOf(prev5.map(d => d.actAvg));
  if (!recentAct || !prevAct || prevAct <= 0) return null;

  const actIncrease = (recentAct - prevAct) / prevAct;
  if (actIncrease < 0.50) return null;

  return {
    alarmId: '', alarmSignature: '', animalId: '', earTag: '', animalName: null, farmId: '',
    type: 'estrus_dnb',
    severity: 'info',
    title: `발정 감지 — 교배금지 (DIM ${dim}일)`,
    reasoning: `활동량 ${Math.round(actIncrease*100)}% 급증으로 발정 의심되지만 DIM ${dim}일로 교배금지 기간입니다. 번식 주기 기록을 위해 발정 기록은 남기되 수정은 보류합니다.`,
    actionPlan: `① 발정 기록(다음 발정 주기 예측용) ② 수정 보류 사유 기록 ③ 다음 수정 가능 시점 확인`,
    confidence: Math.round(35 + actIncrease * 30),
    detectedAt: new Date().toISOString(),
    dataPoints: { actIncreasePct: Math.round(actIncrease * 100), dim },
  };
}
