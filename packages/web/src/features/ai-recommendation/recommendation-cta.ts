// AI 추천 항목 → CTA 도출 (FLOW-07 A안: 웹 전용 패턴 매칭)
//
// 백엔드 추천 스키마는 평문 string[]. 백엔드 무변경(D17) 전제로,
// 프론트에서 추천 문구를 패턴 매칭해 클릭 가능한 CTA 를 도출한다.
//
// 라우트 보정: 작업 박스의 일부 target 이 실제 라우터와 불일치하여
//   /sensor-comparison       → /sensor/compare
//   /epidemiology            → /epidemiology/dashboard
//   /epidemiology/spread-simulation → /epidemiology/simulation
// 으로 보정. /alerts 라우트는 부재하여 severity-filter / 미확인 알림 CTA 는
// 대시보드 내 drilldown / 헤더 알림 드로어를 재사용한다 (대표님 결정).

import type { Role } from '@cowtalk/shared';

export interface RecommendationContext {
  readonly role: Role;
  readonly farms: readonly { readonly farmId: string; readonly name: string }[];
  readonly currentFarmId?: string;
}

/**
 * 추천 항목 CTA.
 * - route: 라우터 이동 (URL 변경)
 * - farm-select: farm.store.selectFarm 만 호출 (URL 변경 없음 — D21)
 * - severity-filter: 대시보드 severity drilldown 재사용 (라우트 아님)
 * - open-notifications: 헤더 알림 드로어 열기
 * CTA 없음은 null 반환 (특이사항 없음 / 농장명 미발견 등).
 */
export type RecommendationCta =
  | { readonly kind: 'route'; readonly label: string; readonly target: string }
  | { readonly kind: 'farm-select'; readonly label: string; readonly farmId: string }
  | { readonly kind: 'severity-filter'; readonly label: string; readonly severity: 'critical' | 'high' }
  | { readonly kind: 'open-notifications'; readonly label: string };

/**
 * 추천 문구 → CTA. 규칙을 순서대로 검사, 첫 매치 사용. 매치 없으면 null.
 */
export function deriveRecommendationCta(
  text: string,
  context: RecommendationContext,
): RecommendationCta | null {
  // 특이사항 없음 → CTA 없음 (평문 유지)
  if (/특이사항\s*없/.test(text)) return null;

  // 1. 긴급(Critical) → severity drilldown
  if (/긴급|critical/i.test(text)) {
    return { kind: 'severity-filter', label: '심각 알림 보기', severity: 'critical' };
  }

  // 2. 높은 심각도(High) → severity drilldown
  if (/높은\s*심각도|high/i.test(text)) {
    return { kind: 'severity-filter', label: '높음 알림 보기', severity: 'high' };
  }

  // 3. "{농장명}에서 (알림) N건" → 농장명이 context.farms 에 있으면 farm-select
  const farmMatch = /(.+?)에서\s*(?:알림\s*)?\d+건/.exec(text);
  if (farmMatch) {
    const farmName = (farmMatch[1] ?? '').trim();
    const farm = context.farms.find((f) => f.name === farmName);
    if (farm) {
      return { kind: 'farm-select', label: `${farm.name} 상세 보기`, farmId: farm.farmId };
    }
    return null; // 농장명 미발견 → CTA 없음
  }

  // 4. 센서 미장착 → 센서 비교 (/sensor-comparison → /sensor/compare 보정)
  if (/센서\s*미장착/.test(text)) {
    return { kind: 'route', label: '센서 비교 보기', target: '/sensor/compare' };
  }

  // 5. 미확인 알림 → 헤더 알림 드로어 (/alerts 라우트 부재)
  if (/미확인\s*알림/.test(text)) {
    return { kind: 'open-notifications', label: '미확인 알림 처리' };
  }

  // 6. 고체온 / 집단 발병 → 방역 대시보드
  if (/고체온|집단\s*발병/.test(text)) {
    return { kind: 'route', label: '방역 대시보드', target: '/epidemiology/dashboard' };
  }

  // 7. 이동제한 → 방역 보기 (/epidemiology → /epidemiology/dashboard 보정)
  if (/이동제한/.test(text)) {
    return { kind: 'route', label: '방역 보기', target: '/epidemiology/dashboard' };
  }

  // 8. 역학 조사 → 확산 시뮬레이션 (/epidemiology/spread-simulation → /epidemiology/simulation 보정)
  if (/역학\s*조사/.test(text)) {
    return { kind: 'route', label: '확산 시뮬레이션', target: '/epidemiology/simulation' };
  }

  return null;
}
