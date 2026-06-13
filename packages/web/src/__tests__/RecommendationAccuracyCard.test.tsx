// RecommendationAccuracyCard 테스트 — 추천 정확도 위젯 (채택률 + 수태율 lift)

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { RecommendationAccuracyCard } from '@web/components/intelligence/RecommendationAccuracyCard';
import type { RecommendationAccuracy } from '@web/api/ai-performance.api';

const insufficient: RecommendationAccuracy = {
  totalBatches: 3,
  actionedBatches: 0,
  adherenceRate: null,
  adherenceStatus: 'data_insufficient',
  recommendedConceptionRate: null,
  recommendedDecided: 0,
  nonRecommendedConceptionRate: null,
  nonRecommendedDecided: 0,
  lift: null,
};

const populated: RecommendationAccuracy = {
  totalBatches: 40,
  actionedBatches: 30,
  adherenceRate: 73.3,
  adherenceStatus: 'ok',
  recommendedConceptionRate: 62.5,
  recommendedDecided: 16,
  nonRecommendedConceptionRate: 50.0,
  nonRecommendedDecided: 8,
  lift: 12.5,
};

describe('RecommendationAccuracyCard', () => {
  it('로딩 중이면 스켈레톤만 표시', () => {
    render(<RecommendationAccuracyCard isLoading />);
    expect(screen.queryByText(/채택률/)).not.toBeInTheDocument();
  });

  it('data_insufficient 이면 누적 안내 + 추천 누적 건수 표시', () => {
    render(<RecommendationAccuracyCard data={insufficient} />);
    expect(screen.getByText('정액 추천 정확도')).toBeInTheDocument();
    expect(screen.getByText(/데이터 누적 중/)).toBeInTheDocument();
    // 추천 누적 3건이 배지에 노출 (메시지 문장과 구분되도록 배지 텍스트로 정확 매칭)
    expect(screen.getByText('추천 3건')).toBeInTheDocument();
    // 채택률 퍼센트는 노출되지 않음
    expect(screen.queryByText('73.3%')).not.toBeInTheDocument();
  });

  it('ok 데이터면 채택률·수태율·lift 표시', () => {
    render(<RecommendationAccuracyCard data={populated} />);
    expect(screen.getByText('73.3%')).toBeInTheDocument(); // 채택률
    expect(screen.getByText('62.5%')).toBeInTheDocument(); // 추천-사용 수태율
    expect(screen.getByText('50.0%')).toBeInTheDocument(); // 비추천-사용 수태율
    // lift 는 부호 + %p 단위
    expect(screen.getByText('+12.5%p')).toBeInTheDocument();
  });

  it('lift 가 음수면 음수 부호로 표시', () => {
    render(<RecommendationAccuracyCard data={{ ...populated, lift: -4.2 }} />);
    expect(screen.getByText('-4.2%p')).toBeInTheDocument();
  });

  it('lift 가 null 이면 — 로 표시', () => {
    render(<RecommendationAccuracyCard data={{ ...populated, lift: null }} />);
    expect(screen.getByText('—')).toBeInTheDocument();
  });
});
