// 이벤트 레이블링 타입 — 강화학습 피드백 루프

export type LabelVerdict = 'confirmed' | 'false_positive' | 'modified' | 'missed';

export type LabelOutcome = 'resolved' | 'ongoing' | 'worsened' | 'no_action';

export interface EventLabel {
  readonly labelId: string;
  readonly eventId: string;
  readonly animalId: string;
  readonly farmId: string;
  readonly predictedType: string;
  readonly predictedSeverity: string;
  readonly verdict: LabelVerdict;
  readonly actualType: string | null;
  readonly actualSeverity: string | null;
  readonly actualDiagnosis: string | null;
  readonly actionTaken: string | null;
  readonly outcome: LabelOutcome | null;
  readonly notes: string | null;
  readonly labeledBy: string | null;
  readonly labeledAt: string;
}

export interface CreateEventLabelRequest {
  readonly eventId: string;
  readonly animalId: string;
  readonly farmId: string;
  readonly predictedType: string;
  readonly predictedSeverity: string;
  readonly verdict: LabelVerdict;
  readonly actualType?: string;
  readonly actualSeverity?: string;
  readonly actualDiagnosis?: string;
  readonly actionTaken?: string;
  readonly outcome?: LabelOutcome;
  readonly notes?: string;
}

export interface EventLabelStats {
  readonly totalLabels: number;
  readonly confirmed: number;
  readonly falsePositive: number;
  readonly modified: number;
  readonly missed: number;
  /** @deprecated BUG-008: accuracyResult 사용. */
  readonly accuracyRate: number;
  /** D5/D4 강제: 표본 부족 시 status='data_insufficient'. */
  readonly accuracyResult: {
    readonly numerator: number;
    readonly denominator: number;
    readonly rate: number | null;
    readonly displayValue: string;
    readonly status: 'ok' | 'data_insufficient';
  };
}
