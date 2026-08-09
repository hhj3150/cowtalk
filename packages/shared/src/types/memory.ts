// 팅커벨 장기기억 — 대화에서 축적되는 '기억할 가치가 있는 것'
//
// 임상 이벤트(진단·치료·번식)는 animal_events로, 알람 정확도는 event_labels로 간다.
// 이 타입이 담는 것은 그 어느 쪽도 아닌 것 — 목장 고유의 사실, 운영 원칙, 제약, 선호.
// "우리는 로봇착유기 쓴다", "덱사는 안 쓴다", "아침 6시에 브리핑 받고 싶다" 같은 것.

/** 기억의 적용 범위 */
export type MemoryScope = 'user' | 'farm' | 'animal';

/** 기억의 종류 — 회상 우선순위와 프롬프트 그룹핑에 쓰인다 */
export type MemoryCategory =
  | 'farm_fact'   // 목장 고유 사실 (사육 방식, 규모, 구조)
  | 'protocol'    // 반복되는 운영·처치 원칙 ("분만 후 3일간 칼슘 급여")
  | 'preference'  // 사용자 선호 (보고 방식·시간·상세도)
  | 'constraint'  // 제약 (안 쓰는 약, 못 하는 작업, 인력·예산 한계)
  | 'equipment'   // 장비 (착유기, 센서, 사료 배합기)
  | 'economics'   // 단가·판매 구조 (자체가공, 납품처)
  | 'person'      // 관계자 (담당 수의사, 수정사, 직원)
  | 'goal'        // 목표 (수태율 목표, 출하 계획)
  | 'animal_fact'; // 특정 개체의 지속되는 특성 ("423번은 착유 시 발길질")

/** 기억의 생애 상태 — 삭제는 하드 삭제하지 않는다 (감사·복원 가능) */
export type MemoryStatus = 'active' | 'superseded' | 'rejected' | 'expired';

/** 어떻게 생긴 기억인가 — 신뢰도·감쇠 정책이 갈린다 */
export type MemorySource =
  | 'chat_auto'     // 대화에서 자동 추출
  | 'user_explicit' // 사용자가 "이거 기억해"라고 명시
  | 'correction'    // 사용자가 AI 답변을 정정하며 알려준 것
  | 'manual';       // 관리 화면에서 직접 입력

export interface TinkerbellMemory {
  readonly memoryId: string;
  readonly scope: MemoryScope;
  readonly userId: string | null;
  readonly farmId: string | null;
  readonly animalId: string | null;
  readonly category: MemoryCategory;
  readonly subject: string;
  readonly content: string;
  readonly confidence: number;
  readonly importance: number;
  readonly evidenceCount: number;
  readonly status: MemoryStatus;
  readonly supersededBy: string | null;
  readonly source: MemorySource;
  readonly sourceConversationId: string | null;
  readonly sourceQuote: string | null;
  readonly keywords: readonly string[];
  readonly createdBy: string | null;
  readonly lastConfirmedAt: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export const MEMORY_CATEGORY_LABELS: Readonly<Record<MemoryCategory, string>> = {
  farm_fact: '목장 사실',
  protocol: '운영 원칙',
  preference: '선호',
  constraint: '제약',
  equipment: '장비',
  economics: '경제',
  person: '관계자',
  goal: '목표',
  animal_fact: '개체 특성',
};

export const MEMORY_SOURCE_LABELS: Readonly<Record<MemorySource, string>> = {
  chat_auto: '대화 자동 추출',
  user_explicit: '직접 지시',
  correction: '정정',
  manual: '수동 입력',
};
