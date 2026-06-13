// 목장 번식 설정 → 프롬프트 컨텍스트
// CLAUDE.md 명시 요구: "목장마다 번식 파라미터가 다르므로 AI가 반드시 목장 설정을 참조해야 한다."
// 발정재귀일·수정적기·임신감정시기 등 목장 고유값을 프롬프트에 주입해
// AI가 일반론이 아니라 이 농장 기준으로 발정 예측·수정적기·임신감정 타이밍을 판단하게 한다.

import type { FarmBreedingSettings } from '../../db/schema.js';

// smaXtec 기본값 + 한국 목장 일반 관행 (farm-settings-sync.getDefaultBreedingSettings와 동일 기준)
const DEFAULTS = {
  estrusRecurrenceDays: 21,
  inseminationWindowStartHours: 10,
  inseminationWindowEndHours: 18,
  pregnancyCheckDays: 28,
  gestationDays: 280,
  dryOffBeforeCalvingDays: 90,
  minBreedingAgeMonths: 12,
  estrusDetectionAfterDim: 20,
  longOpenDaysDim: 200,
} as const;

/** 값이 있으면 그대로, 없으면 기본값 + "(기본값)" 표기 */
function resolve(value: number | undefined, fallback: number): string {
  return value === undefined || value === null
    ? `${String(fallback)} (기본값)`
    : String(value);
}

/** 수정 적기 범위 (시작~종료h). 한쪽이라도 없으면 기본값 범위 + 표기 */
function resolveWindow(start: number | undefined, end: number | undefined): string {
  if (start === undefined || start === null || end === undefined || end === null) {
    return `${String(DEFAULTS.inseminationWindowStartHours)}~${String(DEFAULTS.inseminationWindowEndHours)}h (기본값)`;
  }
  return `${String(start)}~${String(end)}h`;
}

/** 성감별 정액 적기: null/미지정이면 "미사용", 둘 다 있으면 범위 */
function resolveSexedWindow(
  start: number | null | undefined,
  end: number | null | undefined,
): string {
  if (typeof start === 'number' && typeof end === 'number') {
    return `${String(start)}~${String(end)}h`;
  }
  return '미사용';
}

/**
 * 목장 번식 설정을 프롬프트 블록으로 렌더링 (순수 함수).
 * null/undefined/빈 객체여도 기본값 블록을 안전하게 반환한다.
 */
export function buildFarmBreedingContext(
  settings: FarmBreedingSettings | null | undefined,
): string {
  const s = settings ?? {};

  const lines = [
    `- 발정재귀일: ${resolve(s.estrusRecurrenceDays, DEFAULTS.estrusRecurrenceDays)}일`,
    `- 수정 적기(일반 정액): ${resolveWindow(s.inseminationWindowStartHours, s.inseminationWindowEndHours)}`,
    `- 수정 적기(성감별 정액): ${resolveSexedWindow(s.sexedSemenWindowStartHours, s.sexedSemenWindowEndHours)}`,
    `- 임신감정 시기: 수정 후 ${resolve(s.pregnancyCheckDays, DEFAULTS.pregnancyCheckDays)}일`,
    `- 평균 임신 기간: ${resolve(s.gestationDays, DEFAULTS.gestationDays)}일`,
    `- 건유 시작: 분만 ${resolve(s.dryOffBeforeCalvingDays, DEFAULTS.dryOffBeforeCalvingDays)}일 전`,
    `- 육성우 최소 번식 연령: ${resolve(s.minBreedingAgeMonths, DEFAULTS.minBreedingAgeMonths)}개월`,
    `- 발정 탐지 활성화 DIM: ${resolve(s.estrusDetectionAfterDim, DEFAULTS.estrusDetectionAfterDim)}일 경과 후`,
    `- 장기공태우 기준: DIM ${resolve(s.longOpenDaysDim, DEFAULTS.longOpenDaysDim)}일 이상`,
  ];

  return `## 목장 번식 설정 (이 농장 고유값 — 반드시 이 값 기준으로 판단)
${lines.join('\n')}
⚠️ 발정 예측·수정 적기·임신감정 타이밍·건유·장기공태우 판단은 위 목장 고유값을 기준으로 하세요. "(기본값)"은 목장 미설정으로 일반 기본값을 가정한 항목입니다.`;
}
