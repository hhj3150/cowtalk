// CalvingWorkflow 테스트 — 분만 워크플로우

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

vi.mock('@web/api/calving.api', () => ({
  getUpcomingCalvings: vi.fn().mockResolvedValue([
    { animalId: 'a-1', earTag: '1234', parity: 2, expectedDate: '2026-03-20', daysUntil: 3, riskLevel: 'high' },
    { animalId: 'a-2', earTag: '5678', parity: 1, expectedDate: '2026-03-25', daysUntil: 8, riskLevel: 'low' },
  ]),
  recordCalving: vi.fn().mockResolvedValue({ calvingId: 'c-1' }),
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

import { CalvingWorkflow } from '@web/components/calving/CalvingWorkflow';

function renderWithProviders(ui: React.ReactElement) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

beforeEach(() => { vi.clearAllMocks(); });

describe('CalvingWorkflow', () => {
  it('"분만 관리" 제목 표시', async () => {
    renderWithProviders(<CalvingWorkflow farmId="f-1" />);
    await waitFor(() => {
      expect(screen.getByText('분만 관리')).toBeInTheDocument();
    });
  });

  it('분만 예정 개체 렌더링', async () => {
    renderWithProviders(<CalvingWorkflow farmId="f-1" />);
    await waitFor(() => {
      expect(screen.getByText('#1234')).toBeInTheDocument();
      expect(screen.getByText('#5678')).toBeInTheDocument();
    });
  });

  it('위험도 뱃지 표시', async () => {
    renderWithProviders(<CalvingWorkflow farmId="f-1" />);
    await waitFor(() => {
      const badges = screen.getAllByTestId('badge');
      expect(badges.length).toBeGreaterThanOrEqual(2);
    });
  });

  it('D-day 표시', async () => {
    renderWithProviders(<CalvingWorkflow farmId="f-1" />);
    await waitFor(() => {
      expect(screen.getByText(/D-3/)).toBeInTheDocument();
      expect(screen.getByText(/D-8/)).toBeInTheDocument();
    });
  });

  it('"분만 기록" 버튼 존재', async () => {
    renderWithProviders(<CalvingWorkflow farmId="f-1" />);
    await waitFor(() => {
      const buttons = screen.getAllByText('분만 기록');
      expect(buttons.length).toBeGreaterThanOrEqual(1);
    });
  });

  it('개체별 분만 기록 버튼 클릭 시 폼 표시', async () => {
    const user = userEvent.setup();
    renderWithProviders(<CalvingWorkflow farmId="f-1" />);
    await waitFor(() => {
      expect(screen.getByText('#1234')).toBeInTheDocument();
    });
    const recordButtons = screen.getAllByText('분만 기록');
    await user.click(recordButtons[recordButtons.length - 1]!);
    await waitFor(() => {
      expect(screen.getByText(/분만 유형/)).toBeInTheDocument();
    });
  });

  it('예정 개체 없을 때 빈 상태 표시', async () => {
    const { getUpcomingCalvings } = await import('@web/api/calving.api');
    (getUpcomingCalvings as ReturnType<typeof vi.fn>).mockResolvedValueOnce([]);
    renderWithProviders(<CalvingWorkflow farmId="f-1" />);
    await waitFor(() => {
      expect(screen.getByText('분만 예정 개체가 없습니다.')).toBeInTheDocument();
    });
  });
});
