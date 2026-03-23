// 법정전염병 6종 체온 시그니처 DB
// FMD(구제역), 브루셀라, 결핵, BEF(유행열), LSD(럼피스킨), 탄저
// matchSignature() → 유사도 0~100
// 50%+ → 방역관 알림, 80%+ → KAHIS 예비신고 준비

// ===========================
// 타입
// ===========================

export type LegalDiseaseCode = 'FMD' | 'BRUCELLOSIS' | 'TB' | 'BEF' | 'LSD' | 'ANTHRAX';

export interface DiseaseSignature {
  readonly code: LegalDiseaseCode;
  readonly nameKr: string;
  readonly nameEn: string;
  readonly tempPattern: TemperaturePattern;
  readonly ruminationPattern: RuminationPattern;
  readonly transmissionRoutes: readonly string[];
  readonly incubationDays: { readonly min: number; readonly max: number };
  readonly r0: number;         // 기초감염재생산수
  readonly airborne: boolean;  // 공기 전파 가능 여부
  readonly kahisCode: string;  // KAHIS 신고 코드
}

interface TemperaturePattern {
  readonly onset: 'sudden' | 'gradual' | 'persistent';
  readonly peakRange: { readonly min: number; readonly max: number };  // °C
  readonly duration: { readonly min: number; readonly max: number };   // 시간
  readonly fluctuating: boolean;  // 체온 기복 여부
}

interface RuminationPattern {
  readonly dropPercent: { readonly min: number; readonly max: number };
  readonly cessation: boolean;  // 완전 정지
}

export interface MatchResult {
  readonly code: LegalDiseaseCode;
  readonly nameKr: string;
  readonly similarity: number;   // 0-100
  readonly confidence: 'low' | 'medium' | 'high' | 'critical';
  readonly requiresVetAlert: boolean;      // >= 50
  readonly requiresKahisReport: boolean;  // >= 80
  readonly details: string;
}

// ===========================
// 법정전염병 시그니처 DB
// ===========================

const DISEASE_SIGNATURES: readonly DiseaseSignature[] = [
  {
    code: 'FMD',
    nameKr: '구제역',
    nameEn: 'Foot-and-Mouth Disease',
    tempPattern: {
      onset: 'sudden',
      peakRange: { min: 40.0, max: 41.5 },
      duration: { min: 24, max: 96 },
      fluctuating: false,
    },
    ruminationPattern: { dropPercent: { min: 40, max: 100 }, cessation: true },
    transmissionRoutes: ['contact', 'airborne', 'fomite'],
    incubationDays: { min: 2, max: 14 },
    r0: 10,
    airborne: true,
    kahisCode: '01',
  },
  {
    code: 'BRUCELLOSIS',
    nameKr: '브루셀라병',
    nameEn: 'Brucellosis',
    tempPattern: {
      onset: 'gradual',
      peakRange: { min: 39.5, max: 40.5 },
      duration: { min: 48, max: 240 },
      fluctuating: true,  // 파상열 (undulant fever)
    },
    ruminationPattern: { dropPercent: { min: 20, max: 50 }, cessation: false },
    transmissionRoutes: ['contact', 'ingestion'],
    incubationDays: { min: 14, max: 180 },
    r0: 2.5,
    airborne: false,
    kahisCode: '11',
  },
  {
    code: 'TB',
    nameKr: '결핵',
    nameEn: 'Bovine Tuberculosis',
    tempPattern: {
      onset: 'gradual',
      peakRange: { min: 39.0, max: 40.0 },
      duration: { min: 168, max: 999 },
      fluctuating: true,
    },
    ruminationPattern: { dropPercent: { min: 15, max: 40 }, cessation: false },
    transmissionRoutes: ['airborne', 'contact'],
    incubationDays: { min: 30, max: 730 },
    r0: 1.8,
    airborne: true,
    kahisCode: '12',
  },
  {
    code: 'BEF',
    nameKr: '유행열',
    nameEn: 'Bovine Ephemeral Fever',
    tempPattern: {
      onset: 'sudden',
      peakRange: { min: 40.0, max: 41.0 },
      duration: { min: 24, max: 72 },
      fluctuating: false,
    },
    ruminationPattern: { dropPercent: { min: 50, max: 100 }, cessation: true },
    transmissionRoutes: ['vector'],  // 흡혈 곤충 매개
    incubationDays: { min: 3, max: 7 },
    r0: 3.0,
    airborne: false,
    kahisCode: '34',
  },
  {
    code: 'LSD',
    nameKr: '럼피스킨병',
    nameEn: 'Lumpy Skin Disease',
    tempPattern: {
      onset: 'gradual',
      peakRange: { min: 40.0, max: 41.5 },
      duration: { min: 72, max: 192 },
      fluctuating: false,
    },
    ruminationPattern: { dropPercent: { min: 30, max: 60 }, cessation: false },
    transmissionRoutes: ['vector', 'contact'],
    incubationDays: { min: 4, max: 14 },
    r0: 4.0,
    airborne: false,
    kahisCode: '36',
  },
  {
    code: 'ANTHRAX',
    nameKr: '탄저',
    nameEn: 'Anthrax',
    tempPattern: {
      onset: 'sudden',
      peakRange: { min: 40.5, max: 42.0 },
      duration: { min: 6, max: 48 },
      fluctuating: false,
    },
    ruminationPattern: { dropPercent: { min: 80, max: 100 }, cessation: true },
    transmissionRoutes: ['ingestion', 'contact', 'airborne'],
    incubationDays: { min: 1, max: 5 },
    r0: 2.0,
    airborne: true,
    kahisCode: '04',
  },
];

export function getSignatureByCode(code: LegalDiseaseCode): DiseaseSignature | undefined {
  return DISEASE_SIGNATURES.find((s) => s.code === code);
}

export function getAllSignatures(): readonly DiseaseSignature[] {
  return DISEASE_SIGNATURES;
}

// ===========================
// 유사도 계산
// ===========================

export function matchSignature(
  currentTemp: number,
  peakTemp: number,            // 24시간 내 최고 체온
  onsetHours: number,          // 발열 시작부터 경과 시간
  ruminationDropPct: number,   // 반추 감소 % (양수)
  hasRuminationCessation: boolean,
): readonly MatchResult[] {
  return DISEASE_SIGNATURES.map((sig) => {
    let score = 0;
    let maxScore = 0;

    // 1. 최고 체온이 패턴 범위 내 (40점)
    maxScore += 40;
    if (peakTemp >= sig.tempPattern.peakRange.min && peakTemp <= sig.tempPattern.peakRange.max) {
      score += 40;
    } else if (peakTemp >= sig.tempPattern.peakRange.min - 0.3) {
      score += 20;  // 근접
    }

    // 2. 현재 체온이 기준 이상 (10점)
    maxScore += 10;
    if (currentTemp >= sig.tempPattern.peakRange.min - 0.5) {
      score += 10;
    }

    // 3. 발열 지속 시간 (20점)
    maxScore += 20;
    if (onsetHours >= sig.tempPattern.duration.min && onsetHours <= sig.tempPattern.duration.max) {
      score += 20;
    } else if (onsetHours >= sig.tempPattern.duration.min * 0.5) {
      score += 10;
    }

    // 4. 반추 감소 패턴 (20점)
    maxScore += 20;
    const rumMin = sig.ruminationPattern.dropPercent.min;
    const rumMax = sig.ruminationPattern.dropPercent.max;
    if (ruminationDropPct >= rumMin && ruminationDropPct <= rumMax) {
      score += 20;
    } else if (ruminationDropPct >= rumMin * 0.7) {
      score += 10;
    }

    // 5. 반추 완전 정지 (10점)
    maxScore += 10;
    if (sig.ruminationPattern.cessation && hasRuminationCessation) {
      score += 10;
    } else if (!sig.ruminationPattern.cessation && !hasRuminationCessation) {
      score += 5;
    }

    const similarity = Math.round((score / maxScore) * 100);
    const confidence = getConfidence(similarity);

    return {
      code: sig.code,
      nameKr: sig.nameKr,
      similarity,
      confidence,
      requiresVetAlert: similarity >= 50,
      requiresKahisReport: similarity >= 80,
      details: buildDetails(sig, similarity, currentTemp, peakTemp),
    };
  }).sort((a, b) => b.similarity - a.similarity);
}

function getConfidence(similarity: number): MatchResult['confidence'] {
  if (similarity >= 80) return 'critical';
  if (similarity >= 60) return 'high';
  if (similarity >= 40) return 'medium';
  return 'low';
}

function buildDetails(
  sig: DiseaseSignature,
  similarity: number,
  currentTemp: number,
  peakTemp: number,
): string {
  return `${sig.nameKr}(${sig.code}): 유사도 ${similarity}% — 현재 ${currentTemp.toFixed(1)}°C, 최고 ${peakTemp.toFixed(1)}°C, 잠복기 ${sig.incubationDays.min}-${sig.incubationDays.max}일`;
}
