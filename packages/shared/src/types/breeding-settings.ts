// 목장별 번식·대시보드 설정 — smaXtec "Dashboard settings" 화면과 1:1 대응
//
// 목장마다 건유 시점·장기공태 기준·임신감정 시기 등이 다르다. 이 값들이 리마인더·
// 번식 인사이트·수정 적기 계산에 그대로 들어가므로, 어디서 온 값인지(기본값/smaXtec/
// 직접 입력)를 항상 함께 다룬다.

/** 설정 키 — farms.breeding_settings JSONB 의 필드명과 동일 */
export type BreedingSettingKey =
  // To-do list
  | 'unacknowledgedHealthAlertHours'
  | 'heatListHours'
  | 'estrusRecurrenceDays'
  | 'minBreedingAgeMonths'
  | 'estrusDetectionAfterDim'
  | 'inseminationWindowStartHours'
  | 'inseminationWindowEndHours'
  | 'sexedSemenWindowStartHours'
  | 'sexedSemenWindowEndHours'
  | 'pregnancyCheckDays'
  | 'gestationDays'
  | 'heatDetectionDuringPregnancy'
  | 'pregnantHeatIntervalMinDays'
  | 'pregnantHeatIntervalMaxDays'
  | 'abortSuspectExcludeDaysBeforeCalving'
  | 'dryOffBeforeCalvingDays'
  | 'calvingSoonDays'
  // Health status
  | 'healthAlertListHours'
  | 'healthGraphDays'
  // Fertility status
  | 'freshCowDim'
  | 'noHeatDim'
  | 'longOpenDaysDim';

/** smaXtec 설정 화면의 구획 */
export type BreedingSettingGroup = 'todo' | 'health' | 'fertility';

/** 값의 출처 — UI·로그에서 항상 노출한다 */
export type BreedingSettingSource = 'default' | 'smaxtec' | 'manual';

export interface BreedingSettingDefinition {
  readonly key: BreedingSettingKey;
  readonly group: BreedingSettingGroup;
  readonly labelKo: string;
  /** smaXtec 화면 문구 — 농장주가 그대로 옮겨 적을 수 있게 */
  readonly smaxtecLabel: string;
  readonly unit: string;
  /** number = 수치, boolean = 0/1 토글 */
  readonly kind: 'number' | 'boolean';
  /** CowTalk 기본값 (설정이 없을 때 적용). null = 미사용 */
  readonly defaultValue: number | null;
  /** smaXtec 공장 기본값 (참고 표시용) */
  readonly smaxtecDefault: number | null;
  readonly min: number;
  readonly max: number;
  /** null 허용 (성감별 정액 수정적기 = 미사용) */
  readonly nullable?: boolean;
  /** 이 값을 쓰는 CowTalk 기능 — 정직성: 저장만 되고 아직 안 쓰는 값은 그렇다고 밝힌다 */
  readonly usedBy: string;
}

/** 저장 형식 (farms.breeding_settings JSONB) — 값 + 출처 메타 */
export type StoredBreedingSettings = {
  readonly [K in BreedingSettingKey]?: number | null;
} & {
  /** smaXtec 마지막 동기화 시각 */
  readonly syncedAt?: string;
  /** 직접 입력으로 지정된 키 — smaXtec 동기화가 덮어쓰지 않는다 */
  readonly manualKeys?: readonly BreedingSettingKey[];
  readonly manualUpdatedAt?: string;
  readonly manualUpdatedBy?: string;
  /** smaXtec settings API 원본 — 키 이름 검증용 (매핑은 실응답 확인 전까지 추정) */
  readonly smaxtecRaw?: Readonly<Record<string, unknown>>;
};

/** 기본값까지 병합된 유효값 — 서비스 로직은 이것만 쓴다 */
export type ResolvedBreedingSettings = {
  readonly [K in BreedingSettingKey]: number | null;
} & {
  readonly syncedAt?: string;
};

/** 화면 한 행 */
export interface BreedingSettingView {
  readonly key: BreedingSettingKey;
  readonly group: BreedingSettingGroup;
  readonly labelKo: string;
  readonly smaxtecLabel: string;
  readonly unit: string;
  readonly kind: 'number' | 'boolean';
  readonly value: number | null;
  readonly defaultValue: number | null;
  readonly smaxtecDefault: number | null;
  readonly min: number;
  readonly max: number;
  readonly nullable: boolean;
  readonly source: BreedingSettingSource;
  readonly usedBy: string;
}

/** GET/PUT /breeding/farm/:farmId/settings/detail 응답 */
export interface FarmBreedingSettingsResponse {
  readonly farmId: string;
  readonly settings: readonly BreedingSettingView[];
  readonly syncedAt: string | null;
  readonly manualUpdatedAt: string | null;
}

/** PUT 본문 — 값 null 은 "직접 입력 해제(기본값/smaXtec 값으로 복귀)" */
export type BreedingSettingsPatch = {
  readonly [K in BreedingSettingKey]?: number | null;
};
