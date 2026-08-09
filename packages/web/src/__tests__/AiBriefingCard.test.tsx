// AI 일일 브리핑 위젯 — 실패했을 때 '실패했다고 말하는가'.
//
// 회귀 대상 버그: 렌더 조건이 `isLoading || !briefing` 이라, 요청이 실패해도
// 스켈레톤이 계속 돌았다. 사용자에겐 "작동하는 것처럼 진행만 되고 결과가 안 나오는" 상태였고,
// react-query 에러는 렌더 중 throw 하지 않으므로 상위 SectionErrorBoundary도 잡지 못했다.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

// 위젯이 쓰는 훅만 제어한다. 페이지의 다른 훅은 이 테스트에서 호출되지 않는다.
const briefingState: {
  data: unknown;
  isLoading: boolean;
  isError: boolean;
  error: unknown;
  isFetching: boolean;
} = { data: undefined, isLoading: true, isError: false, error: null, isFetching: false };

const refetch = vi.fn();

vi.mock('@web/hooks/useUnifiedDashboard', () => ({
  useAiBriefing: () => ({ ...briefingState, refetch }),
}));

// 차트·지도 등 무거운 하위 모듈을 끌어오지 않도록 위젯이 참조하는 모듈만 가볍게 대체
vi.mock('@web/components/unified-dashboard', () => ({}));

import { AiBriefingCard } from '@web/pages/dashboard/UnifiedDashboard';

function renderCard() {
  return render(
    <MemoryRouter>
      <AiBriefingCard />
    </MemoryRouter>,
  );
}

const SAMPLE_BRIEFING = {
  generatedAt: '2026-08-09T06:00:00Z',
  summary: '오늘 5개 농장에서 12건의 알림이 발생했습니다.',
  summarySource: 'template' as const,
  farmCount: 5,
  animalCount: 250,
  alertStats: { total24h: 12, critical: 1, high: 2, medium: 4, low: 5 },
  topAlertFarms: [],
  eventTypeDistribution: [],
  recentCritical: [],
  trendComparison: { today: 12, yesterday: 10, changePercent: 20, direction: 'up' as const },
  recommendations: ['오늘 수정 대상 3두를 확인하세요.'],
  roleKpis: [],
};

beforeEach(() => {
  refetch.mockClear();
  briefingState.data = undefined;
  briefingState.isLoading = true;
  briefingState.isError = false;
  briefingState.error = null;
  briefingState.isFetching = false;
});

describe('AI 일일 브리핑 위젯', () => {
  it('로딩 중에는 스켈레톤을 보여준다', () => {
    const { container } = renderCard();
    expect(container.querySelectorAll('.ct-shimmer').length).toBeGreaterThan(0);
  });

  it('요청이 실패하면 스켈레톤이 아니라 실패를 알린다 (무한 로딩 회귀 방지)', () => {
    briefingState.isLoading = false;
    briefingState.isError = true;
    briefingState.error = { code: 'ECONNABORTED', message: 'timeout of 15000ms exceeded' };

    const { container } = renderCard();

    // 스켈레톤이 남아 있으면 사용자는 영원히 기다리게 된다
    expect(container.querySelectorAll('.ct-shimmer').length).toBe(0);
    expect(screen.getByText(/브리핑을 불러오지 못했습니다/)).toBeTruthy();
    expect(screen.getByRole('button', { name: '다시 시도' })).toBeTruthy();
  });

  it('실패 원인을 사람이 읽을 수 있게 표시한다', () => {
    briefingState.isLoading = false;
    briefingState.isError = true;
    briefingState.error = { code: 'ECONNABORTED', message: 'timeout of 15000ms exceeded' };

    renderCard();
    expect(screen.getByText(/서버 응답이 늦습니다/)).toBeTruthy();
  });

  it('다시 시도 버튼이 재요청을 건다', () => {
    briefingState.isLoading = false;
    briefingState.isError = true;
    briefingState.error = new Error('boom');

    renderCard();
    screen.getByRole('button', { name: '다시 시도' }).click();
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it('로딩이 끝났는데 데이터가 비어도 스켈레톤에 갇히지 않는다', () => {
    briefingState.isLoading = false;
    briefingState.isError = false;
    briefingState.data = undefined;

    const { container } = renderCard();
    expect(container.querySelectorAll('.ct-shimmer').length).toBe(0);
    expect(screen.getByText(/브리핑을 불러오지 못했습니다/)).toBeTruthy();
    expect(screen.getByText(/브리핑 데이터를 반환하지 않았습니다/)).toBeTruthy();
  });

  it('데이터가 오면 요약을 렌더한다', () => {
    briefingState.isLoading = false;
    briefingState.data = SAMPLE_BRIEFING;

    renderCard();
    expect(screen.getByText(SAMPLE_BRIEFING.summary)).toBeTruthy();
  });

  it('템플릿 요약에는 CLAUDE 배지를 붙이지 않는다 (출처 정직성)', () => {
    briefingState.isLoading = false;
    briefingState.data = SAMPLE_BRIEFING; // summarySource: 'template'

    renderCard();
    expect(screen.queryByText('Claude')).toBeNull();
    expect(screen.getByText('기본 요약')).toBeTruthy();
  });

  it('Claude 생성 요약에는 CLAUDE 배지를 붙인다', () => {
    briefingState.isLoading = false;
    briefingState.data = { ...SAMPLE_BRIEFING, summarySource: 'ai' as const };

    renderCard();
    expect(screen.getByText('Claude')).toBeTruthy();
  });
});
