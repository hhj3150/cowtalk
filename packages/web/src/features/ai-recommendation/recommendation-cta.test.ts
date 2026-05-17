// AI 추천 CTA 패턴 매칭 검증 (FLOW-07)

import { describe, it, expect } from 'vitest';
import { deriveRecommendationCta, type RecommendationContext } from './recommendation-cta';

const FARMS = [
  { farmId: 'f1', name: '송죽목장' },
  { farmId: 'f2', name: '해돋이목장' },
];

const ctx = (overrides?: Partial<RecommendationContext>): RecommendationContext => ({
  role: 'government_admin',
  farms: FARMS,
  ...overrides,
});

describe('deriveRecommendationCta — 9개 매칭 규칙', () => {
  it('1. 긴급(Critical) → severity-filter critical', () => {
    expect(deriveRecommendationCta('긴급(Critical) 알림 3건이 즉시 대응 필요합니다', ctx()))
      .toEqual({ kind: 'severity-filter', label: '심각 알림 보기', severity: 'critical' });
  });

  it('2. 높은 심각도(High) → severity-filter high', () => {
    expect(deriveRecommendationCta('높은 심각도(High) 알림 5건 점검 권장', ctx()))
      .toEqual({ kind: 'severity-filter', label: '높음 알림 보기', severity: 'high' });
  });

  it('3a. "{농장명}에서 알림 N건" — 농장명이 context.farms 에 있음 → farm-select', () => {
    expect(deriveRecommendationCta('송죽목장에서 알림 7건 집중 발생 — 현장 점검 필요', ctx()))
      .toEqual({ kind: 'farm-select', label: '송죽목장 상세 보기', farmId: 'f1' });
  });

  it('3b. 농장명이 context.farms 에 없음 → null', () => {
    expect(deriveRecommendationCta('없는목장에서 알림 4건 집중 발생', ctx()))
      .toBeNull();
  });

  it('4. 센서 미장착 → route /sensor/compare', () => {
    expect(deriveRecommendationCta('센서 미장착 농장 — 부착 검토', ctx()))
      .toEqual({ kind: 'route', label: '센서 비교 보기', target: '/sensor/compare' });
  });

  it('5. 미확인 알림 → open-notifications', () => {
    expect(deriveRecommendationCta('미확인 알림 12건 처리 필요', ctx()))
      .toEqual({ kind: 'open-notifications', label: '미확인 알림 처리' });
  });

  it('6. 고체온/집단 발병 → route /epidemiology/dashboard', () => {
    expect(deriveRecommendationCta('고체온 8두 집단 발병 여부 확인', ctx()))
      .toEqual({ kind: 'route', label: '방역 대시보드', target: '/epidemiology/dashboard' });
  });

  it('7. 이동제한 → route /epidemiology/dashboard', () => {
    expect(deriveRecommendationCta('농장 이동제한 검토', ctx()))
      .toEqual({ kind: 'route', label: '방역 보기', target: '/epidemiology/dashboard' });
  });

  it('8. 역학 조사 → route /epidemiology/simulation', () => {
    expect(deriveRecommendationCta('역학 조사 권장', ctx()))
      .toEqual({ kind: 'route', label: '확산 시뮬레이션', target: '/epidemiology/simulation' });
  });

  it('9. 특이사항 없음 → null (CTA 없음)', () => {
    expect(deriveRecommendationCta('현재 특이사항 없습니다', ctx())).toBeNull();
    expect(deriveRecommendationCta('특이사항 없음', ctx())).toBeNull();
  });
});

describe('우선순위 / 엣지', () => {
  it('매치 없는 평문 → null', () => {
    expect(deriveRecommendationCta('오늘 날씨가 좋습니다', ctx())).toBeNull();
  });

  it('긴급 규칙이 농장명 규칙보다 우선 — "긴급" 포함 시 severity-filter', () => {
    expect(deriveRecommendationCta('긴급(Critical): 송죽목장에서 알림 3건', ctx()))
      .toEqual({ kind: 'severity-filter', label: '심각 알림 보기', severity: 'critical' });
  });

  it('농장명 매치 시 currentFarmId 와 무관하게 해당 농장 farmId 반환', () => {
    expect(deriveRecommendationCta('해돋이목장에서 6건 집중 발생', ctx({ currentFarmId: 'f1' })))
      .toEqual({ kind: 'farm-select', label: '해돋이목장 상세 보기', farmId: 'f2' });
  });
});
