// 우군 분류 단일 진실 공급원 — 착유우(milking)·건유우(dry)·육성우(heifer)
//
// 배경(데이터 일관성 사고): smaXtec 동기화는 lactation_status를 'lactating'/'dry'/'heifer'로
// 정규화하는데, 일부 화면·도구는 'milking'/'dry'만 카운트해 착유우가 0으로 잡히고
// 전부 육성우로 떨어지는 불일치가 있었다(해돋이목장: smaXtec 착유 66 ↔ CowTalk 착유 0).
// 또 smaXtec lactation_status가 비면 'unknown'이 되어 분류 불가.
//
// 이 함수가 단일 기준이다:
//  1) lactationStatus 값의 모든 변형(milking/lactating/Lactating_Cow, dry/dry_off/Dry_Cow,
//     heifer/young_cow)을 표준 3그룹으로 흡수.
//  2) lactationStatus가 비었으면(미동기화) parity·DIM으로 추론 — 분만 경험(parity>=1)이
//     있으면 건유 임계(DIM>250) 전까지 착유우, 미경산은 육성우.

export type HerdGroup = 'milking' | 'dry' | 'heifer';

const DRY_OFF_DIM_THRESHOLD = 250; // 이 DIM을 넘으면 건유로 본다(목장 설정 없을 때 기본)

export function classifyHerdGroup(a: {
  readonly lactationStatus?: string | null;
  readonly parity?: number | null;
  readonly daysInMilk?: number | null;
}): HerdGroup {
  const ls = (a.lactationStatus ?? '').trim().toLowerCase();
  if (ls === 'milking' || ls === 'lactating' || ls === 'lactating_cow') return 'milking';
  if (ls === 'dry' || ls === 'dry_off' || ls === 'dry_cow') return 'dry';
  if (ls === 'heifer' || ls === 'young_cow') return 'heifer';
  // 미상/누락 → 데이터 추론 (smaXtec 그룹 미동기화 보정)
  if ((a.parity ?? 0) >= 1) {
    return (a.daysInMilk != null && a.daysInMilk > DRY_OFF_DIM_THRESHOLD) ? 'dry' : 'milking';
  }
  return 'heifer';
}

/** 개체 배열 → 그룹별 카운트. */
export function countHerdGroups(
  animals: ReadonlyArray<{ lactationStatus?: string | null; parity?: number | null; daysInMilk?: number | null }>,
): { milking: number; dry: number; heifer: number } {
  let milking = 0, dry = 0, heifer = 0;
  for (const a of animals) {
    const g = classifyHerdGroup(a);
    if (g === 'milking') milking++;
    else if (g === 'dry') dry++;
    else heifer++;
  }
  return { milking, dry, heifer };
}

/**
 * SQL CASE 식 — raw SQL 집계에서 동일 분류를 쓰기 위한 표현.
 * 컬럼명은 animals 별칭에 맞춰 호출부에서 보간한다(기본 a.lactation_status, a.parity, a.days_in_milk).
 * 반환: 'milking' | 'dry' | 'heifer'.
 */
export function herdGroupSqlCase(alias = 'a'): string {
  return `CASE
    WHEN lower(coalesce(${alias}.lactation_status,'')) IN ('milking','lactating','lactating_cow') THEN 'milking'
    WHEN lower(coalesce(${alias}.lactation_status,'')) IN ('dry','dry_off','dry_cow') THEN 'dry'
    WHEN lower(coalesce(${alias}.lactation_status,'')) IN ('heifer','young_cow') THEN 'heifer'
    WHEN coalesce(${alias}.parity,0) >= 1 AND coalesce(${alias}.days_in_milk,0) > ${DRY_OFF_DIM_THRESHOLD} THEN 'dry'
    WHEN coalesce(${alias}.parity,0) >= 1 THEN 'milking'
    ELSE 'heifer'
  END`;
}
