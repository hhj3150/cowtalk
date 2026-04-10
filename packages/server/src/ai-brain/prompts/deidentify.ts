// AI 프롬프트 전송 데이터 비식별화 유틸
//
// Claude API 호출 시 개체 식별자(귀표번호·이력번호·농장명·주소 등)를
// 결정적 해시 토큰으로 치환한다. 원본 데이터는 국내 DB에만 저장되고,
// 외부 LLM으로는 비식별 토큰만 전송된다.
//
// 설계 원칙:
// - 결정적(deterministic): 같은 입력 → 같은 토큰 (대화 맥락 유지)
// - 단방향(one-way): LLM 응답에서 토큰을 보고 원본 복원 불가
// - 불변(immutable): 원본 객체를 수정하지 않고 새 객체 반환
// - 의미 보존: 분석에 필요한 수치·이벤트 타입은 모두 유지
//
// 사용 예:
//   const safe = deidentifyAnimalProfile(profile)
//   // safe.earTag === "COW-a3f2b1" (원본: "002132665191")
//   // safe.farmName === "FARM-9c1d" (원본: "해돋이목장")

import { createHash } from 'node:crypto';

import type { AnimalProfile, FarmProfile } from '@cowtalk/shared';

// ============================================================
// 해시 토큰 생성
// ============================================================

/**
 * 원본 식별자를 결정적 해시 토큰으로 치환한다.
 * 같은 (value + namespace) 조합은 항상 같은 토큰을 생성한다.
 *
 * @param value - 원본 식별자 문자열
 * @param prefix - 토큰 접두사 (예: "COW", "FARM")
 * @param length - 해시 본문 길이 (기본 6자)
 */
export function hashIdentifier(value: string, prefix: string, length = 6): string {
  if (value.length === 0) return `${prefix}-UNKNOWN`;

  // SHA-256 기반 짧은 결정적 해시. HMAC까지는 필요 없음 (LLM 전송용)
  const hash = createHash('sha256').update(`${prefix}:${value}`).digest('hex');
  return `${prefix}-${hash.slice(0, length)}`;
}

/**
 * 민감 필드를 마스킹된 토큰 또는 [MASKED]로 치환한다.
 */
export function maskField(value: string | null | undefined): string {
  if (value === null || value === undefined || value.length === 0) return '[EMPTY]';
  return '[MASKED]';
}

// ============================================================
// AnimalProfile 비식별화
// ============================================================

/**
 * 개체 프로필에서 직접 식별자를 제거한다.
 * - 귀표번호, 이력번호: 해시 토큰으로 치환
 * - 농장명, 주소, 지역: 해시 토큰 또는 마스킹
 * - 센서 수치, 이벤트 타입, 산차, 품종: 그대로 보존
 */
export function deidentifyAnimalProfile(profile: AnimalProfile): AnimalProfile {
  const animalToken = hashIdentifier(profile.animalId, 'COW');
  const farmToken = hashIdentifier(profile.farmId, 'FARM', 4);

  return {
    ...profile,
    earTag: animalToken,
    traceId: profile.traceId === null ? null : hashIdentifier(profile.traceId, 'TR', 8),
    farmName: farmToken,
    region: maskRegion(profile.region),
  };
}

/**
 * 지역명은 시도 단위까지만 유지하고 시군구 이하는 마스킹한다.
 * 방역 분석에 시도 수준의 지역 정보는 필요하지만, 정확한 주소는 불필요.
 */
function maskRegion(region: string | null | undefined): string {
  if (region === null || region === undefined || region.length === 0) return '[EMPTY]';

  // 시도 단위 추출 (예: "경기도 포천시" → "경기도")
  const provinceMatch = /^(서울특별시|부산광역시|대구광역시|인천광역시|광주광역시|대전광역시|울산광역시|세종특별자치시|경기도|강원특별자치도|강원도|충청북도|충청남도|전라북도|전북특별자치도|전라남도|경상북도|경상남도|제주특별자치도)/.exec(region);
  if (provinceMatch) return provinceMatch[1] ?? '[MASKED]';

  // 패턴 미일치 시 전체 마스킹
  return '[REGION-MASKED]';
}

// ============================================================
// FarmProfile 비식별화
// ============================================================

/**
 * 농장 프로필에서 직접 식별자를 제거한다.
 * - 농장명, 주소: 해시 토큰 또는 마스킹
 * - 두수, 건강점수, 이벤트 통계: 그대로 보존
 * - 개별 개체(animalProfiles)는 각자 비식별화
 */
export function deidentifyFarmProfile(profile: FarmProfile): FarmProfile {
  const farmToken = hashIdentifier(profile.farmId, 'FARM', 4);

  return {
    ...profile,
    name: farmToken,
    address: maskField(profile.address),
    region: maskRegion(profile.region),
    animalProfiles: profile.animalProfiles.map((a) => deidentifyAnimalProfile(a)),
  };
}

// ============================================================
// 범용 JSON 비식별화 (보고서 생성기용)
// ============================================================

/**
 * 마스킹 대상 키 이름 목록.
 * 객체를 재귀적으로 순회하며 해당 키의 값을 마스킹한다.
 */
const SENSITIVE_KEYS = new Set<string>([
  'earTag',
  'ear_tag',
  'traceId',
  'trace_id',
  'farmName',
  'farm_name',
  'ownerName',
  'owner_name',
  'address',
  'phone',
  'phoneNumber',
  'phone_number',
  'email',
  'residentNumber',
  'resident_number',
]);

/**
 * 범용 DB 데이터 비식별화.
 * 알려진 민감 키를 재귀적으로 찾아 해시 토큰 또는 마스킹으로 치환한다.
 * AnimalProfile·FarmProfile 타입이 아닌 일반 ReportData 등에 사용.
 */
export function deidentifyRecord(data: unknown): unknown {
  if (data === null || data === undefined) return data;

  if (Array.isArray(data)) {
    return data.map((item) => deidentifyRecord(item));
  }

  if (typeof data === 'object') {
    const entries = Object.entries(data as Record<string, unknown>);
    const masked: Record<string, unknown> = {};
    for (const [key, value] of entries) {
      if (SENSITIVE_KEYS.has(key)) {
        masked[key] = maskSensitiveValue(key, value);
      } else {
        masked[key] = deidentifyRecord(value);
      }
    }
    return masked;
  }

  return data;
}

function maskSensitiveValue(key: string, value: unknown): string {
  if (value === null || value === undefined) return '[EMPTY]';
  const str = String(value);
  if (str.length === 0) return '[EMPTY]';

  // 해시 가능한 식별자는 결정적 토큰으로
  if (key === 'earTag' || key === 'ear_tag') return hashIdentifier(str, 'COW');
  if (key === 'traceId' || key === 'trace_id') return hashIdentifier(str, 'TR', 8);
  if (key === 'farmName' || key === 'farm_name') return hashIdentifier(str, 'FARM', 4);

  // 그 외 PII는 완전 마스킹
  return '[MASKED]';
}

// ============================================================
// 역매핑 Deidentifier (Claude 호출 전후 처리용)
// ============================================================

/**
 * 비식별화된 프로필 + 역매핑 함수.
 * Claude 응답 텍스트에 포함된 비식별 토큰을 원본 식별자로 복원한다.
 */
export interface DeidentifierResult<T> {
  readonly profile: T;
  readonly rehydrate: (text: string) => string;
  readonly rehydrateRecord: (record: unknown) => unknown;
}

/**
 * 개체 프로필용 Deidentifier 생성.
 * 원본 → 토큰 매핑 테이블을 만들고, 역매핑 함수를 함께 반환한다.
 */
export function createAnimalDeidentifier(profile: AnimalProfile): DeidentifierResult<AnimalProfile> {
  const reverseMap = new Map<string, string>();

  const earTagToken = hashIdentifier(profile.animalId, 'COW');
  reverseMap.set(earTagToken, profile.earTag);

  const traceToken = profile.traceId !== null ? hashIdentifier(profile.traceId, 'TR', 8) : null;
  if (traceToken !== null && profile.traceId !== null) {
    reverseMap.set(traceToken, profile.traceId);
  }

  const farmToken = hashIdentifier(profile.farmId, 'FARM', 4);
  reverseMap.set(farmToken, profile.farmName);

  const deidentified: AnimalProfile = {
    ...profile,
    earTag: earTagToken,
    traceId: traceToken,
    farmName: farmToken,
    region: maskRegion(profile.region),
  };

  return {
    profile: deidentified,
    rehydrate: (text: string) => rehydrateText(text, reverseMap),
    rehydrateRecord: (record: unknown) => rehydrateRecursive(record, reverseMap),
  };
}

/**
 * 농장 프로필용 Deidentifier 생성.
 * 농장 본체 + 포함된 모든 개체 프로필을 비식별화한다.
 */
export function createFarmDeidentifier(profile: FarmProfile): DeidentifierResult<FarmProfile> {
  const reverseMap = new Map<string, string>();

  const farmToken = hashIdentifier(profile.farmId, 'FARM', 4);
  reverseMap.set(farmToken, profile.name);

  const deidentifiedAnimals = profile.animalProfiles.map((a) => {
    const earTagToken = hashIdentifier(a.animalId, 'COW');
    reverseMap.set(earTagToken, a.earTag);

    const traceToken = a.traceId !== null ? hashIdentifier(a.traceId, 'TR', 8) : null;
    if (traceToken !== null && a.traceId !== null) {
      reverseMap.set(traceToken, a.traceId);
    }

    return {
      ...a,
      earTag: earTagToken,
      traceId: traceToken,
      farmName: farmToken,
      region: maskRegion(a.region),
    };
  });

  const deidentified: FarmProfile = {
    ...profile,
    name: farmToken,
    address: '[MASKED]',
    region: maskRegion(profile.region),
    animalProfiles: deidentifiedAnimals,
  };

  return {
    profile: deidentified,
    rehydrate: (text: string) => rehydrateText(text, reverseMap),
    rehydrateRecord: (record: unknown) => rehydrateRecursive(record, reverseMap),
  };
}

/**
 * 문자열 내 모든 비식별 토큰을 원본 식별자로 치환한다.
 */
function rehydrateText(text: string, reverseMap: ReadonlyMap<string, string>): string {
  if (text.length === 0) return text;
  let result = text;
  for (const [token, original] of reverseMap.entries()) {
    // 토큰 형식은 "PREFIX-HEX"라 ReDoS 위험 없음
    result = result.split(token).join(original);
  }
  return result;
}

/**
 * 구조화된 응답(객체/배열)을 재귀 순회하며 문자열 필드에서 토큰을 원본으로 복원.
 * Claude 응답의 animal_highlights, reasoning, summary 등에 포함된 토큰을 복원한다.
 */
function rehydrateRecursive(record: unknown, reverseMap: ReadonlyMap<string, string>): unknown {
  if (typeof record === 'string') {
    return rehydrateText(record, reverseMap);
  }
  if (Array.isArray(record)) {
    return record.map((item) => rehydrateRecursive(item, reverseMap));
  }
  if (record !== null && typeof record === 'object') {
    const entries = Object.entries(record as Record<string, unknown>);
    const out: Record<string, unknown> = {};
    for (const [key, value] of entries) {
      out[key] = rehydrateRecursive(value, reverseMap);
    }
    return out;
  }
  return record;
}
