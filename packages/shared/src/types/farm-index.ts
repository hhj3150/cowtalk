// Farm Intelligence Index — "오늘의 목장 점수"
//
// 정직성 원칙 (합성값 금지):
// - 각 축은 실데이터로만 계산. 데이터가 부족한 축은 score=null ('—' 표시).
// - 종합 점수는 '가용 축들만'의 평균이며, coverage(가용/전체)를 반드시 함께 노출.
// - 각 축은 reasons(실데이터 인용 근거)를 가진다 — "오늘 91점인 이유".

export type FarmIndexAxisKey = 'health' | 'breeding' | 'monitoring' | 'productivity' | 'economy';

export interface FarmIndexAxis {
  readonly key: FarmIndexAxisKey;
  readonly label: string;
  /** 0–100. null = 데이터 부족 ('—') */
  readonly score: number | null;
  readonly status: 'ok' | 'data_insufficient';
  /** 실데이터 인용 근거 — 점수의 이유 */
  readonly reasons: readonly string[];
}

export type FarmIndexGrade = 'A' | 'B' | 'C' | 'D';

export interface FarmIntelligenceIndex {
  readonly farmId: string;
  readonly farmName: string;
  /** 가용 축 평균 (가용 축 0개면 null) */
  readonly overall: number | null;
  readonly grade: FarmIndexGrade | null;
  /** 종합 점수에 포함된 축 수 / 전체 축 수 */
  readonly coverage: { readonly available: number; readonly total: number };
  readonly axes: readonly FarmIndexAxis[];
  readonly generatedAt: string;
}
