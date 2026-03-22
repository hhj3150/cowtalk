// 소버린 AI 지식 강화 루프 — 레이블 + AI 대화 타입
// Sovereign AI Knowledge Loop: Expert labels ground truth via AI-assisted chat

import type { LabelVerdict, LabelOutcome } from './event-label.js';

// ── 대화 메시지 ──

export interface LabelChatMessage {
  readonly id: string;
  readonly role: 'user' | 'assistant' | 'system';
  readonly content: string;
  readonly timestamp: string;
}

// ── 이벤트 컨텍스트 (모달에 표시) ──

export interface EventContext {
  readonly eventId: string;
  readonly eventType: string;
  readonly smaxtecOriginalType: string;
  readonly severity: string;
  readonly detectedAt: string;
  readonly animalId: string;
  readonly earTag: string;
  readonly farmId: string;
  readonly farmName: string;
  readonly sensorSummary: string;
  readonly recentHistory: readonly EventHistoryItem[];
  readonly currentLabels: readonly ExistingLabel[];
}

export interface EventHistoryItem {
  readonly eventType: string;
  readonly severity: string;
  readonly detectedAt: string;
  readonly label: string;
}

export interface ExistingLabel {
  readonly labelId: string;
  readonly verdict: LabelVerdict;
  readonly actualDiagnosis: string | null;
  readonly actionTaken: string | null;
  readonly outcome: LabelOutcome | null;
  readonly labeledAt: string;
  readonly labeledBy: string | null;
}

// ── 레이블 제출 ──

export interface SubmitLabelRequest {
  readonly eventId: string;
  readonly animalId: string;
  readonly farmId: string;
  readonly verdict: LabelVerdict;
  readonly actualType?: string;
  readonly actualSeverity?: string;
  readonly actualDiagnosis?: string;
  readonly actionTaken?: string;
  readonly outcome?: LabelOutcome;
  readonly notes?: string;
  readonly conversationSummary?: string; // AI와의 대화 요약 (강화학습용)
}

// ── 소버린 AI 학습 통계 ──

export interface SovereignAiStats {
  readonly totalLabels: number;
  readonly confirmedCount: number;
  readonly falsePositiveCount: number;
  readonly modifiedCount: number;
  readonly missedCount: number;
  readonly accuracyRate: number;
  readonly improvementRate: number; // 최근 30일 정확도 변화
  readonly topMisclassifications: readonly MisclassificationItem[];
  readonly labelsByRole: readonly RoleLabelCount[];
  readonly dailyLabelCounts: readonly DailyLabelCount[];
  readonly regionName: string;
}

export interface MisclassificationItem {
  readonly predictedType: string;
  readonly actualType: string;
  readonly count: number;
}

export interface RoleLabelCount {
  readonly role: string;
  readonly count: number;
}

export interface DailyLabelCount {
  readonly date: string;
  readonly count: number;
}
