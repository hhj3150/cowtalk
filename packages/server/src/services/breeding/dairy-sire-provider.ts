// 젖소 정액(종모우) 추천 — 데이터 공급원 어댑터 레이어
//
// 설계 원칙(CTO): 추천 엔진(breeding-advisor)은 이미 품종 무관(breed-agnostic)으로 동작한다.
// 젖소 추천의 진짜 제약은 "엔진"이 아니라 "유전·혈통·검정 데이터 공급원"이다.
// 이 모듈은 4개 공급원을 어댑터로 추상화하고, 현재 가용성(readiness)을 정직하게 보고한다.
//
//  - 현재(live):   카우톡 내부 생육·번식 데이터 + 축산물품질평가원 등급
//  - 향후(pending): 한국종축개량협회 혈통, 젖소 검정(DHI)
//
// 데이터가 열리면 아래 레지스트리의 status만 'live'로 바꾸면 추천 정밀도가 자동 상승한다.
// (엔진/응답 구조 변경 불필요 — 미래지향적 확장점)

export type SourceStatus = 'live' | 'pending' | 'disabled';

export interface DairyDataSource {
  readonly id: string;
  readonly name: string;
  readonly status: SourceStatus;
  readonly provides: readonly string[]; // 이 공급원이 제공하는 신호
  readonly note: string;                // 현재 상태/연동 시 효과
}

/**
 * 젖소 종모우 추천 데이터 공급원 레지스트리.
 * 데이터 연동이 열리면 이 한 곳의 status만 'live'로 바꾼다(단일 변경점).
 */
export const DAIRY_DATA_SOURCES: readonly DairyDataSource[] = [
  {
    id: 'cowtalk_internal',
    name: '카우톡 생육·번식 데이터',
    status: 'live',
    provides: ['breeding_history', 'conception_feedback', 'growth_stage', 'sensor'],
    note: '목장 자체 수정·임신감정·센서·생육 데이터 — 현재 가동',
  },
  {
    id: 'ekape_grade',
    name: '축산물품질평가원 등급',
    status: 'live',
    provides: ['grade_outcome'],
    note: 'EKAPE 등급판정 커넥터 연동 — 산육/도체 성적 보강',
  },
  {
    id: 'dhi_test',
    name: '젖소 검정데이터(DHI)',
    status: 'pending',
    provides: ['milk_yield', 'fat', 'protein', 'scc', 'daughter_performance'],
    note: '젖소개량사업소 검정성적 — 연동 시 종모우 딸소 능력·암소 산유능력 반영',
  },
  {
    id: 'kaia_pedigree',
    name: '한국종축개량협회 혈통',
    status: 'pending',
    provides: ['pedigree', 'inbreeding', 'genomic_evaluation'],
    note: '아직 공개데이터 미전환 — 연동 시 정밀 근교계수·유전능력 평가',
  },
];

const DAIRY_BREED_TOKENS = ['젖소', '홀스타인', 'holstein', 'dairy', '저지', 'jersey'] as const;
const BEEF_BREED_TOKENS = ['한우', 'hanwoo', '육우', 'beef'] as const;

/** 품종 문자열이 젖소 계열인지 판별 (한우/육우는 명시적으로 제외) */
export function isDairyBreed(breed: string | null | undefined): boolean {
  if (!breed) return false;
  const b = breed.toLowerCase();
  if (BEEF_BREED_TOKENS.some((t) => b.includes(t.toLowerCase()))) return false;
  return DAIRY_BREED_TOKENS.some((t) => b.includes(t.toLowerCase()));
}

export type BreedFamily = 'dairy' | 'beef' | 'unknown';

/**
 * 품종 문자열을 계열로 정규화한다.
 * 'Holstein'·'홀스타인'·'젖소' → dairy, '한우'·'Hanwoo'·'육우' → beef.
 * 정액 추천에서 'Holstein' 카탈로그와 'holstein' 개체처럼 표기가 달라도 매칭되게 한다.
 */
export function breedFamily(breed: string | null | undefined): BreedFamily {
  if (isDairyBreed(breed)) return 'dairy';
  if (breed && BEEF_BREED_TOKENS.some((t) => breed.toLowerCase().includes(t.toLowerCase()))) {
    return 'beef';
  }
  return 'unknown';
}

export interface DairySourceFlags {
  readonly dhi?: boolean;       // 젖소 검정데이터(DHI) 연동 여부
  readonly pedigree?: boolean;  // 종축개량협회 혈통 연동 여부
}

/**
 * 외부 연동 플래그(환경설정)를 공급원 상태에 반영한다.
 * 데이터 거버넌스가 확정되면 플래그만 true로 바꾸면 해당 공급원이 'live'가 된다.
 * (코드 변경 없이 운영 설정만으로 추천 신뢰도 상승 — 미래지향 확장점)
 */
export function applySourceFlags(
  sources: readonly DairyDataSource[],
  flags: DairySourceFlags,
): DairyDataSource[] {
  return sources.map((s) => {
    if (s.id === 'dhi_test' && flags.dhi) return { ...s, status: 'live' };
    if (s.id === 'kaia_pedigree' && flags.pedigree) return { ...s, status: 'live' };
    return s;
  });
}

export interface DairyMatingReadiness {
  readonly applicable: true;
  readonly overall: 'ready' | 'partial' | 'minimal';
  readonly confidence: 'high' | 'medium' | 'low';
  readonly liveSources: readonly DairyDataSource[];
  readonly pendingSources: readonly DairyDataSource[];
  readonly summary: string; // UI/팅커벨이 그대로 노출할 정직한 한 줄
}

/**
 * 현재 데이터 공급 상태로부터 젖소 추천의 신뢰도를 산출한다.
 * 정밀 추천의 핵심 = 혈통(근교계수) + DHI(유전능력). 둘 다 live면 high.
 */
export function getDairyMatingReadiness(
  sources: readonly DairyDataSource[] = DAIRY_DATA_SOURCES,
): DairyMatingReadiness {
  const live = sources.filter((s) => s.status === 'live');
  const pending = sources.filter((s) => s.status === 'pending');

  const hasPedigree = live.some((s) => s.provides.includes('inbreeding'));
  const hasDhi = live.some((s) => s.provides.includes('milk_yield'));

  const confidence: DairyMatingReadiness['confidence'] =
    hasPedigree && hasDhi ? 'high' : hasPedigree || hasDhi ? 'medium' : 'low';
  const overall: DairyMatingReadiness['overall'] =
    confidence === 'high' ? 'ready' : confidence === 'medium' ? 'partial' : 'minimal';

  const liveNames = live.map((s) => s.name).join(' + ');
  const pendingNames = pending.map((s) => s.name).join(', ');
  const summary =
    pending.length === 0
      ? '혈통·검정·내부 데이터 연동 완료 — 정밀 추천'
      : `현재 ${liveNames} 기반 추천(신뢰도 ${confidence}). ${pendingNames} 연동 시 정밀화.`;

  return { applicable: true, overall, confidence, liveSources: live, pendingSources: pending, summary };
}
