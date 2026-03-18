// AlertEscalation 테스트 — 에스컬레이션 대시보드

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

const mockAcknowledge = vi.fn().mockResolvedValue(undefined);

vi.mock('@web/api/escalation.api', () => ({
  getUnacknowledgedAlerts: vi.fn().mockResolvedValue([
    { escalationId: 'e-1', alertId: 'al-1', alertTitle: '체온 상승', severity: 'critical', currentLevel: 2, escalatedAt: '2026-03-17T09:00:00Z', acknowledgedBy: null, acknowledgedAt: null, avgResponseMinutes: null },
    { escalationId: 'e-2', alertId: 'al-2', alertTitle: '반추 감소', severity: 'high', currentLevel: 1, escalatedAt: '2026-03-17T10:00:00Z', acknowledgedBy: null, acknowledgedAt: null, avgResponseMinutes: null },
  ]),
  getEscalationStats: vi.fn().mockResolvedValue({
    totalEscalated: 15,
    avgResponseMinutes: 12,
    unacknowledged: 2,
  }),
  acknowledgeAlert: (...args: unknown[]) => mockAcknowledge(...args),
}));

vi.mock('@web/components/common/Badge', () => ({
  Badge: ({ label }: { label: string }) => <span data-testid="badge">{label}</span>,
}));

vi.mock('@web/components/common/LoadingSkeleton', () => ({
  LoadingSkeleton: () => <div data-testid="loading">로딩중</div>,
}));

vi.mock('@web/components/common/EmptyState', () => ({
  EmptyState: ({ message }: { message: string }) => <div data-testid="empty-state">{message}</div>,
}));

import { EscalationDashboard } from '@web/components/escalation/EscalationDashboard';

function renderWithProviders(ui: React.ReactElement) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, refetchInterval: false as const } } });
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

beforeEach(() => { vi.clearAllMocks(); });

describe('EscalationDashboard', () => {
  it('통계 카드 렌더링 — 미확인', async () => {
    renderWithProviders(<EscalationDashboard />);
    await waitFor(() => {
      expect(screen.getByText('미확인')).toBeInTheDocument();
      expect(screen.getByText('2')).toBeInTheDocument();
    });
  });

  it('통계 카드 — 총 에스컬레이션', async () => {
    renderWithProviders(<EscalationDashboard />);
    await waitFor(() => {
      expect(screen.getByText('총 에스컬레이션')).toBeInTheDocument();
      expect(screen.getByText('15')).toBeInTheDocument();
    });
  });

  it('통계 카드 — 평균 응답 시간', async () => {
    renderWithProviders(<EscalationDashboard />);
    await waitFor(() => {
      expect(screen.getByText('평균 응답 시간')).toBeInTheDocument();
      expect(screen.getByText('12분')).toBeInTheDocument();
    });
  });

  it('미확인 알림 목록 표시', async () => {
    renderWithProviders(<EscalationDashboard />);
    await waitFor(() => {
      expect(screen.getByText('체온 상승')).toBeInTheDocument();
      expect(screen.getByText('반추 감소')).toBeInTheDocument();
    });
  });

  it('에스컬레이션 레벨 표시', async () => {
    renderWithProviders(<EscalationDashboard />);
    await waitFor(() => {
      expect(screen.getByText(/Level 2/)).toBeInTheDocument();
      expect(screen.getByText(/수의사/)).toBeInTheDocument();
    });
  });

  it('확인 버튼 클릭 시 acknowledgeAlert 호출', async () => {
    const user = userEvent.setup();
    renderWithProviders(<EscalationDashboard />);
    await waitFor(() => {
      expect(screen.getAllByText('확인')).toHaveLength(2);
    });
    await user.click(screen.getAllByText('확인')[0]!);
    expect(mockAcknowledge).toHaveBeenCalledWith('al-1');
  });

  it('미확인 알림 없을 때 빈 상태 표시', async () => {
    const { getUnacknowledgedAlerts } = await import('@web/api/escalation.api');
    (getUnacknowledgedAlerts as ReturnType<typeof vi.fn>).mockResolvedValueOnce([]);
    renderWithProviders(<EscalationDashboard />);
    await waitFor(() => {
      expect(screen.getByText('미확인 알림이 없습니다.')).toBeInTheDocument();
    });
  });
});
