// 농장 성적표 — 분기별 자동 생성

import React from 'react';
import { useQuery } from '@tanstack/react-query';
import * as farmApi from '@web/api/farm.api';
import { LoadingSkeleton } from '@web/components/common/LoadingSkeleton';

interface Props {
  readonly farmId: string;
  readonly quarter?: string;
}

const GRADE_COLORS: Record<string, { bg: string; text: string; variant: 'success' | 'info' | 'medium' | 'high' | 'critical' }> = {
  A: { bg: 'bg-green-100', text: 'text-green-700', variant: 'success' },
  B: { bg: 'bg-blue-100', text: 'text-blue-700', variant: 'info' },
  C: { bg: 'bg-yellow-100', text: 'text-yellow-700', variant: 'medium' },
  D: { bg: 'bg-orange-100', text: 'text-orange-700', variant: 'high' },
  F: { bg: 'bg-red-100', text: 'text-red-700', variant: 'critical' },
};

const TREND_ICONS: Record<string, string> = {
  up: '↑',
  down: '↓',
  stable: '→',
};

export function FarmReportCard({ farmId, quarter }: Props): React.JSX.Element {
  const { data, isLoading } = useQuery({
    queryKey: ['farm', 'report-card', farmId, quarter],
    queryFn: () => farmApi.getFarmReportCard(farmId, quarter),
    staleTime: 10 * 60 * 1000,
  });

  if (isLoading) return <LoadingSkeleton lines={6} />;
  if (!data) return <p className="text-xs text-gray-400">성적표 데이터가 없습니다.</p>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold text-gray-900">{data.quarter} 성적표</h3>
        <a
          href={`/api/farms/${farmId}/report-card/pdf?quarter=${data.quarter}`}
          target="_blank"
          rel="noopener noreferrer"
          className="rounded bg-gray-100 px-3 py-1 text-xs text-gray-600 hover:bg-gray-200"
        >
          PDF 다운로드
        </a>
      </div>

      {/* 등급표 */}
      <div className="space-y-2">
        {data.metrics.map((m) => {
          const grade = GRADE_COLORS[m.grade] ?? GRADE_COLORS.C!;
          return (
            <div key={m.label} className="rounded-lg border border-gray-200 bg-white p-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className={`inline-flex h-8 w-8 items-center justify-center rounded-lg text-sm font-bold ${grade.bg} ${grade.text}`}>
                    {m.grade}
                  </span>
                  <div>
                    <p className="text-sm font-medium text-gray-800">{m.label}</p>
                    <p className="text-xs text-gray-400">전국 {m.nationalAvg}{m.unit} / 지역 {m.regionAvg}{m.unit}</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-lg font-bold text-gray-900">{m.value}{m.unit}</p>
                  <span className={`text-xs ${m.trend === 'up' ? 'text-green-500' : m.trend === 'down' ? 'text-red-500' : 'text-gray-400'}`}>
                    {TREND_ICONS[m.trend]} 전기 대비
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* AI 코멘트 */}
      {data.aiComment && (
        <div className="rounded-lg border border-blue-200 bg-blue-50 p-3">
          <h4 className="text-xs font-semibold text-blue-800">AI 종합 평가</h4>
          <p className="mt-1 whitespace-pre-wrap text-sm text-blue-700">{data.aiComment}</p>
        </div>
      )}
    </div>
  );
}
