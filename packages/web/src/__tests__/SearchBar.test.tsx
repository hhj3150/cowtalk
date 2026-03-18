// SearchBar 테스트 — 검색 + 자동완성 + 최근 검색

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// Mock hooks
const mockNavigateToDetail = vi.fn();
const mockOpenDrilldown = vi.fn();

vi.mock('@web/hooks/useDrilldown', () => ({
  useDrilldown: () => ({
    navigateToDetail: mockNavigateToDetail,
    openDrilldown: mockOpenDrilldown,
  }),
}));

vi.mock('@web/api/search.api', () => ({
  searchAutocomplete: vi.fn().mockResolvedValue([
    { type: 'animal', id: 'a-1', label: '002-1234-5678', subLabel: '목장A', traceId: '123456789', earTag: '#1234', farmName: '목장A' },
    { type: 'farm', id: 'f-1', label: '목장A', subLabel: '경기도 화성시', traceId: null, earTag: null, farmName: '목장A' },
  ]),
}));

import { SearchBar } from '@web/components/search/SearchBar';

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
});

describe('SearchBar', () => {
  it('검색 입력 필드 렌더링', () => {
    render(<SearchBar />);
    expect(screen.getByPlaceholderText('이력번호 / 귀표번호 / 농장명 검색...')).toBeInTheDocument();
  });

  it('2글자 미만 입력 시 자동완성 호출 안함', async () => {
    const user = userEvent.setup();
    render(<SearchBar />);
    const input = screen.getByPlaceholderText('이력번호 / 귀표번호 / 농장명 검색...');
    await user.type(input, 'a');
    // 2글자 미만이므로 드롭다운 표시 안 됨
    expect(screen.queryByText('개체')).not.toBeInTheDocument();
  });

  it('2글자 이상 입력 시 자동완성 결과 표시', async () => {
    const user = userEvent.setup();
    render(<SearchBar />);
    const input = screen.getByPlaceholderText('이력번호 / 귀표번호 / 농장명 검색...');
    await user.type(input, '002-');
    await waitFor(() => {
      expect(screen.getByText('002-1234-5678')).toBeInTheDocument();
    });
  });

  it('검색 결과 없을 때 메시지 표시', async () => {
    const { searchAutocomplete } = await import('@web/api/search.api');
    (searchAutocomplete as ReturnType<typeof vi.fn>).mockResolvedValueOnce([]);
    const user = userEvent.setup();
    render(<SearchBar />);
    const input = screen.getByPlaceholderText('이력번호 / 귀표번호 / 농장명 검색...');
    await user.type(input, '없는검색어');
    await waitFor(() => {
      expect(screen.getByText('검색 결과가 없습니다.')).toBeInTheDocument();
    });
  });

  it('animal 결과 클릭 시 navigateToDetail 호출', async () => {
    const user = userEvent.setup();
    render(<SearchBar />);
    const input = screen.getByPlaceholderText('이력번호 / 귀표번호 / 농장명 검색...');
    await user.type(input, '002-');
    await waitFor(() => {
      expect(screen.getByText('002-1234-5678')).toBeInTheDocument();
    });
    await user.click(screen.getByText('002-1234-5678'));
    expect(mockNavigateToDetail).toHaveBeenCalledWith('a-1', '#1234');
  });

  it('farm 결과 클릭 시 openDrilldown 호출', async () => {
    const user = userEvent.setup();
    render(<SearchBar />);
    const input = screen.getByPlaceholderText('이력번호 / 귀표번호 / 농장명 검색...');
    await user.type(input, '목장');
    await waitFor(() => {
      expect(screen.getByText('농장')).toBeInTheDocument();
    });
    // "농장" 뱃지를 포함하는 버튼 클릭
    const farmBadge = screen.getByText('농장');
    const farmButton = farmBadge.closest('button');
    if (farmButton) await user.click(farmButton);
    expect(mockOpenDrilldown).toHaveBeenCalled();
  });
});
