// MetricValue 테스트 — D5 UI 렌더링 통일 (BUG-006)
// metrics-contract.md §15 / D5·D13

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MetricValue } from '@web/components/common/MetricValue';

describe('MetricValue (D5 UI Rendering)', () => {
  it('status="ok" → displayValue + unit 표시', () => {
    render(
      <MetricValue result={{ displayValue: '10,666', status: 'ok' }} unit="두" />,
    );
    expect(screen.getByText('10,666')).toBeInTheDocument();
    expect(screen.getByText('두')).toBeInTheDocument();
  });

  it('status="ok" + displayValue="0" → "0" 표시 (D13 실측 0, 빈 농장과 구별)', () => {
    render(
      <MetricValue result={{ displayValue: '0', status: 'ok' }} unit="두" />,
    );
    expect(screen.getByText('0')).toBeInTheDocument();
    expect(screen.getByText('두')).toBeInTheDocument();
    // "—" 미표시
    expect(screen.queryByText('—')).not.toBeInTheDocument();
  });

  it('status="data_insufficient" → "—" 표시 + unit 숨김 + aria-label="데이터 부족"', () => {
    render(
      <MetricValue result={{ displayValue: '—', status: 'data_insufficient' }} unit="두" />,
    );
    expect(screen.getByText('—')).toBeInTheDocument();
    // unit 미표시
    expect(screen.queryByText('두')).not.toBeInTheDocument();
    // aria-label
    const span = screen.getByRole('status');
    expect(span).toHaveAttribute('aria-label', '데이터 부족');
  });

  it('data_insufficient → neutral 색 (var(--ct-text-secondary)) 적용', () => {
    render(
      <MetricValue result={{ displayValue: '—', status: 'data_insufficient' }} />,
    );
    const span = screen.getByRole('status');
    expect(span).toHaveStyle({ color: 'var(--ct-text-secondary)' });
  });

  it('data_insufficient → tooltip "충분한 데이터가 없습니다"', () => {
    render(
      <MetricValue result={{ displayValue: '—', status: 'data_insufficient' }} />,
    );
    const span = screen.getByRole('status');
    expect(span).toHaveAttribute('title', '충분한 데이터가 없습니다');
  });

  it('unit 없이도 정상 렌더 (status=ok)', () => {
    render(
      <MetricValue result={{ displayValue: '878', status: 'ok' }} />,
    );
    expect(screen.getByText('878')).toBeInTheDocument();
  });

  it('큰 수 (10,666) 로케일 포맷 그대로 표시', () => {
    render(
      <MetricValue result={{ displayValue: '10,666', status: 'ok' }} unit="두" />,
    );
    expect(screen.getByText('10,666')).toBeInTheDocument();
  });

  it('% 단위 표시 (수태율 패턴)', () => {
    render(
      <MetricValue result={{ displayValue: '83.0%', status: 'ok' }} />,
    );
    expect(screen.getByText('83.0%')).toBeInTheDocument();
  });

  it('aria-label은 ok 상태에 값+단위 포함', () => {
    render(
      <MetricValue result={{ displayValue: '878', status: 'ok' }} unit="건" />,
    );
    const span = screen.getByRole('status');
    expect(span).toHaveAttribute('aria-label', '878건');
  });

  it('className prop 전달', () => {
    render(
      <MetricValue
        result={{ displayValue: '10', status: 'ok' }}
        className="text-lg font-bold"
      />,
    );
    const span = screen.getByRole('status');
    expect(span).toHaveClass('text-lg', 'font-bold');
  });

  it('D5 위반 금지: "정상 운영" 같은 라벨이 status="ok" 자리에 표시되지 않음', () => {
    // 컴포넌트가 항상 displayValue를 직접 표시 — caller가 "정상 운영" 등으로 대체 불가
    render(
      <MetricValue result={{ displayValue: '0', status: 'ok' }} unit="개소" />,
    );
    expect(screen.getByText('0')).toBeInTheDocument();
    expect(screen.queryByText('정상 운영')).not.toBeInTheDocument();
    expect(screen.queryByText('이상 없음')).not.toBeInTheDocument();
    expect(screen.queryByText('양호')).not.toBeInTheDocument();
  });
});
