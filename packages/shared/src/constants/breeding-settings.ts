// 목장별 번식·대시보드 설정 카탈로그 + 순수 함수 (병합·검증·직접입력·smaXtec 병합)
//
// 우선순위: 직접 입력(manual) > smaXtec 동기화 > CowTalk 기본값.
// CowTalk 기본값은 기존 동작을 깨지 않도록 종전 하드코딩 값을 유지한다 (비파괴 원칙).
// 목장 실값은 이 화면에서 입력하거나 smaXtec 에서 동기화한다.

import type {
  BreedingSettingDefinition,
  BreedingSettingKey,
  BreedingSettingView,
  BreedingSettingsPatch,
  ResolvedBreedingSettings,
  StoredBreedingSettings,
} from '../types/breeding-settings.js';

export const BREEDING_SETTING_DEFS: readonly BreedingSettingDefinition[] = [
  // ── To-do list ──
  {
    key: 'unacknowledgedHealthAlertHours', group: 'todo', kind: 'number',
    labelKo: '미확인 건강 알림 기준', unit: '시간',
    smaxtecLabel: '지난 N시간 내 건강 알림이 확인되지 않았습니다',
    defaultValue: 48, smaxtecDefault: 48, min: 1, max: 720,
    usedBy: '저장만 (할 일 목록 연동 예정)',
  },
  {
    key: 'heatListHours', group: 'todo', kind: 'number',
    labelKo: '발정 탐지 목록 기간', unit: '시간',
    smaxtecLabel: '지난 N시간 동안 발정 탐지된 개체들',
    defaultValue: 36, smaxtecDefault: 36, min: 1, max: 168,
    usedBy: '저장만 (할 일 목록 연동 예정)',
  },
  {
    key: 'estrusRecurrenceDays', group: 'todo', kind: 'number',
    labelKo: '발정재귀일', unit: '일',
    smaxtecLabel: '발정재귀일',
    defaultValue: 21, smaxtecDefault: 20, min: 15, max: 30,
    usedBy: '번식 캘린더 다음 발정 예측, 수정 후 재발정 확인',
  },
  {
    key: 'minBreedingAgeMonths', group: 'todo', kind: 'number',
    labelKo: '육성우 최소 교배 월령', unit: '개월',
    smaxtecLabel: '육성우 최소 교배 일령',
    defaultValue: 12, smaxtecDefault: 12, min: 8, max: 24,
    usedBy: '수정 전 체크 (월령 미달 경고)',
  },
  {
    key: 'estrusDetectionAfterDim', group: 'todo', kind: 'number',
    labelKo: '분만 후 발정 탐지 시작', unit: '착유일',
    smaxtecLabel: '발정 탐지: N 착유일',
    defaultValue: 20, smaxtecDefault: 20, min: 0, max: 90,
    usedBy: '저장만 (발정 필터 연동 예정)',
  },
  {
    key: 'inseminationWindowStartHours', group: 'todo', kind: 'number',
    labelKo: '수정 적기 시작 (일반 정액)', unit: '시간',
    smaxtecLabel: 'The optimum range for insemination after oestrus peak (시작)',
    defaultValue: 10, smaxtecDefault: 10, min: 0, max: 48,
    usedBy: '수정 적기 계산·알림',
  },
  {
    key: 'inseminationWindowEndHours', group: 'todo', kind: 'number',
    labelKo: '수정 적기 종료 (일반 정액)', unit: '시간',
    smaxtecLabel: 'The optimum range for insemination after oestrus peak (종료)',
    defaultValue: 18, smaxtecDefault: 18, min: 1, max: 48,
    usedBy: '수정 적기 계산·알림',
  },
  {
    key: 'sexedSemenWindowStartHours', group: 'todo', kind: 'number', nullable: true,
    labelKo: '수정 적기 시작 (성감별 정액)', unit: '시간',
    smaxtecLabel: '성감별 정액 수정 적기 (시작)',
    defaultValue: null, smaxtecDefault: null, min: 0, max: 48,
    usedBy: '저장만 (정액 종류별 분기 예정)',
  },
  {
    key: 'sexedSemenWindowEndHours', group: 'todo', kind: 'number', nullable: true,
    labelKo: '수정 적기 종료 (성감별 정액)', unit: '시간',
    smaxtecLabel: '성감별 정액 수정 적기 (종료)',
    defaultValue: null, smaxtecDefault: null, min: 1, max: 48,
    usedBy: '저장만 (정액 종류별 분기 예정)',
  },
  {
    key: 'pregnancyCheckDays', group: 'todo', kind: 'number',
    labelKo: '임신감정 시기 (수정 후)', unit: '일',
    smaxtecLabel: '최근 수정일로부터 N일 경과한 개체(임신감정 전)',
    defaultValue: 28, smaxtecDefault: 40, min: 20, max: 90,
    usedBy: '임신감정 리마인더, 번식 파이프라인',
  },
  {
    key: 'gestationDays', group: 'todo', kind: 'number',
    labelKo: '임신 기간', unit: '일',
    smaxtecLabel: '임신 기간',
    defaultValue: 280, smaxtecDefault: 280, min: 260, max: 300,
    usedBy: '분만 예정일, 건유·분만 임박 리마인더',
  },
  {
    key: 'heatDetectionDuringPregnancy', group: 'todo', kind: 'boolean',
    labelKo: '임신우 발정 탐지 계속', unit: '',
    smaxtecLabel: 'Heat detection continues for pregnant animals',
    defaultValue: 0, smaxtecDefault: 0, min: 0, max: 1,
    usedBy: '유산 의심 판정 참고 (비활성이면 임신우 발정 알림 자체가 드묾)',
  },
  {
    key: 'pregnantHeatIntervalMinDays', group: 'todo', kind: 'number',
    labelKo: '유산 의심: 임신우 활동량 증가 간격 (최소)', unit: '일',
    smaxtecLabel: '활동량 증가 알림의 간격이 N - M일인 임신우 (최소)',
    defaultValue: 18, smaxtecDefault: 18, min: 1, max: 60,
    usedBy: '유산 의심 인사이트 (주기성 발정 신호 판정)',
  },
  {
    key: 'pregnantHeatIntervalMaxDays', group: 'todo', kind: 'number',
    labelKo: '유산 의심: 임신우 활동량 증가 간격 (최대)', unit: '일',
    smaxtecLabel: '활동량 증가 알림의 간격이 N - M일인 임신우 (최대)',
    defaultValue: 26, smaxtecDefault: 26, min: 1, max: 60,
    usedBy: '유산 의심 인사이트 (주기성 발정 신호 판정)',
  },
  {
    key: 'abortSuspectExcludeDaysBeforeCalving', group: 'todo', kind: 'number',
    labelKo: '유산 의심 제외 (분만 예정 N일 전부터)', unit: '일',
    smaxtecLabel: 'Pregnant animals which don\'t show up on the list "Abort suspected" after reaching certain day before expected calving date',
    defaultValue: 60, smaxtecDefault: 60, min: 0, max: 150,
    usedBy: '유산 의심 인사이트 (분만 임박우 제외)',
  },
  {
    key: 'dryOffBeforeCalvingDays', group: 'todo', kind: 'number',
    labelKo: '건유 알림 (분만 N일 전)', unit: '일',
    smaxtecLabel: '건유시키지 않은 분만 N일 전 개체',
    defaultValue: 90, smaxtecDefault: 80, min: 30, max: 120,
    usedBy: '건유 리마인더, 번식 캘린더',
  },
  {
    key: 'calvingSoonDays', group: 'todo', kind: 'number',
    labelKo: '분만 임박 알림 (예정일 N일 전부터)', unit: '일',
    smaxtecLabel: '예상 분만일 N일 미만의 개체들',
    defaultValue: 7, smaxtecDefault: 14, min: 1, max: 30,
    usedBy: '분만 임박 리마인더',
  },
  // ── Health status ──
  {
    key: 'healthAlertListHours', group: 'health', kind: 'number',
    labelKo: '건강 알림 목록 기간', unit: '시간',
    smaxtecLabel: 'N시간 내 건강 알림 발생한 개체들',
    defaultValue: 24, smaxtecDefault: 24, min: 1, max: 168,
    usedBy: '저장만 (건강 현황 연동 예정)',
  },
  {
    key: 'healthGraphDays', group: 'health', kind: 'number',
    labelKo: '건강 그래프 범위', unit: '일',
    smaxtecLabel: '그래프 내 범위',
    defaultValue: 7, smaxtecDefault: 7, min: 1, max: 90,
    usedBy: '저장만 (건강 그래프 연동 예정)',
  },
  // ── Fertility status ──
  {
    key: 'freshCowDim', group: 'fertility', kind: 'number',
    labelKo: '분만우 기준 (비유일수 미만)', unit: '일',
    smaxtecLabel: '분만우: 비유일수 < N일',
    defaultValue: 30, smaxtecDefault: 30, min: 1, max: 90,
    usedBy: '저장만 (번식 현황 분류 연동 예정)',
  },
  {
    key: 'noHeatDim', group: 'fertility', kind: 'number',
    labelKo: '무발정우 기준 (착유일 초과)', unit: '일',
    smaxtecLabel: '발정 아닌 개체 목록에 있는 개체들: 착유일 > N일',
    defaultValue: 50, smaxtecDefault: 50, min: 20, max: 150,
    usedBy: '무발정우 인사이트',
  },
  {
    key: 'longOpenDaysDim', group: 'fertility', kind: 'number',
    labelKo: '장기공태우 기준 (DIM 초과)', unit: '일',
    smaxtecLabel: '장기공태우 목록에 있는 개체들: DIM > N일',
    defaultValue: 200, smaxtecDefault: 200, min: 60, max: 400,
    usedBy: '장기공태 리마인더, 수정 전 체크',
  },
] as const;

export const BREEDING_SETTING_MAP: Readonly<Record<BreedingSettingKey, BreedingSettingDefinition>> =
  Object.fromEntries(BREEDING_SETTING_DEFS.map((d) => [d.key, d])) as Record<
    BreedingSettingKey,
    BreedingSettingDefinition
  >;

export const BREEDING_SETTING_KEYS: readonly BreedingSettingKey[] = BREEDING_SETTING_DEFS.map((d) => d.key);

export function isBreedingSettingKey(key: string): key is BreedingSettingKey {
  return key in BREEDING_SETTING_MAP;
}

/** 저장값이 해당 키에 유효한 값인지 (타입·nullable 만 — 범위는 validate 에서) */
function storedValueOf(stored: StoredBreedingSettings, key: BreedingSettingKey): number | null | undefined {
  const raw = stored[key];
  if (raw === null) return BREEDING_SETTING_MAP[key].nullable ? null : undefined;
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw;
  return undefined;
}

/** 기본값 병합 — 저장이 비었거나 깨진 키는 기본값으로 */
export function resolveBreedingSettings(stored: StoredBreedingSettings | null | undefined): ResolvedBreedingSettings {
  const src = stored ?? {};
  const out: Record<string, unknown> = {};
  for (const def of BREEDING_SETTING_DEFS) {
    const v = storedValueOf(src, def.key);
    out[def.key] = v === undefined ? def.defaultValue : v;
  }
  if (src.syncedAt) out.syncedAt = src.syncedAt;
  return out as ResolvedBreedingSettings;
}

/** 화면용 행 목록 (값·출처 포함) */
export function buildBreedingSettingViews(stored: StoredBreedingSettings | null | undefined): BreedingSettingView[] {
  const src = stored ?? {};
  const manual = new Set(src.manualKeys ?? []);
  return BREEDING_SETTING_DEFS.map((def) => {
    const v = storedValueOf(src, def.key);
    const source = v === undefined ? 'default' : manual.has(def.key) ? 'manual' : 'smaxtec';
    return {
      key: def.key,
      group: def.group,
      labelKo: def.labelKo,
      smaxtecLabel: def.smaxtecLabel,
      unit: def.unit,
      kind: def.kind,
      value: v === undefined ? def.defaultValue : v,
      defaultValue: def.defaultValue,
      smaxtecDefault: def.smaxtecDefault,
      min: def.min,
      max: def.max,
      nullable: def.nullable === true,
      source,
      usedBy: def.usedBy,
    };
  });
}

export type BreedingSettingsValidation =
  | { readonly ok: true; readonly patch: BreedingSettingsPatch }
  | { readonly ok: false; readonly reason: string };

/**
 * 직접 입력 패치 검증 — 알 수 없는 키·범위 밖·정수 아님·교차 조건(시작<종료, 최소<최대) 거부.
 * 교차 조건은 "패치 적용 후의 유효값" 기준으로 본다 (한쪽만 바꿔도 모순이면 거부).
 */
export function validateBreedingSettingsPatch(
  body: unknown,
  current: StoredBreedingSettings | null | undefined,
): BreedingSettingsValidation {
  if (body == null || typeof body !== 'object' || Array.isArray(body)) {
    return { ok: false, reason: '설정 값 객체가 필요합니다' };
  }
  const entries = Object.entries(body as Record<string, unknown>);
  if (entries.length === 0) return { ok: false, reason: '수정할 항목이 없습니다' };

  const patch: Record<string, number | null> = {};
  for (const [key, value] of entries) {
    if (!isBreedingSettingKey(key)) return { ok: false, reason: `알 수 없는 설정 키: ${key}` };
    const def = BREEDING_SETTING_MAP[key];
    if (value === null) {
      patch[key] = null; // 직접 입력 해제
      continue;
    }
    if (typeof value !== 'number' || !Number.isFinite(value) || !Number.isInteger(value)) {
      return { ok: false, reason: `${def.labelKo}: 정수만 입력할 수 있습니다` };
    }
    if (value < def.min || value > def.max) {
      return { ok: false, reason: `${def.labelKo}: ${def.min}~${def.max}${def.unit} 범위여야 합니다` };
    }
    patch[key] = value;
  }

  const after = resolveBreedingSettings(applyManualPatch(current ?? {}, patch, 'validate', new Date(0)));
  const pairs: ReadonlyArray<readonly [BreedingSettingKey, BreedingSettingKey]> = [
    ['inseminationWindowStartHours', 'inseminationWindowEndHours'],
    ['sexedSemenWindowStartHours', 'sexedSemenWindowEndHours'],
    ['pregnantHeatIntervalMinDays', 'pregnantHeatIntervalMaxDays'],
  ];
  for (const [lo, hi] of pairs) {
    const a = after[lo];
    const b = after[hi];
    if ((a === null) !== (b === null)) {
      return { ok: false, reason: `${BREEDING_SETTING_MAP[lo].labelKo}/${BREEDING_SETTING_MAP[hi].labelKo}: 둘 다 입력하거나 둘 다 비워야 합니다` };
    }
    if (a !== null && b !== null && a >= b) {
      return { ok: false, reason: `${BREEDING_SETTING_MAP[lo].labelKo}은(는) ${BREEDING_SETTING_MAP[hi].labelKo}보다 작아야 합니다` };
    }
  }
  if (after.dryOffBeforeCalvingDays !== null && after.gestationDays !== null
    && after.dryOffBeforeCalvingDays >= after.gestationDays) {
    return { ok: false, reason: '건유 알림 일수는 임신 기간보다 작아야 합니다' };
  }

  return { ok: true, patch: patch as BreedingSettingsPatch };
}

/**
 * 직접 입력 적용 — 값은 저장 + manualKeys 에 추가, null 은 키 삭제 + manualKeys 에서 제거
 * (그 키는 다음 smaXtec 동기화 값 또는 기본값으로 돌아간다).
 */
export function applyManualPatch(
  stored: StoredBreedingSettings,
  patch: BreedingSettingsPatch,
  userId: string,
  now: Date,
): StoredBreedingSettings {
  const next: Record<string, unknown> = { ...stored };
  const manual = new Set<BreedingSettingKey>(stored.manualKeys ?? []);
  for (const key of BREEDING_SETTING_KEYS) {
    if (!(key in patch)) continue;
    const value = patch[key];
    if (value === null || value === undefined) {
      delete next[key];
      manual.delete(key);
    } else {
      next[key] = value;
      manual.add(key);
    }
  }
  next.manualKeys = BREEDING_SETTING_KEYS.filter((k) => manual.has(k));
  next.manualUpdatedAt = now.toISOString();
  next.manualUpdatedBy = userId;
  return next as StoredBreedingSettings;
}

/** smaXtec 동기화 병합 — 직접 입력한 키는 절대 덮어쓰지 않는다 */
export function mergeSmaxtecSettings(
  stored: StoredBreedingSettings,
  fromSmaxtec: BreedingSettingsPatch,
  raw: Readonly<Record<string, unknown>>,
  now: Date,
): StoredBreedingSettings {
  const next: Record<string, unknown> = { ...stored };
  const manual = new Set(stored.manualKeys ?? []);
  for (const key of BREEDING_SETTING_KEYS) {
    if (manual.has(key)) continue;
    const value = fromSmaxtec[key];
    if (typeof value === 'number' && Number.isFinite(value)) {
      const def = BREEDING_SETTING_MAP[key];
      if (value >= def.min && value <= def.max) next[key] = value;
    }
  }
  next.syncedAt = now.toISOString();
  next.smaxtecRaw = raw;
  return next as StoredBreedingSettings;
}
