// PrescriptionForm 테스트 — 처방전 작성 폼

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

const mockOnClose = vi.fn();

vi.mock('@web/api/prescription.api', () => ({
  getDrugList: vi.fn().mockResolvedValue([
    { drugId: 'd-1', name: '세파졸린', category: '항생제', unit: 'ml', route: 'IM', withdrawalMilkHours: 72, withdrawalMeatDays: 14 },
    { drugId: 'd-2', name: '멜록시캄', category: '소염제', unit: 'ml', route: 'IV', withdrawalMilkHours: 120, withdrawalMeatDays: 21 },
  ]),
  createPrescription: vi.fn().mockResolvedValue({ prescriptionId: 'p-1' }),
}));

vi.mock('@web/components/common/LoadingSkeleton', () => ({
  LoadingSkeleton: () => <div data-testid="loading">로딩중</div>,
}));

import { PrescriptionForm } from '@web/components/prescription/PrescriptionForm';

function renderWithProviders(ui: React.ReactElement) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

beforeEach(() => { vi.clearAllMocks(); });

describe('PrescriptionForm', () => {
  it('"처방전 작성" 제목 표시', async () => {
    renderWithProviders(<PrescriptionForm animalId="a-1" farmId="f-1" onClose={mockOnClose} />);
    await waitFor(() => {
      expect(screen.getByText('처방전 작성')).toBeInTheDocument();
    });
  });

  it('약품 목록 로딩 후 드롭다운 표시', async () => {
    renderWithProviders(<PrescriptionForm animalId="a-1" farmId="f-1" onClose={mockOnClose} />);
    await waitFor(() => {
      expect(screen.getByText('약품을 선택하세요')).toBeInTheDocument();
    });
  });

  it('진단명 입력 필드 존재', async () => {
    renderWithProviders(<PrescriptionForm animalId="a-1" farmId="f-1" onClose={mockOnClose} />);
    await waitFor(() => {
      expect(screen.getByPlaceholderText('유방염, 케토시스, 자궁내막염...')).toBeInTheDocument();
    });
  });

  it('진단명 + 약품 없을 시 저장 버튼 비활성', async () => {
    renderWithProviders(<PrescriptionForm animalId="a-1" farmId="f-1" onClose={mockOnClose} />);
    await waitFor(() => {
      expect(screen.getByText('처방전 저장')).toBeDisabled();
    });
  });

  it('취소 버튼 클릭 시 onClose 호출', async () => {
    const user = userEvent.setup();
    renderWithProviders(<PrescriptionForm animalId="a-1" farmId="f-1" onClose={mockOnClose} />);
    await waitFor(() => {
      expect(screen.getByText('취소')).toBeInTheDocument();
    });
    await user.click(screen.getByText('취소'));
    expect(mockOnClose).toHaveBeenCalled();
  });

  it('약품 추가 후 휴약 정보 표시', async () => {
    const user = userEvent.setup();
    renderWithProviders(<PrescriptionForm animalId="a-1" farmId="f-1" onClose={mockOnClose} />);
    await waitFor(() => {
      expect(screen.getByText('약품을 선택하세요')).toBeInTheDocument();
    });
    const select = screen.getByRole('combobox');
    await user.selectOptions(select, 'd-1');
    await user.click(screen.getByText('추가'));
    expect(screen.getByText(/휴약: 우유 72시간/)).toBeInTheDocument();
  });
});
