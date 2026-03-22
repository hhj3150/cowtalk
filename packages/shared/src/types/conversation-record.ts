// 대화-즉-기록 (Conversation-as-Record)
// AI 대화에서 자동 추출한 구조화 기록 타입
// 소버린 AI 학습 루프의 핵심 데이터 파이프라인

// ── 추출 가능한 이벤트 유형 ──

export type ConversationRecordType =
  | 'insemination'       // 수정
  | 'calving'            // 분만
  | 'treatment'          // 치료/투약
  | 'mastitis'           // 유방염
  | 'hoof_treatment'     // 발굽 치료
  | 'vaccination'        // 예방접종
  | 'abortion'           // 유산
  | 'clinical_exam'      // 임상 검진
  | 'behavior_change'    // 행동 변화
  | 'feed_change'        // 사료 변경
  | 'general_observation'; // 일반 관찰

// ── 이벤트별 구조화 데이터 ──

export interface InseminationData {
  readonly semenId?: string;          // 정액 번호
  readonly inseminationTime?: string; // 수정 시각
  readonly estrusLevel?: 'strong' | 'medium' | 'weak'; // 발정 강도
  readonly inseminatorName?: string;  // 수정사
  readonly method?: string;           // AI, 자연교배 등
}

export interface CalvingData {
  readonly calfSex?: 'male' | 'female' | 'unknown';
  readonly birthType?: 'normal' | 'dystocia' | 'cesarean';
  readonly calfStatus?: 'alive' | 'stillborn' | 'weak';
  readonly calfWeight?: number;       // kg
  readonly placentaExpelled?: boolean; // 태반 배출 여부
  readonly calvingTime?: string;
}

export interface TreatmentData {
  readonly diagnosis?: string;        // 진단명
  readonly medication?: string;       // 약물
  readonly dosage?: string;           // 용량
  readonly route?: string;            // 투여 경로 (IV, IM, SC 등)
  readonly duration?: string;         // 투약 기간
  readonly withdrawalPeriod?: string; // 출하 제한 기간
  readonly treatedBy?: string;        // 치료 수의사
}

export interface MastitisData {
  readonly affectedQuarter?: string;  // LF, RF, LR, RR
  readonly severity?: 'mild' | 'moderate' | 'severe';
  readonly cmtResult?: string;        // CMT 검사 결과
  readonly medication?: string;
  readonly milkDiscarded?: boolean;   // 우유 폐기 여부
}

export interface HoofTreatmentData {
  readonly affectedLeg?: string;      // 앞왼, 앞오, 뒤왼, 뒤오
  readonly condition?: string;        // 제엽염, 백선, 과장 등
  readonly treatment?: string;        // 삭제, 밴딩, 약물 등
  readonly lameness_score?: number;   // 1-5
}

export interface VaccinationData {
  readonly vaccineType?: string;      // 백신 종류
  readonly manufacturer?: string;
  readonly batchNumber?: string;
  readonly nextDueDate?: string;      // 다음 접종일
}

export interface AbortionData {
  readonly gestationDays?: number;    // 임신 일수
  readonly possibleCause?: string;
  readonly fetusCondition?: string;
  readonly labSampleTaken?: boolean;
}

// 범용 구조화 데이터 (clinical_exam, behavior_change 등)
export interface GeneralObservationData {
  readonly temperature?: number;
  readonly bodyConditionScore?: number;
  readonly weight?: number;
  readonly notes?: string;
}

// ── 추출된 기록 (AI → 사용자 확인용) ──

export type ExtractedStructuredData =
  | { readonly type: 'insemination'; readonly data: InseminationData }
  | { readonly type: 'calving'; readonly data: CalvingData }
  | { readonly type: 'treatment'; readonly data: TreatmentData }
  | { readonly type: 'mastitis'; readonly data: MastitisData }
  | { readonly type: 'hoof_treatment'; readonly data: HoofTreatmentData }
  | { readonly type: 'vaccination'; readonly data: VaccinationData }
  | { readonly type: 'abortion'; readonly data: AbortionData }
  | { readonly type: 'clinical_exam'; readonly data: GeneralObservationData }
  | { readonly type: 'behavior_change'; readonly data: GeneralObservationData }
  | { readonly type: 'feed_change'; readonly data: GeneralObservationData }
  | { readonly type: 'general_observation'; readonly data: GeneralObservationData };

export interface ExtractedRecord {
  readonly eventType: ConversationRecordType;
  readonly confidence: number;        // 0.0 ~ 1.0
  readonly summary: string;           // 한국어 요약 (예: "정액 888로 08:00 수정, 발정 중간")
  readonly structuredData: ExtractedStructuredData;
  readonly missingFields: readonly string[]; // AI가 추가로 물어볼 수 있는 미입력 필드
  readonly rawExcerpt: string;        // 추출 근거가 된 대화 부분
}

// ── 대화 세션 ──

export interface ChatSessionMessage {
  readonly role: 'user' | 'assistant';
  readonly content: string;
  readonly timestamp: string;
}

export interface ChatSession {
  readonly sessionId: string;
  readonly animalId: string;
  readonly farmId: string;
  readonly userId: string;
  readonly messages: readonly ChatSessionMessage[];
  readonly extractedRecordIds: readonly string[]; // clinicalObservations.observationId
  readonly eventId: string | null;    // 연결된 smaXtec 이벤트 (없으면 null)
  readonly status: 'active' | 'closed';
  readonly createdAt: string;
  readonly closedAt: string | null;
}

// ── 이벤트 유형별 한국어 라벨 ──

export const RECORD_TYPE_LABELS: Readonly<Record<ConversationRecordType, string>> = {
  insemination: '수정',
  calving: '분만',
  treatment: '치료/투약',
  mastitis: '유방염',
  hoof_treatment: '발굽 치료',
  vaccination: '예방접종',
  abortion: '유산',
  clinical_exam: '임상 검진',
  behavior_change: '행동 변화',
  feed_change: '사료 변경',
  general_observation: '일반 관찰',
};
