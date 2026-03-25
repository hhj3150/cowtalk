// 한국 소 법정 예방접종 프로토콜
// 근거: 가축전염병예방법, 농림축산식품부 고시
// 갱신: 매년 국가 방역 시행계획 확인 필요

// ===========================
// 타입
// ===========================

export interface VaccineProtocol {
  readonly id: string;
  readonly name: string;
  readonly nameEn: string;
  readonly diseaseCode: string;         // 질병코드
  readonly type: 'vaccination' | 'inspection';  // 접종 vs 검사
  readonly frequency: VaccineFrequency;
  readonly targetAnimals: TargetAnimalCriteria;
  readonly legalBasis: string;          // 법적 근거
  readonly penalty: boolean;            // 미이행 시 과태료
  readonly priority: 1 | 2 | 3;        // 1=필수, 2=권장, 3=지역한정
}

export interface VaccineFrequency {
  readonly type: 'fixed_months' | 'annual' | 'once' | 'age_based';
  readonly months?: readonly number[];   // fixed_months: 접종 시행월
  readonly intervalDays?: number;        // annual: 접종 간격(일)
  readonly ageMonthsMin?: number;        // age_based: 최소 월령
  readonly ageMonthsMax?: number;        // age_based: 최대 월령
}

export interface TargetAnimalCriteria {
  readonly allCattle: boolean;           // 전두수 대상 여부
  readonly sexFilter?: 'female' | 'male' | null;
  readonly breedFilter?: readonly string[];  // 빈 배열 = 전품종
  readonly minAgeDays?: number;
  readonly maxAgeDays?: number;
  readonly reproductiveStatus?: readonly string[];  // pregnant, lactating 등
}

// ===========================
// 법정 프로토콜
// ===========================

export const VACCINE_PROTOCOLS: readonly VaccineProtocol[] = [
  {
    id: 'fmd',
    name: '구제역',
    nameEn: 'Foot-and-Mouth Disease',
    diseaseCode: 'FMD',
    type: 'vaccination',
    frequency: {
      type: 'fixed_months',
      months: [4, 10],    // 상반기 4월, 하반기 10월
    },
    targetAnimals: {
      allCattle: true,
      breedFilter: [],
    },
    legalBasis: '가축전염병예방법 제15조',
    penalty: true,
    priority: 1,
  },
  {
    id: 'brucellosis_initial',
    name: '브루셀라 (초회)',
    nameEn: 'Brucellosis (Initial)',
    diseaseCode: 'BRUC',
    type: 'vaccination',
    frequency: {
      type: 'age_based',
      ageMonthsMin: 3,
      ageMonthsMax: 11,
    },
    targetAnimals: {
      allCattle: false,
      sexFilter: 'female',
      breedFilter: [],
      minAgeDays: 90,
      maxAgeDays: 330,
    },
    legalBasis: '가축전염병예방법 제15조',
    penalty: true,
    priority: 1,
  },
  {
    id: 'brucellosis_annual',
    name: '브루셀라 검사',
    nameEn: 'Brucellosis Test',
    diseaseCode: 'BRUC',
    type: 'inspection',
    frequency: {
      type: 'annual',
      intervalDays: 365,
    },
    targetAnimals: {
      allCattle: false,
      sexFilter: 'female',
      breedFilter: [],
      reproductiveStatus: ['pregnant', 'lactating', 'open'],
    },
    legalBasis: '가축전염병예방법 제11조',
    penalty: true,
    priority: 1,
  },
  {
    id: 'tuberculosis',
    name: '결핵 검사',
    nameEn: 'Tuberculosis Test',
    diseaseCode: 'TB',
    type: 'inspection',
    frequency: {
      type: 'annual',
      intervalDays: 365,
    },
    targetAnimals: {
      allCattle: true,
      breedFilter: [],
    },
    legalBasis: '가축전염병예방법 제11조',
    penalty: true,
    priority: 1,
  },
  {
    id: 'anthrax',
    name: '탄저',
    nameEn: 'Anthrax',
    diseaseCode: 'ANTH',
    type: 'vaccination',
    frequency: {
      type: 'fixed_months',
      months: [5],          // 고위험지역 5월
    },
    targetAnimals: {
      allCattle: true,
      breedFilter: [],
    },
    legalBasis: '가축전염병예방법 제15조',
    penalty: true,
    priority: 3,            // 고위험지역 한정
  },
  {
    id: 'lumpy_skin',
    name: '럼피스킨',
    nameEn: 'Lumpy Skin Disease',
    diseaseCode: 'LSD',
    type: 'vaccination',
    frequency: {
      type: 'fixed_months',
      months: [3, 9],      // 상반기 3월, 하반기 9월
    },
    targetAnimals: {
      allCattle: true,
      breedFilter: [],
    },
    legalBasis: '가축전염병예방법 제15조, 2023년 신규 편입',
    penalty: true,
    priority: 1,
  },
  {
    id: 'bef',
    name: '소유행열',
    nameEn: 'Bovine Ephemeral Fever',
    diseaseCode: 'BEF',
    type: 'vaccination',
    frequency: {
      type: 'fixed_months',
      months: [5],          // 여름 전 접종
    },
    targetAnimals: {
      allCattle: true,
      breedFilter: [],
    },
    legalBasis: '가축방역 시행계획',
    penalty: false,
    priority: 2,
  },
] as const;

// ===========================
// 유틸리티
// ===========================

/** 프로토콜 ID로 조회 */
export function getProtocolById(id: string): VaccineProtocol | undefined {
  return VACCINE_PROTOCOLS.find((p) => p.id === id);
}

/** 우선순위별 필터 */
export function getRequiredProtocols(): readonly VaccineProtocol[] {
  return VACCINE_PROTOCOLS.filter((p) => p.priority === 1);
}

/** 접종 vs 검사 분류 */
export function getVaccinationProtocols(): readonly VaccineProtocol[] {
  return VACCINE_PROTOCOLS.filter((p) => p.type === 'vaccination');
}

export function getInspectionProtocols(): readonly VaccineProtocol[] {
  return VACCINE_PROTOCOLS.filter((p) => p.type === 'inspection');
}

/** 특정 월에 시행해야 하는 프로토콜 */
export function getProtocolsForMonth(month: number): readonly VaccineProtocol[] {
  return VACCINE_PROTOCOLS.filter((p) => {
    if (p.frequency.type === 'fixed_months') {
      return p.frequency.months?.includes(month) ?? false;
    }
    return false;
  });
}

/** 접종 상태 라벨 */
export const VACCINATION_STATUS_LABELS: Record<string, string> = {
  pending: '예정',
  completed: '완료',
  overdue: '미접종',
  scheduled: '스케줄',
  skipped: '건너뜀',
} as const;

/** 검사 결과 라벨 */
export const INSPECTION_RESULT_LABELS: Record<string, string> = {
  negative: '음성',
  positive: '양성',
  pending: '검사중',
  unknown: '미확인',
} as const;
