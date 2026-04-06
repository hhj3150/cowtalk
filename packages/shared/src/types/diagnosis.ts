// 감별진단 공유 타입 — 서버 서비스 + 프론트엔드 공용

export interface SensorEvidence {
  readonly metric: string;
  readonly currentValue: number | null;
  readonly normalRange: string;
  readonly status: 'supports' | 'contradicts' | 'neutral';
}

export interface DiagnosisCandidate {
  readonly disease: string;
  readonly diseaseKo: string;
  readonly probability: number; // 0-100
  readonly evidence: readonly SensorEvidence[];
  readonly confirmatoryTests: readonly string[];
  readonly matchingSymptoms: readonly string[];
}

export interface FarmHistoryPattern {
  readonly diagnosis: string;
  readonly count: number;
}

export interface DifferentialDiagnosisResult {
  readonly animalId: string;
  readonly earTag: string;
  readonly farmName: string;
  readonly candidates: readonly DiagnosisCandidate[];
  readonly farmHistory: readonly FarmHistoryPattern[];
  readonly urgencyLevel: 'immediate' | 'within_24h' | 'routine';
  readonly dataQuality: 'good' | 'limited' | 'insufficient';
}
