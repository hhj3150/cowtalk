// XAI (설명가능 AI) 스키마 — CowTalk 공모사업 대비
// 모든 AI 판단에 근거·신뢰도·기여요인을 구조화하여 투명성 보장

export type ConfidenceLevel = 'high' | 'medium' | 'low';
export type DataSource = 'smaxtec_sensor' | 'smaxtec_event' | 'public_data' | 'farm_record' | 'v4_rule' | 'claude_llm';

export interface ContributingFactor {
  /** 기여 요인 이름 (예: "체온 상승", "반추 감소") */
  readonly name: string;
  /** 기여 방향 (positive: 위험 증가, negative: 위험 감소) */
  readonly direction: 'positive' | 'negative';
  /** 기여 강도 0~1 */
  readonly weight: number;
  /** 실제 측정값 */
  readonly value?: string;
  /** 데이터 출처 */
  readonly source: DataSource;
}

export interface AIExplanation {
  /** 판단 요약 (한국어 1-2문장) */
  readonly summary: string;
  /** 신뢰도 수준 */
  readonly confidence: ConfidenceLevel;
  /** 신뢰도 점수 0~1 */
  readonly confidenceScore: number;
  /** 기여 요인 목록 (중요도 내림차순) */
  readonly contributingFactors: readonly ContributingFactor[];
  /** 판단에 사용된 데이터 출처 목록 */
  readonly dataSources: readonly DataSource[];
  /** 판단 한계 또는 주의사항 */
  readonly limitations?: string;
  /** v4 룰엔진 보조 분석 결과 포함 여부 */
  readonly v4Assisted: boolean;
  /** Claude API 사용 여부 */
  readonly claudeUsed: boolean;
  /** 처리 시간 (ms) */
  readonly processingTimeMs: number;
  /** 분석 타임스탬프 */
  readonly analyzedAt: string;
}

export interface AnimalAIExplanation extends AIExplanation {
  readonly animalId: string;
  readonly earTag: string;
  /** 주요 판단 (발정/질병/임신 등) */
  readonly primaryDecision: string;
  /** 권장 액션 */
  readonly recommendedActions: readonly string[];
}

export interface FarmAIExplanation extends AIExplanation {
  readonly farmId: string;
  readonly farmName: string;
  /** 당일 핵심 이슈 수 */
  readonly issueCount: number;
  /** 전체 건강 점수 0~100 */
  readonly healthScore: number | null;
}
