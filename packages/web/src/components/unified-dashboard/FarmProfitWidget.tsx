// 농장 수익성 대시보드 위젯

import React, { useState, useCallback } from 'react';
import {
  PieChart, Pie, Cell, LineChart, Line, XAxis, YAxis,
  CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts';
import type {
  FarmProfitData,
  FarmProfitEntryInput as FarmProfitEntryInputType,
  RevenueBreakdownItem,
  CostBreakdownItem,
  MonthlyProfitTrend,
  ProfitInsight,
} from '@cowtalk/shared';
import { FarmProfitInputForm } from './FarmProfitInputForm';
import { useFarmProfitEntry, useSaveFarmProfit } from '@web/hooks/useUnifiedDashboard';

// ── 상수 ──

const REVENUE_COLORS: Record<string, string> = {
  milk: '#22c55e',
  calves: '#3b82f6',
  subsidies: '#8b5cf6',
  cull_sales: '#f97316',
  other: '#94a3b8',
};

const COST_COLORS: Record<string, string> = {
  feed: '#ef4444',
  vet: '#f97316',
  breeding: '#eab308',
  labor: '#3b82f6',
  facility: '#8b5cf6',
  other: '#94a3b8',
};

const SEVERITY_COLORS: Record<string, string> = {
  critical: '#ef4444',
  high: '#f97316',
  medium: '#eab308',
  low: '#22c55e',
};

const SEVERITY_LABELS: Record<string, string> = {
  critical: '긴급',
  high: '높음',
  medium: '보통',
  low: '낮음',
};

// ── 유틸리티 ──

function formatKrw(amount: number): string {
  const abs = Math.abs(amount);
  const sign = amount < 0 ? '-' : '';

  if (abs >= 100_000_000) {
    return `${sign}${(abs / 100_000_000).toFixed(1)}억원`;
  }
  if (abs >= 10_000_000) {
    const man = Math.round(abs / 10_000);
    return `${sign}${man.toLocaleString('ko-KR')}만원`;
  }
  if (abs >= 1_000_000) {
    const man = Math.round(abs / 10_000);
    return `${sign}${man}만원`;
  }
  return `${sign}${abs.toLocaleString('ko-KR')}원`;
}

function formatPeriodLabel(period: string): string {
  const parts = period.split('-');
  const year = parts[0] ?? '';
  const month = parts[1] ?? '1';
  return `${year}년 ${parseInt(month, 10)}월`;
}

function formatMonthShort(month: string): string {
  const part = month.split('-')[1] ?? '1';
  const m = parseInt(part, 10);
  return `${m}월`;
}

// ── KPI 카드 바 ──

interface KpiItem {
  readonly label: string;
  readonly value: string;
  readonly sub?: string;
  readonly color?: string;
}

function ProfitKpiBar({ summary }: {
  readonly summary: FarmProfitData['summary'];
}): React.JSX.Element {
  const items: readonly KpiItem[] = [
    {
      label: '월 수입',
      value: formatKrw(summary.totalRevenue),
      sub: `두당 ${formatKrw(summary.revenuePerHead)}`,
      color: '#22c55e',
    },
    {
      label: '월 지출',
      value: formatKrw(summary.totalCosts),
      sub: `두당 ${formatKrw(summary.costPerHead)}`,
      color: '#ef4444',
    },
    {
      label: '순이익',
      value: formatKrw(summary.netProfit),
      sub: `마진 ${summary.profitMargin.toFixed(1)}%`,
      color: summary.netProfit >= 0 ? '#22c55e' : '#ef4444',
    },
    {
      label: '두당 수익',
      value: formatKrw(summary.profitPerHead),
      sub: `${summary.headCount}두 기준`,
      color: summary.profitPerHead >= 0 ? 'var(--ct-primary)' : '#ef4444',
    },
  ];

  return (
    <div style={{ display: 'flex', gap: 12, marginBottom: 20 }}>
      {items.map((item) => (
        <div
          key={item.label}
          style={{
            flex: 1,
            background: 'rgba(0,0,0,0.2)',
            borderRadius: 10,
            padding: '14px 12px',
            textAlign: 'center',
            minWidth: 0,
          }}
        >
          <div style={{ fontSize: 10, color: 'var(--ct-text-muted)', marginBottom: 6, whiteSpace: 'nowrap' }}>
            {item.label}
          </div>
          <div style={{
            fontSize: 20,
            fontWeight: 800,
            color: item.color ?? 'var(--ct-text)',
            fontVariantNumeric: 'tabular-nums',
            letterSpacing: '-0.5px',
          }}>
            {item.value}
          </div>
          {item.sub && (
            <div style={{ fontSize: 10, color: 'var(--ct-text-muted)', marginTop: 4 }}>
              {item.sub}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ── 도넛 차트 툴팁 ──

function DonutTooltip({
  active,
  payload,
}: {
  readonly active?: boolean;
  readonly payload?: readonly { readonly name: string; readonly value: number; readonly payload: { readonly percentOfTotal: number } }[];
}): React.JSX.Element | null {
  const entry = active && payload && payload.length > 0 ? payload[0] : undefined;
  if (!entry) return null;

  return (
    <div style={{
      background: 'rgba(15, 23, 42, 0.95)',
      border: '1px solid var(--ct-border)',
      borderRadius: 8,
      padding: '8px 12px',
      boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
    }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: '#f8fafc', marginBottom: 4 }}>
        {entry.name}
      </div>
      <div style={{ fontSize: 11, color: '#94a3b8' }}>
        {formatKrw(entry.value)} ({entry.payload.percentOfTotal.toFixed(1)}%)
      </div>
    </div>
  );
}

// ── 도넛 차트 2개 ──

function ProfitDonutCharts({ revenue, costs }: {
  readonly revenue: readonly RevenueBreakdownItem[];
  readonly costs: readonly CostBreakdownItem[];
}): React.JSX.Element {
  const revenueData = revenue.map((r) => ({
    name: r.label,
    value: r.amount,
    percentOfTotal: r.percentOfTotal,
  }));

  const costData = costs.map((c) => ({
    name: c.label,
    value: c.amount,
    percentOfTotal: c.percentOfTotal,
  }));

  const revenueColors = revenue.map((r) => REVENUE_COLORS[r.category] ?? '#94a3b8');
  const costColors = costs.map((c) => COST_COLORS[c.category] ?? '#94a3b8');

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 }}>
      <DonutSection title="수입 구성" data={revenueData} colors={revenueColors} />
      <DonutSection title="지출 구성" data={costData} colors={costColors} />
    </div>
  );
}

function DonutSection({ title, data, colors }: {
  readonly title: string;
  readonly data: readonly { readonly name: string; readonly value: number; readonly percentOfTotal: number }[];
  readonly colors: readonly string[];
}): React.JSX.Element {
  return (
    <div style={{
      background: 'rgba(0,0,0,0.15)',
      borderRadius: 10,
      padding: '14px 12px',
    }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--ct-text-muted)', marginBottom: 8, textAlign: 'center' }}>
        {title}
      </div>
      <ResponsiveContainer width="100%" height={160}>
        <PieChart>
          <Pie
            data={data as unknown as Record<string, unknown>[]}
            dataKey="value"
            nameKey="name"
            cx="50%"
            cy="50%"
            innerRadius={40}
            outerRadius={65}
            paddingAngle={2}
            animationDuration={800}
          >
            {data.map((_, i) => (
              <Cell key={i} fill={colors[i]} stroke="none" />
            ))}
          </Pie>
          <Tooltip content={<DonutTooltip />} />
        </PieChart>
      </ResponsiveContainer>
      {/* 범례 */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'center', marginTop: 4 }}>
        {data.map((item, i) => (
          <div key={item.name} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: 'var(--ct-text-secondary)' }}>
            <span style={{
              width: 8,
              height: 8,
              borderRadius: 2,
              background: colors[i],
              display: 'inline-block',
              flexShrink: 0,
            }} />
            {item.name}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── 6개월 추이 라인차트 ──

function TrendTooltip({
  active,
  payload,
  label,
}: {
  readonly active?: boolean;
  readonly payload?: readonly { readonly dataKey: string; readonly value: number; readonly color: string }[];
  readonly label?: string;
}): React.JSX.Element | null {
  if (!active || !payload || payload.length === 0) return null;

  const labels: Record<string, string> = {
    revenue: '수입',
    costs: '지출',
    profit: '순이익',
  };

  return (
    <div style={{
      background: 'rgba(15, 23, 42, 0.95)',
      border: '1px solid var(--ct-border)',
      borderRadius: 8,
      padding: '8px 12px',
      boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
      minWidth: 140,
    }}>
      <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 6 }}>{label}</div>
      {payload.map((entry) => (
        <div key={entry.dataKey} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginBottom: 2 }}>
          <span style={{ fontSize: 11, color: entry.color }}>{labels[entry.dataKey] ?? entry.dataKey}</span>
          <span style={{ fontSize: 12, fontWeight: 700, color: '#f8fafc' }}>{formatKrw(entry.value)}</span>
        </div>
      ))}
    </div>
  );
}

function MonthlyTrendChart({ data }: {
  readonly data: readonly MonthlyProfitTrend[];
}): React.JSX.Element {
  const chartData = data.map((d) => ({
    ...d,
    month: formatMonthShort(d.month),
  }));

  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--ct-text-muted)', marginBottom: 10 }}>
        6개월 수익 추이
      </div>
      <ResponsiveContainer width="100%" height={220}>
        <LineChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--ct-border)" strokeOpacity={0.3} vertical={false} />
          <XAxis
            dataKey="month"
            tick={{ fontSize: 10, fill: 'var(--ct-text-muted)' }}
            stroke="var(--ct-border)"
            tickLine={false}
          />
          <YAxis
            tick={{ fontSize: 9, fill: 'var(--ct-text-muted)' }}
            stroke="var(--ct-border)"
            tickLine={false}
            axisLine={false}
            tickFormatter={(v: number) => formatKrw(v)}
            width={70}
          />
          <Tooltip content={<TrendTooltip />} />
          <Legend
            verticalAlign="top"
            height={28}
            formatter={(value: string) => {
              const map: Record<string, string> = { revenue: '수입', costs: '지출', profit: '순이익' };
              return map[value] ?? value;
            }}
            wrapperStyle={{ fontSize: 11, color: 'var(--ct-text-secondary)' }}
          />
          <Line
            type="monotone"
            dataKey="revenue"
            stroke="#22c55e"
            strokeWidth={2}
            dot={{ r: 3, fill: '#22c55e' }}
            animationDuration={1000}
          />
          <Line
            type="monotone"
            dataKey="costs"
            stroke="#ef4444"
            strokeWidth={2}
            dot={{ r: 3, fill: '#ef4444' }}
            animationDuration={1000}
          />
          <Line
            type="monotone"
            dataKey="profit"
            stroke="#3b82f6"
            strokeWidth={2.5}
            dot={{ r: 3, fill: '#3b82f6' }}
            animationDuration={1000}
            strokeDasharray="6 3"
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

// ── AI 비용절감 인사이트 ──

function ProfitInsightsPanel({ insights }: {
  readonly insights: readonly ProfitInsight[];
}): React.JSX.Element {
  if (insights.length === 0) return <></>;

  return (
    <div>
      <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--ct-text-muted)', marginBottom: 10 }}>
        AI 비용절감 인사이트
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {insights.map((insight) => {
          const severityColor = SEVERITY_COLORS[insight.severity] ?? '#94a3b8';
          return (
            <div
              key={insight.id}
              style={{
                background: `${severityColor}08`,
                border: `1px solid ${severityColor}33`,
                borderRadius: 10,
                padding: '12px 14px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                <span style={{
                  fontSize: 9,
                  fontWeight: 700,
                  padding: '2px 8px',
                  borderRadius: 6,
                  background: `${severityColor}22`,
                  color: severityColor,
                  textTransform: 'uppercase',
                  letterSpacing: '0.5px',
                }}>
                  {SEVERITY_LABELS[insight.severity] ?? insight.severity}
                </span>
                <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--ct-text)' }}>
                  {insight.title}
                </span>
              </div>
              <div style={{ fontSize: 12, color: 'var(--ct-text-secondary)', lineHeight: 1.6, marginBottom: 6 }}>
                {insight.description}
              </div>
              <div style={{ display: 'flex', gap: 16, fontSize: 11 }}>
                <span style={{ color: severityColor, fontWeight: 600 }}>
                  예상 절감: {formatKrw(insight.estimatedSavings)}/월
                </span>
                <span style={{ color: 'var(--ct-text-muted)' }}>
                  {insight.actionRequired}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── 데이터 소스 배지 ──

const DATA_SOURCE_LABELS: Record<string, { readonly label: string; readonly color: string; readonly bg: string }> = {
  actual: { label: '실데이터', color: '#22c55e', bg: 'rgba(34,197,94,0.15)' },
  simulated: { label: '시뮬레이션', color: '#f97316', bg: 'rgba(249,115,22,0.15)' },
  mixed: { label: '혼합', color: '#eab308', bg: 'rgba(234,179,8,0.15)' },
};

function DataSourceBadge({ source }: { readonly source: string }): React.JSX.Element {
  const info = DATA_SOURCE_LABELS[source] ?? DATA_SOURCE_LABELS.simulated!;
  return (
    <span style={{
      fontSize: 9,
      fontWeight: 700,
      padding: '2px 8px',
      borderRadius: 6,
      background: info.bg,
      color: info.color,
      letterSpacing: '0.3px',
      textTransform: 'uppercase',
    }}>
      {info.label}
    </span>
  );
}

// ── 메인 컴포넌트 ──

interface Props {
  readonly data: FarmProfitData;
}

export function FarmProfitWidget({ data }: Props): React.JSX.Element {
  const profitColor = data.summary.netProfit >= 0 ? '#22c55e' : '#ef4444';
  const isIndividualFarm = data.farmId !== 'all';

  const [showInputForm, setShowInputForm] = useState(false);
  const { data: existingEntry } = useFarmProfitEntry(isIndividualFarm ? data.farmId : null, data.period);
  const saveMutation = useSaveFarmProfit();

  const handleOpenInput = useCallback(() => {
    setShowInputForm(true);
  }, []);

  const handleCloseInput = useCallback(() => {
    setShowInputForm(false);
  }, []);

  const handleSave = useCallback((input: FarmProfitEntryInputType) => {
    saveMutation.mutate(input, {
      onSuccess: () => {
        setShowInputForm(false);
      },
    });
  }, [saveMutation]);

  return (
    <div
      className="ct-fade-up"
      style={{
        background: 'var(--ct-card)',
        borderRadius: 14,
        border: `1px solid ${profitColor}44`,
        padding: '20px 20px 16px',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* ── 헤더 ── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 18 }}>&#x1F4B0;</span>
          <span style={{ fontWeight: 800, fontSize: 15, color: 'var(--ct-text)', letterSpacing: '-0.3px' }}>
            농장 수익성 대시보드
          </span>
          <DataSourceBadge source={data.dataSource} />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {isIndividualFarm && (
            <button
              type="button"
              onClick={handleOpenInput}
              style={{
                padding: '5px 12px',
                borderRadius: 8,
                border: '1px solid var(--ct-primary)',
                background: 'rgba(29,158,117,0.1)',
                color: 'var(--ct-primary)',
                fontSize: 11,
                fontWeight: 700,
                cursor: 'pointer',
                whiteSpace: 'nowrap',
              }}
            >
              데이터 입력
            </button>
          )}
          <span style={{
            fontSize: 12,
            fontWeight: 600,
            color: 'var(--ct-text-secondary)',
            fontVariantNumeric: 'tabular-nums',
          }}>
            {formatPeriodLabel(data.period)}
          </span>
        </div>
      </div>

      {/* ── KPI 카드 ── */}
      <ProfitKpiBar summary={data.summary} />

      {/* ── 도넛 차트 ── */}
      <ProfitDonutCharts revenue={data.revenueBreakdown} costs={data.costBreakdown} />

      {/* ── 6개월 추이 ── */}
      {data.monthlyTrend.length > 0 && (
        <MonthlyTrendChart data={data.monthlyTrend} />
      )}

      {/* ── AI 인사이트 ── */}
      <ProfitInsightsPanel insights={data.insights} />

      {/* ── 입력 폼 모달 ── */}
      {showInputForm && isIndividualFarm && (
        <FarmProfitInputForm
          farmId={data.farmId}
          farmName={data.farmName}
          existingEntry={existingEntry}
          onSave={handleSave}
          onClose={handleCloseInput}
          isSaving={saveMutation.isPending}
        />
      )}
    </div>
  );
}
