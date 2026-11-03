// 목장 번식 설정 → 프롬프트 컨텍스트
// CLAUDE.md 명시 요구: "목장마다 번식 파라미터가 다르므로 AI가 반드시 목장 설정을 참조해야 한다."
// 발정재귀일·수정적기·임신감정시기·건유·장기공태 등 목장 고유값을 프롬프트에 주입해
// AI가 일반론이 아니라 이 농장 기준으로 판단하게 한다.
// 정의·기본값은 @cowtalk/shared BREEDING_SETTING_DEFS 단일 원천 — 여기서 기본값을 다시 적지 않는다.

import { buildBreedingSettingViews } from '@cowtalk/shared';
import type { BreedingSettingKey, BreedingSettingView } from '@cowtalk/shared';
import type { FarmBreedingSettings } from '../../db/schema.js';

/** 범위로 묶어 한 줄에 표기하는 키 (시작·종료 쌍) */
const PAIRED: ReadonlySet<BreedingSettingKey> = new Set<BreedingSettingKey>([
  'inseminationWindowStartHours', 'inseminationWindowEndHours',
  'sexedSemenWindowStartHours', 'sexedSemenWindowEndHours',
  'pregnantHeatIntervalMinDays', 'pregnantHeatIntervalMaxDays',
]);

/** 화면 전용이라 AI 판단에 쓰지 않는 키 */
const UI_ONLY: ReadonlySet<BreedingSettingKey> = new Set<BreedingSettingKey>([
  'unacknowledgedHealthAlertHours', 'heatListHours', 'healthAlertListHours', 'healthGraphDays',
]);

const DEFAULT_MARK = ' (기본값)';

function renderValue(v: BreedingSettingView): string {
  const mark = v.source === 'default' ? DEFAULT_MARK : '';
  if (v.kind === 'boolean') return `${v.value === 1 ? '활성' : '비활성'}${mark}`;
  if (v.value === null) return '미사용';
  return `${String(v.value)}${v.unit}${mark}`;
}

function renderRange(lo: BreedingSettingView, hi: BreedingSettingView, unit: string): string {
  if (lo.value === null || hi.value === null) return '미사용';
  const mark = lo.source === 'default' && hi.source === 'default' ? DEFAULT_MARK : '';
  return `${String(lo.value)}~${String(hi.value)}${unit}${mark}`;
}

/**
 * 목장 번식 설정을 프롬프트 블록으로 렌더링 (순수 함수).
 * null/undefined/빈 객체여도 기본값 블록을 안전하게 반환한다.
 * 저장 원본(출처 메타 포함)을 받아야 "(기본값)" 표기가 정확하다.
 */
export function buildFarmBreedingContext(
  settings: FarmBreedingSettings | null | undefined,
): string {
  const views = buildBreedingSettingViews(settings ?? {});
  const byKey = new Map(views.map((v) => [v.key, v]));
  const get = (k: BreedingSettingKey): BreedingSettingView => byKey.get(k)!;

  const lines = [
    `- 수정 적기(일반 정액): ${renderRange(get('inseminationWindowStartHours'), get('inseminationWindowEndHours'), 'h')}`,
    `- 수정 적기(성감별 정액): ${renderRange(get('sexedSemenWindowStartHours'), get('sexedSemenWindowEndHours'), 'h')}`,
    `- 유산 의심 임신우 활동량 증가 간격: ${renderRange(get('pregnantHeatIntervalMinDays'), get('pregnantHeatIntervalMaxDays'), '일')}`,
    ...views
      .filter((v) => !PAIRED.has(v.key) && !UI_ONLY.has(v.key))
      .map((v) => `- ${v.labelKo}: ${renderValue(v)}`),
  ];

  return `## 목장 번식 설정 (이 농장 고유값 — 반드시 이 값 기준으로 판단)
${lines.join('\n')}
⚠️ 발정 예측·수정 적기·임신감정 타이밍·건유·분만 임박·장기공태우·유산 의심 판단은 위 목장 고유값을 기준으로 하세요. "(기본값)"은 목장 미설정으로 일반 기본값을 가정한 항목입니다.`;
}
