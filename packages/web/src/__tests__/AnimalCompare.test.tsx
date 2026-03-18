// AnimalCompare 테스트 — 개체 추가/제거 + 비교 UI

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

vi.mock('@web/api/animal.api', () => ({
  getAnimalDetail: vi.fn().mockResolvedValue({
    animal: {
      animalId: 'a-1', earTag: '1234', breed: '홀스타인', breedType: 'dairy',
      parity: 2, sex: 'female', latestTemperature: 38.6, latestActivity: 120, latestRumination: 450,
    },
  }),
}));

vi.mock('@web/api/sensor.api', () => ({
  getSensorData: vi.fn().mockResolvedValue([]),
}));

vi.mock('@web/components/data/SensorChart', () => ({
  SensorChart: () => <div data-testid="sensor-chart">Chart</div>,
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

import { AnimalCompare } from '@web/components/compare/AnimalCompare';

function renderWithProviders(ui: React.ReactElement) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

beforeEach(() => { vi.clearAllMocks(); });

describe('AnimalCompare', () => {
  it('초기 상태에서 빈 상태 메시지 표시', () => {
    renderWithProviders(<AnimalCompare />);
    expect(screen.getByText('비교할 개체를 2~3마리 추가하세요.')).toBeInTheDocument();
  });

  it('"개체 비교" 제목 렌더링', () => {
    renderWithProviders(<AnimalCompare />);
    expect(screen.getByText('개체 비교')).toBeInTheDocument();
  });

  it('개체 추가 input과 버튼 존재', () => {
    renderWithProviders(<AnimalCompare />);
    expect(screen.getByPlaceholderText('동물 ID 또는 이표번호 입력...')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /추가/ })).toBeInTheDocument();
  });

  it('initialAnimalIds로 초기 태그 표시', () => {
    renderWithProviders(<AnimalCompare initialAnimalIds={['a-1']} />);
    expect(screen.getByText('a-1')).toBeInTheDocument();
  });

  it('2개 이상 추가 시 "AI 차이점 분석" 버튼 표시', () => {
    renderWithProviders(<AnimalCompare initialAnimalIds={['a-1', 'a-2']} />);
    expect(screen.getByText('AI 차이점 분석')).toBeInTheDocument();
  });

  it('3개일 때 input이 disabled', () => {
    renderWithProviders(<AnimalCompare initialAnimalIds={['a-1', 'a-2', 'a-3']} />);
    expect(screen.getByPlaceholderText('동물 ID 또는 이표번호 입력...')).toBeDisabled();
  });

  it('2개 이상일 때 센서 비교 차트 렌더링', () => {
    renderWithProviders(<AnimalCompare initialAnimalIds={['a-1', 'a-2']} />);
    expect(screen.getByText('체온 비교')).toBeInTheDocument();
    expect(screen.getByText('활동 비교')).toBeInTheDocument();
    expect(screen.getByText('반추 비교')).toBeInTheDocument();
  });
});
