// XAI 설명 빌더 — AnimalInterpretation → AIExplanation 변환
// AI 판단을 심사위원이 이해할 수 있는 구조로 변환

import type { AnimalInterpretation, FarmInterpretation } from '@cowtalk/shared';
import type {
  AnimalAIExplanation,
  FarmAIExplanation,
  ContributingFactor,
  ConfidenceLevel,
  DataSource,
} from './explanation-schema.js';

// ─── 신호 → 기여요인 변환 ────────────────────────────────────────────────────

function signalToFactor(signal: string): ContributingFactor {
  const isNegative = signal.includes('감소') || signal.includes('낮') || signal.includes('임신 확인');

  let source: DataSource = 'claude_llm';
  if (signal.startsWith('smaXtec')) source = 'smaxtec_event';
  else if (signal.includes('체온') || signal.includes('반추') || signal.includes('활동')) source = 'smaxtec_sensor';
  else if (signal.includes('v4') || signal.includes('룰')) source = 'v4_rule';
  else if (signal.includes('이력') || signal.includes('DHI')) source = 'public_data';

  return {
    name: signal,
    direction: isNegative ? 'negative' : 'positive',
    weight: 0.5, // 기본 가중치 — 실제는 v4 분석에서 정밀하게 계산
    source,
  };
}

function confidenceScoreFromLevel(level: 'high' | 'medium' | 'low'): number {
  return level === 'high' ? 0.85 : level === 'medium' ? 0.6 : 0.35;
}

function detectDataSources(
  interpretation: AnimalInterpretation,
): readonly DataSource[] {
  const sources = new Set<DataSource>();

  if (interpretation.source === 'claude') sources.add('claude_llm');
  if (interpretation.v4Analysis) sources.add('v4_rule');

  // 신호에서 출처 추론
  for (const signal of interpretation.interpretation.reasoning?.split('.') ?? []) {
    if (signal.includes('smaXtec') && signal.includes('이벤트')) sources.add('smaxtec_event');
    else if (signal.includes('smaXtec') || signal.includes('센서')) sources.add('smaxtec_sensor');
    else if (signal.includes('이력제') || signal.includes('공공')) sources.add('public_data');
  }

  if (sources.size === 0) sources.add('claude_llm');
  return Array.from(sources);
}

// ─── 공개 API ────────────────────────────────────────────────────────────────

export function buildAnimalExplanation(
  interpretation: AnimalInterpretation,
): AnimalAIExplanation {
  const confidenceLevel = interpretation.interpretation.confidence as ConfidenceLevel;
  const confidenceScore = confidenceScoreFromLevel(confidenceLevel);

  const v4Signals: readonly string[] = interpretation.v4Analysis
    ? [
        ...((interpretation.v4Analysis as { estrus?: { signals?: string[] } }).estrus?.signals ?? []),
        ...((interpretation.v4Analysis as { disease?: { signals?: string[] } }).disease?.signals ?? []),
        ...((interpretation.v4Analysis as { pregnancy?: { signals?: string[] } }).pregnancy?.signals ?? []),
      ]
    : [];

  const allSignals = [...v4Signals];
  const factors: ContributingFactor[] = allSignals
    .filter((s) => s.trim().length > 0)
    .slice(0, 8)
    .map(signalToFactor);

  const recommendedActions = Object.values(interpretation.actions).filter(
    (a) => a && a !== '특이사항 없음.',
  );

  return {
    animalId: interpretation.animalId,
    earTag: interpretation.earTag,
    summary: interpretation.summary,
    primaryDecision: interpretation.interpretation.primary,
    confidence: confidenceLevel,
    confidenceScore,
    contributingFactors: factors,
    dataSources: detectDataSources(interpretation),
    limitations: confidenceLevel === 'low'
      ? '센서 데이터 부족 또는 비정형 패턴으로 신뢰도가 낮습니다. 수의사 직접 확인을 권장합니다.'
      : undefined,
    v4Assisted: Boolean(interpretation.v4Analysis),
    claudeUsed: interpretation.source === 'claude',
    processingTimeMs: interpretation.processingTimeMs,
    analyzedAt: interpretation.timestamp.toISOString(),
    recommendedActions: recommendedActions.slice(0, 3),
  };
}

export function buildFarmExplanation(
  interpretation: FarmInterpretation,
): FarmAIExplanation {
  const factors: ContributingFactor[] = interpretation.animalHighlights
    .slice(0, 5)
    .map((h) => ({
      name: `${h.earTag}번: ${h.issue}`,
      direction: 'positive' as const,
      weight: h.severity === 'critical' ? 1.0 : h.severity === 'high' ? 0.75 : 0.5,
      source: 'smaxtec_event' as DataSource,
    }));

  return {
    farmId: interpretation.farmId,
    farmName: interpretation.farmName,
    summary: interpretation.summary,
    issueCount: interpretation.animalHighlights.length,
    healthScore: interpretation.healthScore,
    confidence: 'medium',
    confidenceScore: 0.7,
    contributingFactors: factors,
    dataSources: ['smaxtec_event', 'smaxtec_sensor', 'claude_llm'],
    v4Assisted: false,
    claudeUsed: interpretation.source === 'claude',
    processingTimeMs: interpretation.processingTimeMs,
    analyzedAt: interpretation.timestamp.toISOString(),
  };
}
