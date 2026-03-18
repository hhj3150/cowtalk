// VaccineScheduler 테스트 — 백신 접종 스케줄

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

vi.mock('@web/api/vaccine.api', () => ({
  getFarmVaccineSchedule: vi.fn().mockResolvedValue([
    { scheduleId: 's-1', animalId: 'a-1', vaccineName: '구제역', status: 'overdue', scheduledDate: '2026-03-10', completedDate: null },
    { scheduleId: 's-2', animalId: 'a-2', vaccineName: '브루셀라', status: 'pending', scheduledDate: '2026-03-20', completedDate: null },
    { scheduleId: 's-3', animalId: 'a-3', vaccineName: 'BVD', status: 'completed', scheduledDate: '2026-03-01', completedDate: '2026-03-02' },
  ]),
  recordVaccination: vi.fn().mockResolvedValue({}),
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

import { VaccineScheduler } from '@web/components/vaccine/VaccineScheduler';

function renderWithProviders(ui: React.ReactElement) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

beforeEach(() => { vi.clearAllMocks(); });

describe('VaccineScheduler', () => {
  it('미접종 경고 표시', async () => {
    renderWithProviders(<VaccineScheduler farmId="f-1" />);
    await waitFor(() => {
      expect(screen.getByText('미접종 1건')).toBeInTheDocument();
    });
  });

  it('미접종 항목에 백신명 표시', async () => {
    renderWithProviders(<VaccineScheduler farmId="f-1" />);
    await waitFor(() => {
      expect(screen.getByText(/구제역/)).toBeInTheDocument();
    });
  });

  it('예정 목록 렌더링', async () => {
    renderWithProviders(<VaccineScheduler farmId="f-1" />);
    await waitFor(() => {
      expect(screen.getByText(/접종 예정/)).toBeInTheDocument();
      expect(screen.getByText('브루셀라')).toBeInTheDocument();
    });
  });

  it('완료 목록 렌더링', async () => {
    renderWithProviders(<VaccineScheduler farmId="f-1" />);
    await waitFor(() => {
      expect(screen.getByText(/BVD/)).toBeInTheDocument();
    });
  });

  it('"접종 완료" 버튼 표시', async () => {
    renderWithProviders(<VaccineScheduler farmId="f-1" />);
    await waitFor(() => {
      expect(screen.getByRole('button', { name: '접종 완료' })).toBeInTheDocument();
    });
  });

  it('데이터 없을 때 빈 상태 표시', async () => {
    const { getFarmVaccineSchedule } = await import('@web/api/vaccine.api');
    (getFarmVaccineSchedule as ReturnType<typeof vi.fn>).mockResolvedValueOnce([]);
    renderWithProviders(<VaccineScheduler farmId="f-1" />);
    await waitFor(() => {
      expect(screen.getByText('백신 접종 계획이 없습니다.')).toBeInTheDocument();
    });
  });
});
