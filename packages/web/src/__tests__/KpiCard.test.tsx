// KpiCard 테스트 — 클릭 → 드릴다운 트리거 확인

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { KpiCard } from '@web/components/data/KpiCard';

// useDrilldown 모킹
const mockOpenDrilldown = vi.fn();
vi.mock('@web/hooks/useDrilldown', () => ({
  useDrilldown: () => ({
    openDrilldown: mockOpenDrilldown,
  }),
}));

describe('KpiCard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('렌더: label과 value 표시', () => {
    render(<KpiCard label="건강이상" value={12} unit="두" />);
    expect(screen.getByText('건강이상')).toBeInTheDocument();
    expect(screen.getByText('12')).toBeInTheDocument();
    expect(screen.getByText('두')).toBeInTheDocument();
  });

  it('drilldownType이 있으면 클릭 가능 + "클릭하여 상세 보기" 표시', () => {
    render(<KpiCard label="건강이상" value={12} drilldownType="health_risk" />);
    expect(screen.getByText('클릭하여 상세 보기')).toBeInTheDocument();
  });

  it('drilldownType이 없으면 클릭 불가', () => {
    render(<KpiCard label="총 두수" value={4250} />);
    expect(screen.queryByText('클릭하여 상세 보기')).not.toBeInTheDocument();
    const button = screen.getByRole('button');
    expect(button).toBeDisabled();
  });

  it('클릭 시 openDrilldown 호출', async () => {
    const user = userEvent.setup();
    render(<KpiCard label="건강이상" value={12} drilldownType="health_risk" />);
    await user.click(screen.getByRole('button'));
    expect(mockOpenDrilldown).toHaveBeenCalledWith('health_risk', '건강이상');
  });

  it('trend 표시: up/down/stable 아이콘', () => {
    const { rerender } = render(<KpiCard label="A" value={1} trend="up" trendValue={5} />);
    expect(screen.getByText('↑')).toBeInTheDocument();
    expect(screen.getByText('5%')).toBeInTheDocument();

    rerender(<KpiCard label="A" value={1} trend="down" trendValue={3} />);
    expect(screen.getByText('↓')).toBeInTheDocument();

    rerender(<KpiCard label="A" value={1} trend="stable" />);
    expect(screen.getByText('→')).toBeInTheDocument();
  });

  it('severity에 따른 border 색상 클래스', () => {
    const { container } = render(
      <KpiCard label="위험" value={5} severity="critical" drilldownType="health_risk" />,
    );
    const button = container.querySelector('button');
    expect(button?.className).toContain('border-l-red-500');
  });
});
