// v4 질병 경고 엔진 이식 (fallback + 보조 분석)
// 패턴 매칭 기반 질병 의심 점수 계산

import type { AnimalProfile, V4DiseaseRisk } from '@cowtalk/shared';
import { DISEASE_MIN_SCORES } from '@cowtalk/shared';
import type { ExtractedFeatures } from './v4-feature-extractor.js';

export interface DiseaseResult {
  readonly overallRisk: number;           // 0-1
  readonly risks: readonly V4DiseaseRisk[];
  readonly urgencyHours: number | null;
  readonly signals: readonly string[];
}

export function analyzeDisease(
  profile: AnimalProfile,
  features: ExtractedFeatures,
): DiseaseResult {
  const signals: string[] = [];
  const risks: V4DiseaseRisk[] = [];

  // 각 질병 패턴 평가
  const mastitis = checkMastitis(profile, features, signals);
  if (mastitis.score >= DISEASE_MIN_SCORES.mastitis) risks.push(mastitis);

  const ketosis = checkKetosis(profile, features, signals);
  if (ketosis.score >= DISEASE_MIN_SCORES.ketosis) risks.push(ketosis);

  const acidosis = checkAcidosis(features, signals);
  if (acidosis.score >= DISEASE_MIN_SCORES.acidosis) risks.push(acidosis);

  const pneumonia = checkPneumonia(features, signals);
  if (pneumonia.score >= DISEASE_MIN_SCORES.pneumonia) risks.push(pneumonia);

  // smaXtec 건강 이벤트 보강
  const healthEvents = profile.activeEvents.filter((e) => e.type === 'health_warning');
  for (const evt of healthEvents) {
    signals.push(`smaXtec 건강 경고 (신뢰도 ${String(Math.round(evt.confidence * 100))}%)`);
  }

  // 전체 위험도
  const overallRisk = risks.length > 0
    ? Math.min(Math.max(...risks.map((r) => r.score)) / 100, 1)
    : 0;

  // 긴급도
  const urgencyHours = overallRisk >= 0.7 ? 2
    : overallRisk >= 0.5 ? 6
    : overallRisk >= 0.3 ? 12
    : null;

  return { overallRisk, risks, urgencyHours, signals };
}

// ===========================
// 유방염 패턴 (v4 이식)
// ===========================

function checkMastitis(
  profile: AnimalProfile,
  features: ExtractedFeatures,
  signals: string[],
): V4DiseaseRisk {
  let score = 0;
  const symptoms: string[] = [];

  // 체온 상승
  if (features.temperature_current !== null && features.temperature_current >= 39.5) {
    score += 20;
    symptoms.push('체온 상승');
  }

  // 반추 감소
  if (features.rumination_24h_delta_pct !== null && features.rumination_24h_delta_pct < -20) {
    score += 15;
    symptoms.push('반추 감소');
  }

  // 활동 감소
  if (features.activity_24h_delta_pct !== null && features.activity_24h_delta_pct < -20) {
    score += 10;
    symptoms.push('활동 감소');
  }

  // 높은 체세포수 (젖소)
  if (profile.breedType === 'dairy' && profile.production?.scc !== null) {
    const scc = profile.production?.scc ?? 0;
    if (scc > 400) {
      score += 30;
      symptoms.push(`SCC ${String(scc)}천/ml`);
    } else if (scc > 200) {
      score += 15;
      symptoms.push(`SCC ${String(scc)}천/ml (주의)`);
    }
  }

  // 건강 이력에 유방염 기록
  const mastitisHistory = profile.healthHistory.some((h) =>
    h.diagnosis.includes('유방염') || h.diagnosis.toLowerCase().includes('mastitis'),
  );
  if (mastitisHistory) {
    score += 10;
    symptoms.push('유방염 이력');
  }

  if (symptoms.length > 0) {
    signals.push(`유방염 의심: ${symptoms.join(', ')}`);
  }

  return { diseaseType: 'mastitis', score, matchingSymptoms: symptoms };
}

// ===========================
// 케토시스 패턴 (v4 이식)
// ===========================

function checkKetosis(
  profile: AnimalProfile,
  features: ExtractedFeatures,
  signals: string[],
): V4DiseaseRisk {
  let score = 0;
  const symptoms: string[] = [];

  // 비유 초기 위험 (젖소, DIM 0~60일 추정)
  if (profile.breedType === 'dairy' && profile.parity >= 2) {
    score += 10;
    symptoms.push('고산차 젖소');
  }

  // 반추 급감
  if (features.rumination_24h_delta_pct !== null && features.rumination_24h_delta_pct < -30) {
    score += 25;
    symptoms.push('반추 급감');
  }

  // 음수 감소
  if (features.water_intake_24h_delta_pct !== null && features.water_intake_24h_delta_pct < -25) {
    score += 15;
    symptoms.push('음수 감소');
  }

  // 활동 감소
  if (features.activity_24h_delta_pct !== null && features.activity_24h_delta_pct < -30) {
    score += 15;
    symptoms.push('활동 감소');
  }

  if (symptoms.length > 0) {
    signals.push(`케토시스 의심: ${symptoms.join(', ')}`);
  }

  return { diseaseType: 'ketosis', score, matchingSymptoms: symptoms };
}

// ===========================
// 산독증 패턴 (v4 이식)
// ===========================

function checkAcidosis(
  features: ExtractedFeatures,
  signals: string[],
): V4DiseaseRisk {
  let score = 0;
  const symptoms: string[] = [];

  // pH 낮음
  if (features.ph_current !== null) {
    if (features.ph_current <= 5.5) {
      score += 40;
      symptoms.push(`pH ${String(features.ph_current)} (위험)`);
    } else if (features.ph_current <= 6.0) {
      score += 20;
      symptoms.push(`pH ${String(features.ph_current)} (주의)`);
    }
  }

  // 반추 감소
  if (features.rumination_24h_delta_pct !== null && features.rumination_24h_delta_pct < -25) {
    score += 20;
    symptoms.push('반추 감소');
  }

  // 음수 증가 (보상 음수)
  if (features.water_intake_24h_delta_pct !== null && features.water_intake_24h_delta_pct > 30) {
    score += 10;
    symptoms.push('음수 증가 (보상)');
  }

  if (symptoms.length > 0) {
    signals.push(`산독증 의심: ${symptoms.join(', ')}`);
  }

  return { diseaseType: 'acidosis', score, matchingSymptoms: symptoms };
}

// ===========================
// 폐렴 패턴 (v4 이식)
// ===========================

function checkPneumonia(
  features: ExtractedFeatures,
  signals: string[],
): V4DiseaseRisk {
  let score = 0;
  const symptoms: string[] = [];

  // 고열
  if (features.temperature_current !== null && features.temperature_current >= 40.0) {
    score += 30;
    symptoms.push('고열');
  }

  // 활동 급감
  if (features.activity_24h_delta_pct !== null && features.activity_24h_delta_pct < -40) {
    score += 20;
    symptoms.push('활동 급감');
  }

  // 반추 급감
  if (features.rumination_24h_delta_pct !== null && features.rumination_24h_delta_pct < -30) {
    score += 15;
    symptoms.push('반추 급감');
  }

  if (symptoms.length > 0) {
    signals.push(`폐렴 의심: ${symptoms.join(', ')}`);
  }

  return { diseaseType: 'pneumonia', score, matchingSymptoms: symptoms };
}
