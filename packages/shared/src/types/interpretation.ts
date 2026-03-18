// Claude AI 해석 결과 타입 — Phase 4 핵심
// 프로파일 → Claude AI → 해석 결과 → 역할별 서빙

import type { Severity } from './common.js';
import type { Role } from './user.js';

// ===========================
// 개체 해석 결과
// ===========================

export interface AnimalInterpretation {
  readonly animalId: string;
  readonly earTag: string;
  readonly timestamp: Date;
  readonly source: InterpretationSource;

  // Claude가 생성하는 핵심 해석
  readonly summary: string;                    // 한 문장 요약
  readonly interpretation: InterpretationDetail;
  readonly risks: readonly string[];
  readonly actions: Readonly<Record<Role, string>>;
  readonly dataReferences: readonly string[];  // 근거 데이터

  // 메타
  readonly severity: Severity;
  readonly confidence: 'high' | 'medium' | 'low';
  readonly modelVersion: string;
  readonly processingTimeMs: number;

  // v4 보조 분석 (있으면)
  readonly v4Analysis: V4AnalysisSummary | null;
}

export interface InterpretationDetail {
  readonly primary: string;      // 주요 해석
  readonly secondary: string;    // 보조 해석
  readonly confidence: 'high' | 'medium' | 'low';
  readonly reasoning: string;    // 판단 근거
}

// ===========================
// 농장 해석 결과
// ===========================

export interface FarmInterpretation {
  readonly farmId: string;
  readonly farmName: string;
  readonly timestamp: Date;
  readonly source: InterpretationSource;

  readonly summary: string;
  readonly healthScore: number | null;         // 0-100
  readonly todayPriorities: readonly PriorityAction[];
  readonly animalHighlights: readonly AnimalHighlight[];
  readonly risks: readonly string[];
  readonly actions: Readonly<Record<Role, string>>;
  readonly dataReferences: readonly string[];

  readonly severity: Severity;
  readonly modelVersion: string;
  readonly processingTimeMs: number;
}

export interface PriorityAction {
  readonly priority: number;   // 1 = 최우선
  readonly action: string;
  readonly target: string;     // 대상 (동물 귀표 등)
  readonly urgency: Severity;
  readonly reasoning: string;
}

export interface AnimalHighlight {
  readonly animalId: string;
  readonly earTag: string;
  readonly issue: string;
  readonly severity: Severity;
  readonly suggestedAction: string;
}

// ===========================
// 지역 해석 결과
// ===========================

export interface RegionalInterpretation {
  readonly regionId: string | null;
  readonly tenantId: string | null;
  readonly timestamp: Date;
  readonly source: InterpretationSource;

  readonly summary: string;
  readonly clusterAnalysis: readonly ClusterInterpretation[];
  readonly farmRankings: readonly FarmRanking[];
  readonly risks: readonly string[];
  readonly actions: Readonly<Record<Role, string>>;
  readonly dataReferences: readonly string[];

  readonly severity: Severity;
  readonly modelVersion: string;
  readonly processingTimeMs: number;
}

export interface ClusterInterpretation {
  readonly signalType: string;
  readonly affectedFarms: readonly string[];
  readonly interpretation: string;
  readonly severity: Severity;
  readonly recommendation: string;
}

export interface FarmRanking {
  readonly farmId: string;
  readonly farmName: string;
  readonly urgencyScore: number;  // 높을수록 긴급
  readonly mainIssue: string;
}

// ===========================
// 테넌트 해석 결과 (수의사/사료회사 등)
// ===========================

export interface TenantInterpretation {
  readonly tenantId: string;
  readonly timestamp: Date;
  readonly source: InterpretationSource;

  readonly summary: string;
  readonly todaySchedule: readonly ScheduleItem[];
  readonly urgentCases: readonly UrgentCase[];
  readonly farmPriorities: readonly FarmRanking[];
  readonly risks: readonly string[];
  readonly actions: Readonly<Record<Role, string>>;
  readonly dataReferences: readonly string[];

  readonly severity: Severity;
  readonly modelVersion: string;
  readonly processingTimeMs: number;
}

export interface ScheduleItem {
  readonly priority: number;
  readonly farmId: string;
  readonly farmName: string;
  readonly task: string;
  readonly animalCount: number;
  readonly urgency: Severity;
}

export interface UrgentCase {
  readonly animalId: string;
  readonly earTag: string;
  readonly farmName: string;
  readonly issue: string;
  readonly severity: Severity;
  readonly recommendedAction: string;
}

// ===========================
// 대화형 응답
// ===========================

export interface ChatResponse {
  readonly answer: string;
  readonly dataReferences: readonly string[];
  readonly followUpSuggestions: readonly string[];
  readonly role: Role;
  readonly context: 'animal' | 'farm' | 'global' | 'region' | 'general';
  readonly isFallback?: boolean;
}

// ===========================
// v4 보조 분석 요약
// ===========================

export interface V4AnalysisSummary {
  readonly estrusScore: number | null;
  readonly diseaseRisks: readonly V4DiseaseRisk[];
  readonly pregnancyStability: number | null;
  readonly dataQualityScore: number;
  readonly features: Readonly<Record<string, number>>;
}

export interface V4DiseaseRisk {
  readonly diseaseType: string;
  readonly score: number;
  readonly matchingSymptoms: readonly string[];
}

// ===========================
// 공통
// ===========================

export type InterpretationSource = 'claude' | 'v4_fallback' | 'cached';

// 알림 관련
export interface AlertCandidate {
  readonly type: string;
  readonly animalId: string | null;
  readonly farmId: string;
  readonly severity: Severity;
  readonly message: string;
  readonly source: InterpretationSource;
  readonly dedupKey: string;
}
