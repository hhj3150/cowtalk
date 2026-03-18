// v4 Decision Fusion 이식 — 복수 엔진 결과 통합
// 충돌 해결, 우선순위 결정, 최종 severity 판정

import type { AnimalProfile, V4AnalysisSummary, Severity } from '@cowtalk/shared';
import { extractFeatures } from './v4-feature-extractor.js';
import { analyzeEstrus, type EstrusResult } from './v4-estrus.js';
import { analyzeDisease, type DiseaseResult } from './v4-disease.js';
import { analyzePregnancy, type PregnancyResult } from './v4-pregnancy.js';

export interface V4FusionResult {
  readonly analysis: V4AnalysisSummary;
  readonly estrus: EstrusResult;
  readonly disease: DiseaseResult;
  readonly pregnancy: PregnancyResult;
  readonly primaryConcern: string;
  readonly severity: Severity;
  readonly fallbackSummary: string;   // Claude 불가 시 사용할 요약
  readonly fallbackActions: Readonly<Record<string, string>>;
}

export function runV4Analysis(profile: AnimalProfile): V4FusionResult {
  // 1. 특성 추출
  const features = extractFeatures(profile);

  // 2. 개별 엔진 실행
  const estrus = analyzeEstrus(profile, features);
  const disease = analyzeDisease(profile, features);
  const pregnancy = analyzePregnancy(profile, features);

  // 3. 충돌 해결 + 주요 관심사 판정
  const { primaryConcern, severity } = resolvePrimary(estrus, disease, pregnancy, profile);

  // 4. 요약 생성 (fallback용)
  const fallbackSummary = buildFallbackSummary(profile, estrus, disease, pregnancy, primaryConcern);
  const fallbackActions = buildFallbackActions(profile, estrus, disease, pregnancy, primaryConcern);

  // 5. V4AnalysisSummary 구성
  const analysis: V4AnalysisSummary = {
    estrusScore: estrus.score > 0 ? estrus.score : null,
    diseaseRisks: disease.risks,
    pregnancyStability: pregnancy.stabilityScore > 0 ? pregnancy.stabilityScore : null,
    dataQualityScore: features.data_quality_score,
    features: {
      temperature_24h_delta: features.temperature_24h_delta ?? 0,
      activity_24h_delta_pct: features.activity_24h_delta_pct ?? 0,
      rumination_24h_delta_pct: features.rumination_24h_delta_pct ?? 0,
      estrus_evidence_score: features.estrus_evidence_score,
      disease_evidence_score: features.disease_evidence_score,
    },
  };

  return {
    analysis,
    estrus,
    disease,
    pregnancy,
    primaryConcern,
    severity,
    fallbackSummary,
    fallbackActions,
  };
}

function resolvePrimary(
  estrus: EstrusResult,
  disease: DiseaseResult,
  pregnancy: PregnancyResult,
  profile: AnimalProfile,
): { primaryConcern: string; severity: Severity } {
  // 질병 우선 (건강 > 번식)
  if (disease.overallRisk >= 0.5) {
    const topDisease = disease.risks.length > 0 ? disease.risks[0]!.diseaseType : 'health';
    const sev: Severity = disease.overallRisk >= 0.7 ? 'critical'
      : disease.overallRisk >= 0.5 ? 'high'
      : 'medium';
    return { primaryConcern: `disease:${topDisease}`, severity: sev };
  }

  // 발정 감지
  if (estrus.score >= 0.45) {
    // 발정 + 질병 충돌: 체온 상승이 발정인지 질병인지
    if (disease.overallRisk >= 0.3) {
      return { primaryConcern: 'conflict:estrus_vs_disease', severity: 'high' };
    }
    const sev: Severity = estrus.score >= 0.65 ? 'high' : 'medium';
    return { primaryConcern: 'estrus', severity: sev };
  }

  // 임신 불안정
  if (pregnancy.status === 'likely_open' && pregnancy.daysPostInsemination !== null) {
    return { primaryConcern: 'pregnancy:recheck_needed', severity: 'medium' };
  }

  // smaXtec 이벤트 기반
  if (profile.activeEvents.length > 0) {
    const highEvent = profile.activeEvents.find((e) => e.severity === 'high' || e.severity === 'critical');
    if (highEvent) {
      return { primaryConcern: `event:${highEvent.type}`, severity: highEvent.severity };
    }
    return { primaryConcern: `event:${profile.activeEvents[0]!.type}`, severity: 'medium' };
  }

  return { primaryConcern: 'normal', severity: 'low' };
}

function buildFallbackSummary(
  profile: AnimalProfile,
  estrus: EstrusResult,
  disease: DiseaseResult,
  pregnancy: PregnancyResult,
  primaryConcern: string,
): string {
  const parts: string[] = [];

  parts.push(`${profile.earTag} (${profile.breedType === 'dairy' ? '젖소' : '한우'}, ${String(profile.parity)}산)`);

  if (primaryConcern.startsWith('disease:')) {
    const topRisk = disease.risks[0];
    parts.push(`질병 위험: ${topRisk ? topRisk.diseaseType : '미상'} (${String(Math.round(disease.overallRisk * 100))}%)`);
  } else if (primaryConcern === 'estrus') {
    parts.push(`발정 감지 (${String(Math.round(estrus.score * 100))}%, ${estrus.stage})`);
  } else if (primaryConcern.startsWith('pregnancy:')) {
    parts.push(`임신 재검 필요 (안정성 ${String(Math.round(pregnancy.stabilityScore * 100))}%)`);
  } else if (primaryConcern.startsWith('event:')) {
    parts.push(`smaXtec 이벤트: ${primaryConcern.replace('event:', '')}`);
  } else {
    parts.push('현재 특이사항 없음');
  }

  if (profile.latestSensor.temperature !== null) {
    parts.push(`체온 ${String(profile.latestSensor.temperature)}°C`);
  }

  return parts.join(' — ');
}

function buildFallbackActions(
  _profile: AnimalProfile,
  estrus: EstrusResult,
  disease: DiseaseResult,
  pregnancy: PregnancyResult,
  primaryConcern: string,
): Readonly<Record<string, string>> {
  if (primaryConcern.startsWith('disease:')) {
    const topRisk = disease.risks[0];
    return {
      farmer: `${topRisk ? topRisk.diseaseType : '질병'} 의심. 수의사 호출 권고.`,
      veterinarian: `${topRisk ? topRisk.matchingSymptoms.join(', ') : '증상 확인 필요'}. 정밀 검사 권고.`,
      inseminator: '건강 이상 우선 해결 후 번식 관리.',
      government_admin: '건강 이상 모니터링.',
      quarantine_officer: '격리 필요 여부 확인.',
      feed_company: '사료 관련 원인 확인.',
    };
  }

  if (primaryConcern === 'estrus') {
    return {
      farmer: `발정 감지. ${estrus.stage === 'estrus' ? '오늘 교배 추천.' : '교배 준비.'}`,
      veterinarian: '발정 확인. 직장검사 권고.',
      inseminator: `교배 추천. 단계: ${estrus.stage}.`,
      government_admin: '특이사항 없음.',
      quarantine_officer: '특이사항 없음.',
      feed_company: '특이사항 없음.',
    };
  }

  if (primaryConcern.startsWith('pregnancy:')) {
    return {
      farmer: `임신 재검 필요 (안정성 ${String(Math.round(pregnancy.stabilityScore * 100))}%).`,
      veterinarian: `DPI ${String(pregnancy.daysPostInsemination ?? 0)}일. 임신 확인 검사 권고.`,
      inseminator: '재발정 모니터링.',
      government_admin: '특이사항 없음.',
      quarantine_officer: '특이사항 없음.',
      feed_company: '특이사항 없음.',
    };
  }

  return {
    farmer: '현재 특이사항 없음. 정상 관리.',
    veterinarian: '특이사항 없음.',
    inseminator: '특이사항 없음.',
    government_admin: '특이사항 없음.',
    quarantine_officer: '특이사항 없음.',
    feed_company: '특이사항 없음.',
  };
}
