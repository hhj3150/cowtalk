// 생산성 분석 대시보드

import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import * as economicsApi from '@web/api/economics.api';
import { KpiCard } from '@web/components/data/KpiCard';
import { LoadingSkeleton } from '@web/components/common/LoadingSkeleton';

interface Props {
  readonly farmId: string;
  readonly breedType: 'dairy' | 'beef';
}

const PIE_COLORS = ['#3b82f6', '#ef4444', '#22c55e', '#f59e0b', '#8b5cf6', '#06b6d4', '#ec4899', '#64748b', '#84cc16', '#f97316'];

export function FarmProductivity({ farmId, breedType }: Props): React.JSX.Element {
  const { data: economics, isLoading: eLoading } = useQuery({
    queryKey: ['economics', farmId],
    queryFn: () => economicsApi.getEconomics(farmId),
    staleTime: 10 * 60 * 1000,
  });

  const { data: productivity, isLoading: pLoading } = useQuery({
    queryKey: ['economics', farmId, 'productivity'],
    queryFn: () => economicsApi.getProductivity(farmId),
    staleTime: 10 * 60 * 1000,
  });

  const { data: analysis } = useQuery({
    queryKey: ['economics', farmId, 'analysis'],
    queryFn: () => economicsApi.getEconomicAnalysis(farmId),
    staleTime: 10 * 60 * 1000,
  });

  if (eLoading || pLoading) return <LoadingSkeleton lines={8} />;

  const latestEcon = economics?.[economics.length - 1];
  const latestProd = productivity?.[productivity.length - 1];

  // 비용 구성 파이차트 데이터
  const expenseData = latestEcon
    ? Object.entries(latestEcon.expense).map(([key, value]) => ({ name: key, value })).filter((d) => d.value > 0)
    : [];

  return (
    <div className="space-y-6">
      {/* KPI */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {latestEcon && (
          <>
            <KpiCard label="월 순이익" value={latestEcon.netProfit.toLocaleString()} unit="원" />
            <KpiCard label="두당 순이익" value={latestEcon.perHeadProfit.toLocaleString()} unit="원/일" />
          </>
        )}
        {latestProd && breedType === 'dairy' && (
          <>
            <KpiCard label="평균 유량" value={latestProd.milkYieldAvg ?? 0} unit="kg" />
            <KpiCard label="사료효율" value={latestProd.feedEfficiency?.toFixed(2) ?? '-'} />
          </>
        )}
        {latestProd && breedType === 'beef' && (
          <>
            <KpiCard label="일당증체량" value={latestProd.dailyGainAvg ?? 0} unit="g" />
            <KpiCard label="사료효율" value={latestProd.feedEfficiency?.toFixed(2) ?? '-'} />
          </>
        )}
      </div>

      {/* 월별 손익 차트 */}
      {economics && economics.length > 0 && (
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <h3 className="mb-3 text-sm font-semibold text-gray-800">월별 손익 추이</h3>
          <div className="h-52">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={[...economics]} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="month" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} tickFormatter={(v: number) => `${(v / 10000).toFixed(0)}만`} />
                <Tooltip contentStyle={{ fontSize: 11 }} formatter={(v: number) => v.toLocaleString() + '원'} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Line type="monotone" dataKey="totalIncome" name="수입" stroke="#22c55e" strokeWidth={2} />
                <Line type="monotone" dataKey="totalExpense" name="비용" stroke="#ef4444" strokeWidth={2} />
                <Line type="monotone" dataKey="netProfit" name="순이익" stroke="#3b82f6" strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* 비용 구성 */}
      {expenseData.length > 0 && (
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <h3 className="mb-3 text-sm font-semibold text-gray-800">비용 구성</h3>
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={expenseData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={70} label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`} labelLine={{ strokeWidth: 1 }} fontSize={10}>
                  {expenseData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                </Pie>
                <Tooltip formatter={(v: number) => v.toLocaleString() + '원'} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* AI 분석 */}
      {analysis && (
        <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
          <h3 className="mb-2 text-sm font-semibold text-blue-800">AI 경제성 분석</h3>
          <p className="text-sm text-blue-700">{analysis.summary}</p>
          {analysis.recommendations.length > 0 && (
            <ul className="mt-2 space-y-1">
              {analysis.recommendations.map((r, i) => (
                <li key={i} className="text-xs text-blue-600">• {r}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
