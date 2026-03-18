// 센서 시계열 차트 — 24h/48h/7d/30d 전환, Recharts

import React, { useState } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts';
import type { TimeRange } from '@web/api/sensor.api';
import { useSensorHistory } from '@web/hooks/useSensor';
import { LoadingSkeleton } from '@web/components/common/LoadingSkeleton';
import { ErrorFallback } from '@web/components/common/ErrorFallback';
import { EmptyState } from '@web/components/common/EmptyState';

interface Props {
  readonly animalId: string;
  readonly metrics?: readonly MetricConfig[];
  readonly defaultRange?: TimeRange;
  readonly height?: number;
}

interface MetricConfig {
  readonly key: string;
  readonly label: string;
  readonly color: string;
  readonly unit: string;
}

const DEFAULT_METRICS: readonly MetricConfig[] = [
  { key: 'temperature', label: '체온', color: '#ef4444', unit: '°C' },
  { key: 'activity', label: '활동', color: '#3b82f6', unit: '' },
  { key: 'rumination', label: '반추', color: '#22c55e', unit: 'min' },
];

const RANGES: readonly TimeRange[] = ['24h', '48h', '7d', '30d'];

export function SensorChart({
  animalId,
  metrics = DEFAULT_METRICS,
  defaultRange = '24h',
  height = 300,
}: Props): React.JSX.Element {
  const [range, setRange] = useState<TimeRange>(defaultRange);
  const { data, isLoading, error, refetch } = useSensorHistory(animalId, range);

  if (isLoading) return <LoadingSkeleton lines={4} />;
  if (error) return <ErrorFallback error={error as Error} onRetry={() => { refetch(); }} />;
  if (!data?.data.length) return <EmptyState message="센서 데이터가 없습니다." />;

  return (
    <div>
      {/* 범위 선택 */}
      <div className="mb-3 flex gap-1">
        {RANGES.map((r) => (
          <button
            key={r}
            type="button"
            onClick={() => setRange(r)}
            className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
              range === r
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {r}
          </button>
        ))}
      </div>

      {/* 차트 */}
      <ResponsiveContainer width="100%" height={height}>
        <LineChart data={data.data as unknown as Record<string, unknown>[]}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
          <XAxis
            dataKey="timestamp"
            tick={{ fontSize: 10 }}
            tickFormatter={(val: string) => {
              const d = new Date(val);
              return range === '24h' || range === '48h'
                ? d.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })
                : d.toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' });
            }}
          />
          <YAxis tick={{ fontSize: 10 }} />
          <Tooltip
            labelFormatter={(val: string) => new Date(val).toLocaleString('ko-KR')}
            formatter={(value: number, name: string) => {
              const metric = metrics.find((m) => m.key === name);
              return [`${value}${metric?.unit ?? ''}`, metric?.label ?? name];
            }}
          />
          <Legend />
          {metrics.map((m) => (
            <Line
              key={m.key}
              type="monotone"
              dataKey={m.key}
              name={m.key}
              stroke={m.color}
              strokeWidth={2}
              dot={false}
              connectNulls
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
