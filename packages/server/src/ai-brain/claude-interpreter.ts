// Claude AI 해석 엔진 — CowTalk의 두뇌
// 프로파일 → Claude API → 역할별 해석 + 액션
// 실패 시 v4 룰 엔진 fallback

import type {
  AnimalProfile, FarmProfile, RegionalProfile,
  Role, Severity,
  AnimalInterpretation, FarmInterpretation,
  RegionalInterpretation, TenantInterpretation,
  InterpretationSource,
  PriorityAction, AnimalHighlight,
  ClusterInterpretation, FarmRanking,
  ScheduleItem, UrgentCase,
  EpidemicInterpretation, FarmProximityRisk,
} from '@cowtalk/shared';
import { callClaudeForAnalysis } from './claude-client.js';
import { buildAnimalPrompt } from './prompts/animal-prompt.js';
import { buildFarmPrompt } from './prompts/farm-prompt.js';
import { buildRegionalPrompt } from './prompts/regional-prompt.js';
import { buildEpidemicPrompt } from './prompts/epidemic-prompt.js';
import { runV4Analysis, type V4FusionResult } from './v4-engines/index.js';
import type { DetectedCluster } from '../epidemic/cluster-detector.js';
import { logger } from '../lib/logger.js';

// ===========================
// interpretAnimal
// ===========================

export async function interpretAnimal(
  profile: AnimalProfile,
  role: Role,
): Promise<AnimalInterpretation> {
  const startTime = Date.now();

  // 1. v4 보조 분석 (항상 실행 — 빠르고 로컬)
  const v4Result = runV4Analysis(profile);

  // 2. Claude API 해석
  const prompt = buildAnimalPrompt(profile, role, v4Result.analysis);
  const claudeResult = await callClaudeForAnalysis(prompt);

  if (claudeResult) {
    // Claude 성공
    return mapClaudeToAnimalInterpretation(
      profile,
      claudeResult.parsed,
      claudeResult.model,
      Date.now() - startTime,
      'claude',
      v4Result,
    );
  }

  // 3. fallback: v4 결과로 해석 생성
  logger.warn({ animalId: profile.animalId }, 'Claude unavailable — using v4 fallback');
  return buildV4FallbackAnimalInterpretation(profile, v4Result, Date.now() - startTime);
}

// ===========================
// interpretFarm
// ===========================

export async function interpretFarm(
  profile: FarmProfile,
  role: Role,
): Promise<FarmInterpretation> {
  const startTime = Date.now();

  const prompt = buildFarmPrompt(profile, role);
  const claudeResult = await callClaudeForAnalysis(prompt);

  if (claudeResult) {
    return mapClaudeToFarmInterpretation(
      profile,
      claudeResult.parsed,
      claudeResult.model,
      Date.now() - startTime,
      'claude',
    );
  }

  logger.warn({ farmId: profile.farmId }, 'Claude unavailable — using v4 farm fallback');
  return buildV4FallbackFarmInterpretation(profile, Date.now() - startTime);
}

// ===========================
// interpretRegion
// ===========================

export async function interpretRegion(
  profile: RegionalProfile,
  role: Role,
): Promise<RegionalInterpretation> {
  const startTime = Date.now();

  const prompt = buildRegionalPrompt(profile, role);
  const claudeResult = await callClaudeForAnalysis(prompt);

  if (claudeResult) {
    return mapClaudeToRegionalInterpretation(
      profile,
      claudeResult.parsed,
      claudeResult.model,
      Date.now() - startTime,
      'claude',
    );
  }

  logger.warn({ regionId: profile.regionId }, 'Claude unavailable — using v4 regional fallback');
  return buildV4FallbackRegionalInterpretation(profile, Date.now() - startTime);
}

// ===========================
// interpretTenant
// ===========================

export async function interpretTenant(
  profile: RegionalProfile,
  role: Role,
): Promise<TenantInterpretation> {
  const startTime = Date.now();

  const prompt = buildRegionalPrompt(profile, role);
  const claudeResult = await callClaudeForAnalysis(prompt);

  const source: InterpretationSource = claudeResult ? 'claude' : 'v4_fallback';
  const parsed = claudeResult?.parsed ?? {};

  return {
    tenantId: profile.tenantId ?? '',
    timestamp: new Date(),
    source,
    summary: asString(parsed.summary) || profile.summary,
    todaySchedule: parseScheduleItems(parsed.farm_rankings),
    urgentCases: parseUrgentCases(parsed.animal_highlights),
    farmPriorities: parseFarmRankings(parsed.farm_rankings, profile),
    risks: asStringArray(parsed.risks),
    actions: parseActions(parsed.actions),
    dataReferences: asStringArray(parsed.data_references),
    severity: asSeverity(parsed.severity) || 'low',
    modelVersion: claudeResult?.model ?? 'v4-fallback',
    processingTimeMs: Date.now() - startTime,
  };
}

// ===========================
// Claude → AnimalInterpretation 매핑
// ===========================

function mapClaudeToAnimalInterpretation(
  profile: AnimalProfile,
  parsed: Record<string, unknown>,
  model: string,
  processingTimeMs: number,
  source: InterpretationSource,
  v4Result: V4FusionResult,
): AnimalInterpretation {
  const interpretation = parsed.interpretation as Record<string, unknown> | undefined;

  return {
    animalId: profile.animalId,
    earTag: profile.earTag,
    timestamp: new Date(),
    source,
    summary: asString(parsed.summary) || v4Result.fallbackSummary,
    interpretation: {
      primary: asString(interpretation?.primary) || v4Result.primaryConcern,
      secondary: asString(interpretation?.secondary) || '',
      confidence: asConfidence(interpretation?.confidence),
      reasoning: asString(interpretation?.reasoning) || '',
    },
    risks: asStringArray(parsed.risks),
    actions: parseActions(parsed.actions),
    dataReferences: asStringArray(parsed.data_references),
    severity: asSeverity(parsed.severity) || v4Result.severity,
    confidence: asConfidence(interpretation?.confidence),
    modelVersion: model,
    processingTimeMs,
    v4Analysis: v4Result.analysis,
  };
}

function buildV4FallbackAnimalInterpretation(
  profile: AnimalProfile,
  v4Result: V4FusionResult,
  processingTimeMs: number,
): AnimalInterpretation {
  return {
    animalId: profile.animalId,
    earTag: profile.earTag,
    timestamp: new Date(),
    source: 'v4_fallback',
    summary: v4Result.fallbackSummary,
    interpretation: {
      primary: v4Result.primaryConcern,
      secondary: '',
      confidence: v4Result.estrus.confidence,
      reasoning: [...v4Result.estrus.signals, ...v4Result.disease.signals, ...v4Result.pregnancy.signals].join('. '),
    },
    risks: v4Result.disease.signals.filter((s) => s.includes('의심')),
    actions: v4Result.fallbackActions as Record<Role, string>,
    dataReferences: buildV4DataReferences(profile),
    severity: v4Result.severity,
    confidence: v4Result.estrus.confidence,
    modelVersion: 'v4-rule-engine',
    processingTimeMs,
    v4Analysis: v4Result.analysis,
  };
}

// ===========================
// Claude → FarmInterpretation 매핑
// ===========================

function mapClaudeToFarmInterpretation(
  profile: FarmProfile,
  parsed: Record<string, unknown>,
  model: string,
  processingTimeMs: number,
  source: InterpretationSource,
): FarmInterpretation {
  return {
    farmId: profile.farmId,
    farmName: profile.name,
    timestamp: new Date(),
    source,
    summary: asString(parsed.summary) || `${profile.name}: ${String(profile.totalAnimals)}두`,
    healthScore: asNumber(parsed.health_score),
    todayPriorities: parsePriorityActions(parsed.today_priorities),
    animalHighlights: parseAnimalHighlights(parsed.animal_highlights),
    risks: asStringArray(parsed.risks),
    actions: parseActions(parsed.actions),
    dataReferences: asStringArray(parsed.data_references),
    severity: asSeverity(parsed.severity) || 'low',
    modelVersion: model,
    processingTimeMs,
  };
}

function buildV4FallbackFarmInterpretation(
  profile: FarmProfile,
  processingTimeMs: number,
): FarmInterpretation {
  const highlights: AnimalHighlight[] = profile.animalProfiles
    .filter((a) => a.activeEvents.length > 0)
    .slice(0, 10)
    .map((a) => ({
      animalId: a.animalId,
      earTag: a.earTag,
      issue: a.activeEvents.map((e) => e.type).join(', '),
      severity: a.activeEvents[0]?.severity ?? 'low',
      suggestedAction: '상세 확인 필요',
    }));

  return {
    farmId: profile.farmId,
    farmName: profile.name,
    timestamp: new Date(),
    source: 'v4_fallback',
    summary: `${profile.name}: ${String(profile.totalAnimals)}두, 활성 이벤트 ${String(profile.activeSmaxtecEvents.length)}건`,
    healthScore: null,
    todayPriorities: [],
    animalHighlights: highlights,
    risks: [],
    actions: {
      farmer: `활성 이벤트 ${String(profile.activeSmaxtecEvents.length)}건 확인 필요.`,
      veterinarian: '이벤트 상세 확인.',
      inseminator: '특이사항 없음.',
      government_admin: '특이사항 없음.',
      quarantine_officer: '특이사항 없음.',
      feed_company: '특이사항 없음.',
    },
    dataReferences: [],
    severity: profile.activeSmaxtecEvents.length > 0 ? 'medium' : 'low',
    modelVersion: 'v4-fallback',
    processingTimeMs,
  };
}

// ===========================
// Claude → RegionalInterpretation 매핑
// ===========================

function mapClaudeToRegionalInterpretation(
  profile: RegionalProfile,
  parsed: Record<string, unknown>,
  model: string,
  processingTimeMs: number,
  source: InterpretationSource,
): RegionalInterpretation {
  return {
    regionId: profile.regionId,
    tenantId: profile.tenantId,
    timestamp: new Date(),
    source,
    summary: asString(parsed.summary) || profile.summary,
    clusterAnalysis: parseClusterAnalysis(parsed.cluster_analysis),
    farmRankings: parseFarmRankings(parsed.farm_rankings, profile),
    risks: asStringArray(parsed.risks),
    actions: parseActions(parsed.actions),
    dataReferences: asStringArray(parsed.data_references),
    severity: asSeverity(parsed.severity) || 'low',
    modelVersion: model,
    processingTimeMs,
  };
}

function buildV4FallbackRegionalInterpretation(
  profile: RegionalProfile,
  processingTimeMs: number,
): RegionalInterpretation {
  return {
    regionId: profile.regionId,
    tenantId: profile.tenantId,
    timestamp: new Date(),
    source: 'v4_fallback',
    summary: profile.summary,
    clusterAnalysis: [],
    farmRankings: profile.farms.map((f) => ({
      farmId: f.farmId,
      farmName: f.name,
      urgencyScore: f.activeAlerts * 10,
      mainIssue: f.activeAlerts > 0 ? `활성 알림 ${String(f.activeAlerts)}건` : '정상',
    })),
    risks: [],
    actions: {
      farmer: '정상 관리.',
      veterinarian: '특이사항 없음.',
      inseminator: '특이사항 없음.',
      government_admin: `${String(profile.farms.length)}개 농장, ${String(profile.totalAnimals)}두 정상 운영.`,
      quarantine_officer: '특이사항 없음.',
      feed_company: '특이사항 없음.',
    },
    dataReferences: [],
    severity: profile.activeAlerts > 5 ? 'medium' : 'low',
    modelVersion: 'v4-fallback',
    processingTimeMs,
  };
}

// ===========================
// 파싱 헬퍼
// ===========================

function asString(val: unknown): string {
  return typeof val === 'string' ? val : '';
}

function asNumber(val: unknown): number | null {
  return typeof val === 'number' ? val : null;
}

function asStringArray(val: unknown): readonly string[] {
  return Array.isArray(val) ? val.filter((v): v is string => typeof v === 'string') : [];
}

function asSeverity(val: unknown): Severity | null {
  const valid: Severity[] = ['low', 'medium', 'high', 'critical'];
  return valid.includes(val as Severity) ? (val as Severity) : null;
}

function asConfidence(val: unknown): 'high' | 'medium' | 'low' {
  const valid = ['high', 'medium', 'low'];
  return valid.includes(val as string) ? (val as 'high' | 'medium' | 'low') : 'medium';
}

function parseActions(val: unknown): Record<Role, string> {
  const defaults: Record<Role, string> = {
    farmer: '특이사항 없음.',
    veterinarian: '특이사항 없음.',
    inseminator: '특이사항 없음.',
    government_admin: '특이사항 없음.',
    quarantine_officer: '특이사항 없음.',
    feed_company: '특이사항 없음.',
  };

  if (typeof val !== 'object' || val === null) return defaults;

  const obj = val as Record<string, unknown>;
  return {
    farmer: asString(obj.farmer) || defaults.farmer,
    veterinarian: asString(obj.veterinarian) || defaults.veterinarian,
    inseminator: asString(obj.inseminator) || defaults.inseminator,
    government_admin: asString(obj.government_admin) || defaults.government_admin,
    quarantine_officer: asString(obj.quarantine_officer) || defaults.quarantine_officer,
    feed_company: asString(obj.feed_company) || defaults.feed_company,
  };
}

function parsePriorityActions(val: unknown): readonly PriorityAction[] {
  if (!Array.isArray(val)) return [];
  return val.slice(0, 10).map((item, i) => {
    const obj = (typeof item === 'object' && item !== null ? item : {}) as Record<string, unknown>;
    return {
      priority: typeof obj.priority === 'number' ? obj.priority : i + 1,
      action: asString(obj.action),
      target: asString(obj.target),
      urgency: asSeverity(obj.urgency) || 'medium',
      reasoning: asString(obj.reasoning),
    };
  });
}

function parseAnimalHighlights(val: unknown): readonly AnimalHighlight[] {
  if (!Array.isArray(val)) return [];
  return val.slice(0, 20).map((item) => {
    const obj = (typeof item === 'object' && item !== null ? item : {}) as Record<string, unknown>;
    return {
      animalId: asString(obj.animal_id),
      earTag: asString(obj.ear_tag),
      issue: asString(obj.issue),
      severity: asSeverity(obj.severity) || 'medium',
      suggestedAction: asString(obj.suggested_action),
    };
  });
}

function parseClusterAnalysis(val: unknown): readonly ClusterInterpretation[] {
  if (!Array.isArray(val)) return [];
  return val.slice(0, 10).map((item) => {
    const obj = (typeof item === 'object' && item !== null ? item : {}) as Record<string, unknown>;
    return {
      signalType: asString(obj.signal_type),
      affectedFarms: asStringArray(obj.affected_farms),
      interpretation: asString(obj.interpretation),
      severity: asSeverity(obj.severity) || 'medium',
      recommendation: asString(obj.recommendation),
    };
  });
}

function parseFarmRankings(val: unknown, profile: RegionalProfile): readonly FarmRanking[] {
  if (Array.isArray(val) && val.length > 0) {
    return val.slice(0, 20).map((item) => {
      const obj = (typeof item === 'object' && item !== null ? item : {}) as Record<string, unknown>;
      return {
        farmId: asString(obj.farm_id),
        farmName: asString(obj.farm_name),
        urgencyScore: typeof obj.urgency_score === 'number' ? obj.urgency_score : 0,
        mainIssue: asString(obj.main_issue),
      };
    });
  }

  // fallback: profile에서 생성
  return profile.farms.map((f) => ({
    farmId: f.farmId,
    farmName: f.name,
    urgencyScore: f.activeAlerts * 10,
    mainIssue: f.activeAlerts > 0 ? `알림 ${String(f.activeAlerts)}건` : '정상',
  }));
}

function parseScheduleItems(val: unknown): readonly ScheduleItem[] {
  if (!Array.isArray(val)) return [];
  return val.slice(0, 10).map((item, i) => {
    const obj = (typeof item === 'object' && item !== null ? item : {}) as Record<string, unknown>;
    return {
      priority: i + 1,
      farmId: asString(obj.farm_id),
      farmName: asString(obj.farm_name),
      task: asString(obj.main_issue) || asString(obj.task),
      animalCount: typeof obj.animal_count === 'number' ? obj.animal_count : 0,
      urgency: asSeverity(obj.urgency) || 'medium',
    };
  });
}

function parseUrgentCases(val: unknown): readonly UrgentCase[] {
  if (!Array.isArray(val)) return [];
  return val.slice(0, 10).map((item) => {
    const obj = (typeof item === 'object' && item !== null ? item : {}) as Record<string, unknown>;
    return {
      animalId: asString(obj.animal_id),
      earTag: asString(obj.ear_tag),
      farmName: asString(obj.farm_name),
      issue: asString(obj.issue),
      severity: asSeverity(obj.severity) || 'high',
      recommendedAction: asString(obj.suggested_action) || asString(obj.recommended_action),
    };
  });
}

// ===========================
// interpretEpidemic
// ===========================

export async function interpretEpidemic(
  cluster: DetectedCluster,
  nearbyRiskFarms: readonly FarmProximityRisk[],
  role: Role,
): Promise<EpidemicInterpretation> {
  const prompt = buildEpidemicPrompt(cluster, nearbyRiskFarms, role);
  const claudeResult = await callClaudeForAnalysis(prompt);

  if (claudeResult) {
    return mapClaudeToEpidemicInterpretation(claudeResult.parsed);
  }

  logger.warn({ diseaseType: cluster.diseaseType }, 'Claude unavailable — using epidemic fallback');
  return buildFallbackEpidemicInterpretation(cluster, nearbyRiskFarms);
}

function mapClaudeToEpidemicInterpretation(
  parsed: Record<string, unknown>,
): EpidemicInterpretation {
  const diseaseId = (parsed.disease_identification ?? {}) as Record<string, unknown>;
  const spreadPred = (parsed.spread_prediction ?? {}) as Record<string, unknown>;
  const quarantineActions = Array.isArray(parsed.quarantine_actions) ? parsed.quarantine_actions : [];

  return {
    riskAssessment: asString(parsed.risk_assessment),
    diseaseIdentification: {
      likelyDisease: asString(diseaseId.likely_disease),
      confidence: typeof diseaseId.confidence === 'number' ? diseaseId.confidence : 0.5,
      basis: asStringArray(diseaseId.basis),
    },
    spreadPrediction: {
      predictedFarmIds: asStringArray(spreadPred.at_risk_farms),
      timeframeHours: 72,
      probability: 0.5,
      direction: asString(spreadPred.direction),
      basis: asString(spreadPred.speed),
    },
    quarantineActions: quarantineActions.map((qa: unknown) => {
      const obj = (typeof qa === 'object' && qa !== null ? qa : {}) as Record<string, unknown>;
      return {
        actionType: asString(obj.action) as 'isolate' | 'vaccinate' | 'monitor' | 'restrict_movement' | 'test' | 'cull',
        targetFarmIds: asStringArray(obj.target_farms),
        urgency: asSeverity(obj.urgency) || 'medium',
        description: asString(obj.description),
      };
    }),
    roleActions: parseActions(parsed.actions) as Record<string, string>,
    dataReferences: asStringArray(parsed.data_references),
  };
}

function buildFallbackEpidemicInterpretation(
  cluster: DetectedCluster,
  nearbyRiskFarms: readonly FarmProximityRisk[],
): EpidemicInterpretation {
  const highRiskFarms = nearbyRiskFarms.filter((f) => f.riskScore >= 60);

  return {
    riskAssessment: `${cluster.diseaseType} 클러스터가 ${String(cluster.farms.length)}개 농장에서 감지되었습니다. ${cluster.spreadRate.trend === 'accelerating' ? '확산이 가속화되고 있어 즉각 대응이 필요합니다.' : '모니터링을 강화해야 합니다.'}`,
    diseaseIdentification: {
      likelyDisease: cluster.diseaseType,
      confidence: 0.4,
      basis: [`smaXtec 이벤트 패턴: ${String(cluster.totalEvents)}건`],
    },
    spreadPrediction: {
      predictedFarmIds: highRiskFarms.slice(0, 5).map((f) => f.farmId),
      timeframeHours: 72,
      probability: cluster.spreadRate.trend === 'accelerating' ? 0.7 : 0.4,
      direction: '분석 필요',
      basis: `확산 속도 ${cluster.spreadRate.farmsPerDay.toFixed(1)} 농장/일`,
    },
    quarantineActions: [
      {
        actionType: 'monitor',
        targetFarmIds: cluster.farms.map((f) => f.farmId),
        urgency: cluster.level === 'outbreak' ? 'critical' : 'high',
        description: '영향 농장 건강 모니터링 강화',
      },
    ],
    roleActions: {
      farmer: '영향 가축 격리 관찰, 체온 수동 측정 병행.',
      veterinarian: '영향 농장 임상 검사 실시, 샘플 채취 의뢰.',
      quarantine_officer: '이동 제한 검토, 인접 농장 통보.',
      government_admin: '상위 기관 보고, 방역 물자 확보.',
      inseminator: '영향 농장 인공수정 보류 검토.',
      feed_company: '사료 변경 시 주의.',
    },
    dataReferences: [`smaXtec 이벤트 ${String(cluster.totalEvents)}건`, `영향 농장 ${String(cluster.farms.length)}개`],
  };
}

function buildV4DataReferences(profile: AnimalProfile): readonly string[] {
  const refs: string[] = [];
  if (profile.latestSensor.temperature !== null) {
    refs.push(`체온 ${String(profile.latestSensor.temperature)}°C`);
  }
  if (profile.latestSensor.rumination !== null) {
    refs.push(`반추 ${String(profile.latestSensor.rumination)}분/일`);
  }
  for (const e of profile.activeEvents) {
    refs.push(`smaXtec ${e.type} ${e.detectedAt.toISOString()}`);
  }
  return refs;
}
