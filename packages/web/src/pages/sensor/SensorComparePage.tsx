// 센서 비교 뷰 — 최대 4두의 체온/활동량/반추 추이를 오버레이 비교
// 수의사·방역관이 발열 의심 개체를 나란히 비교하는 시연 핵심 화면

import React, { useState, useMemo, useCallback } from 'react';
import { useQueries } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine, Legend,
} from 'recharts';
import { fetchAnimalSensorChart } from '@web/api/unified-dashboard.api';
import type { AnimalSensorChartData } from '@web/api/unified-dashboard.api';
import { listAnimals } from '@web/api/animal.api';
import type { AnimalSummary } from '@web/api/animal.api';
import { useFarmStore } from '@web/stores/farm.store';
import { useQuery } from '@tanstack/react-query';

// ===========================
// 상수
// ===========================

const MAX_ANIMALS = 4;

const ANIMAL_COLORS = ['#3b82f6', '#ef4444', '#16a34a', '#d97706'] as const;

type MetricKey = 'temp' | 'act' | 'rum';

const METRIC_META: Readonly<Record<MetricKey, { label: string; unit: string; refLine?: number; refLabel?: string }>> = {
  temp: { label: '체온', unit: '°C', refLine: 38.5, refLabel: '발열 기준' },
  act:  { label: '활동량', unit: '' },
  rum:  { label: '반추', unit: 'min/24h' },
};

type DayRange = 2 | 7 | 30;

// ===========================
// 메인 컴포넌트
// ===========================

export default function SensorComparePage(): React.JSX.Element {
  const nav = useNavigate();
  const { selectedFarmId } = useFarmStore();

  const [selectedAnimalIds, setSelectedAnimalIds] = useState<readonly string[]>([]);
  const [metric, setMetric] = useState<MetricKey>('temp');
  const [days, setDays] = useState<DayRange>(7);
  const [searchQuery, setSearchQuery] = useState('');

  // 개체 목록 (검색용)
  const { data: animalList } = useQuery({
    queryKey: ['animals-for-compare', selectedFarmId],
    queryFn: () => listAnimals({ farmId: selectedFarmId ?? undefined, limit: 200, status: 'active' }),
    staleTime: 5 * 60_000,
  });

  const animals: readonly AnimalSummary[] = Array.isArray(animalList)
    ? animalList
    : (animalList?.data ?? []);

  // 검색 필터
  const filteredAnimals = useMemo(() => {
    if (!searchQuery) return animals.slice(0, 20);
    const q = searchQuery.toLowerCase();
    return animals.filter(
      (a) => a.earTag.toLowerCase().includes(q) || (a.traceId ?? '').includes(q),
    ).slice(0, 20);
  }, [animals, searchQuery]);

  // 선택된 개체의 센서 데이터 병렬 조회
  const sensorQueries = useQueries({
    queries: selectedAnimalIds.map((animalId) => ({
      queryKey: ['sensor-compare', animalId, days],
      queryFn: () => fetchAnimalSensorChart(animalId, days),
      staleTime: 60_000,
    })),
  });

  const sensorDataMap = useMemo(() => {
    const map = new Map<string, AnimalSensorChartData>();
    for (const q of sensorQueries) {
      if (q.data) map.set(q.data.animalId, q.data);
    }
    return map;
  }, [sensorQueries]);

  const isLoading = sensorQueries.some((q) => q.isLoading);

  // 오버레이 차트 데이터 합성
  const chartData = useMemo(() => {
    if (selectedAnimalIds.length === 0) return [];

    // 타임스탬프 합집합 수집
    const allTimestamps = new Set<number>();
    for (const [, data] of sensorDataMap) {
      const points = data.metrics[metric] ?? [];
      for (const p of points) {
        allTimestamps.add(p.ts);
      }
    }

    const sortedTs = [...allTimestamps].sort((a, b) => a - b);

    // 각 타임스탬프에 대해 각 개체의 값 매핑
    return sortedTs.map((ts) => {
      const row: Record<string, number | string | null> = { ts, time: formatTime(ts) };
      for (const animalId of selectedAnimalIds) {
        const data = sensorDataMap.get(animalId);
        if (!data) { row[animalId] = null; continue; }
        const points = data.metrics[metric] ?? [];
        // 가장 가까운 포인트 찾기
        const closest = findClosest(points, ts);
        row[animalId] = closest?.value ?? null;
      }
      return row;
    });
  }, [selectedAnimalIds, sensorDataMap, metric]);

  // 개체 선택/해제
  const toggleAnimal = useCallback((animalId: string) => {
    setSelectedAnimalIds((prev) => {
      if (prev.includes(animalId)) {
        return prev.filter((id) => id !== animalId);
      }
      if (prev.length >= MAX_ANIMALS) return prev;
      return [...prev, animalId];
    });
  }, []);

  const removeAnimal = useCallback((animalId: string) => {
    setSelectedAnimalIds((prev) => prev.filter((id) => id !== animalId));
  }, []);

  const metaInfo = METRIC_META[metric];

  return (
    <div className="space-y-4">
      {/* 헤더 */}
      <div>
        <h1 className="text-xl font-bold" style={{ color: 'var(--ct-text)' }}>
          📊 센서 비교 뷰
        </h1>
        <p className="text-sm mt-0.5" style={{ color: 'var(--ct-text-secondary)' }}>
          최대 {MAX_ANIMALS}두의 센서 데이터를 한 차트에서 비교
        </p>
      </div>

      {/* 컨트롤 바 */}
      <div className="flex flex-wrap gap-3 items-center">
        {/* 메트릭 토글 */}
        <div className="flex gap-1 rounded-lg p-1" style={{ background: 'var(--ct-bg)' }}>
          {(['temp', 'act', 'rum'] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMetric(m)}
              className="px-3 py-1.5 text-xs font-medium rounded-md transition-colors"
              style={
                metric === m
                  ? { background: 'var(--ct-card)', color: 'var(--ct-text)', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }
                  : { color: 'var(--ct-text-secondary)' }
              }
            >
              {METRIC_META[m].label}
            </button>
          ))}
        </div>

        {/* 기간 토글 */}
        <div className="flex gap-1 rounded-lg p-1" style={{ background: 'var(--ct-bg)' }}>
          {([2, 7, 30] as const).map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => setDays(d)}
              className="px-3 py-1.5 text-xs font-medium rounded-md transition-colors"
              style={
                days === d
                  ? { background: 'var(--ct-card)', color: 'var(--ct-text)', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }
                  : { color: 'var(--ct-text-secondary)' }
              }
            >
              {d}일
            </button>
          ))}
        </div>

        <span className="text-xs" style={{ color: 'var(--ct-text-secondary)' }}>
          {selectedAnimalIds.length}/{MAX_ANIMALS}두 선택
        </span>
      </div>

      {/* 선택된 개체 칩 */}
      {selectedAnimalIds.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {selectedAnimalIds.map((animalId, idx) => {
            const data = sensorDataMap.get(animalId);
            const color = ANIMAL_COLORS[idx] ?? '#6b7280';
            return (
              <div
                key={animalId}
                className="flex items-center gap-1.5 rounded-full px-3 py-1"
                style={{ background: `${color}15`, border: `2px solid ${color}` }}
              >
                <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: color }} />
                <button
                  type="button"
                  onClick={() => nav(`/cow/${animalId}`)}
                  className="text-xs font-semibold hover:underline"
                  style={{ color }}
                >
                  {data?.earTag ?? animalId.slice(0, 8)}
                </button>
                <button
                  type="button"
                  onClick={() => removeAnimal(animalId)}
                  className="text-xs ml-1 opacity-60 hover:opacity-100"
                  style={{ color }}
                >
                  ✕
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* 차트 */}
      <div
        className="rounded-xl border p-4"
        style={{ background: 'var(--ct-card)', borderColor: 'var(--ct-border)' }}
      >
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold" style={{ color: 'var(--ct-text)' }}>
            {metaInfo.label} 비교 ({days}일)
          </h3>
          {isLoading && (
            <span className="text-xs animate-pulse" style={{ color: 'var(--ct-text-secondary)' }}>
              로딩 중...
            </span>
          )}
        </div>

        {selectedAnimalIds.length === 0 ? (
          <div className="flex items-center justify-center h-64">
            <div className="text-center">
              <span className="text-4xl">🐄</span>
              <p className="text-sm mt-2" style={{ color: 'var(--ct-text-secondary)' }}>
                비교할 개체를 아래에서 선택하세요
              </p>
            </div>
          </div>
        ) : isLoading ? (
          <div className="h-64 rounded-lg animate-pulse" style={{ background: 'var(--ct-border)' }} />
        ) : (
          <ResponsiveContainer width="100%" height={320}>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--ct-border)" />
              <XAxis
                dataKey="time"
                tick={{ fontSize: 10 }}
                interval="preserveStartEnd"
              />
              <YAxis
                tick={{ fontSize: 10 }}
                unit={metaInfo.unit ? ` ${metaInfo.unit}` : ''}
              />
              <Tooltip
                contentStyle={{
                  background: 'var(--ct-card)',
                  border: '1px solid var(--ct-border)',
                  borderRadius: 8,
                  fontSize: 11,
                }}
                formatter={(value: unknown, name: string) => {
                  const numVal = typeof value === 'number' ? value : null;
                  if (numVal == null) return ['—', name];
                  const d = sensorDataMap.get(name);
                  const label = d?.earTag ?? name.slice(0, 8);
                  return [`${numVal.toFixed(1)}${metaInfo.unit}`, label];
                }}
              />
              <Legend
                formatter={(value: string) => {
                  const data = sensorDataMap.get(value);
                  return data?.earTag ?? value.slice(0, 8);
                }}
              />
              {metaInfo.refLine != null && (
                <ReferenceLine
                  y={metaInfo.refLine}
                  stroke="#ef4444"
                  strokeDasharray="5 5"
                  label={{ value: metaInfo.refLabel ?? '', fontSize: 10, fill: '#ef4444' }}
                />
              )}
              {selectedAnimalIds.map((animalId, idx) => (
                <Line
                  key={animalId}
                  type="monotone"
                  dataKey={animalId}
                  stroke={ANIMAL_COLORS[idx] ?? '#6b7280'}
                  strokeWidth={2}
                  dot={false}
                  connectNulls
                  name={animalId}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* 개체 선택 패널 */}
      <div
        className="rounded-xl border p-4"
        style={{ background: 'var(--ct-card)', borderColor: 'var(--ct-border)' }}
      >
        <h3 className="text-sm font-semibold mb-3" style={{ color: 'var(--ct-text)' }}>
          🔍 개체 선택 (earTag 검색)
        </h3>

        <input
          type="text"
          placeholder="이표번호 검색..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full rounded-lg border px-3 py-2 text-sm mb-3"
          style={{ background: 'var(--ct-bg)', borderColor: 'var(--ct-border)', color: 'var(--ct-text)' }}
        />

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2 max-h-64 overflow-y-auto">
          {filteredAnimals.map((animal) => {
            const isSelected = selectedAnimalIds.includes(animal.animalId);
            const selIdx = selectedAnimalIds.indexOf(animal.animalId);
            const color = selIdx >= 0 ? ANIMAL_COLORS[selIdx] : undefined;
            const isFull = selectedAnimalIds.length >= MAX_ANIMALS && !isSelected;

            return (
              <button
                key={animal.animalId}
                type="button"
                onClick={() => toggleAnimal(animal.animalId)}
                disabled={isFull}
                className="flex items-center gap-2 rounded-lg px-3 py-2 text-left transition-colors disabled:opacity-40"
                style={{
                  background: isSelected ? `${color}10` : 'var(--ct-bg)',
                  border: isSelected ? `2px solid ${color}` : '1px solid var(--ct-border)',
                }}
              >
                {isSelected && (
                  <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: color }} />
                )}
                <div className="min-w-0">
                  <p className="text-xs font-semibold truncate" style={{ color: isSelected ? color : 'var(--ct-text)' }}>
                    {animal.earTag}
                  </p>
                  <p className="text-[10px] truncate" style={{ color: 'var(--ct-text-secondary)' }}>
                    {animal.breed} · {animal.status}
                  </p>
                </div>
              </button>
            );
          })}
          {filteredAnimals.length === 0 && (
            <p className="col-span-full text-xs py-4 text-center" style={{ color: 'var(--ct-text-secondary)' }}>
              검색 결과 없음
            </p>
          )}
        </div>
      </div>

      {/* 선택 개체 요약 카드 */}
      {selectedAnimalIds.length > 0 && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {selectedAnimalIds.map((animalId, idx) => {
            const data = sensorDataMap.get(animalId);
            const color = ANIMAL_COLORS[idx] ?? '#6b7280';
            const tempPoints = data?.metrics.temp ?? [];
            const latestTemp = tempPoints.length > 0
              ? tempPoints[tempPoints.length - 1]?.value
              : null;
            const isFever = latestTemp != null && latestTemp >= 38.5;

            return (
              <div
                key={animalId}
                className="rounded-xl border p-3"
                style={{ borderColor: color, borderWidth: '2px', background: 'var(--ct-card)' }}
              >
                <div className="flex items-center gap-1.5 mb-2">
                  <span className="w-3 h-3 rounded-full" style={{ background: color }} />
                  <span className="text-sm font-bold" style={{ color }}>
                    {data?.earTag ?? '...'}
                  </span>
                </div>
                <div className="space-y-1">
                  <div className="flex justify-between text-xs">
                    <span style={{ color: 'var(--ct-text-secondary)' }}>체온</span>
                    <span
                      className="font-semibold"
                      style={{ color: isFever ? '#ef4444' : 'var(--ct-text)' }}
                    >
                      {latestTemp != null ? `${latestTemp.toFixed(1)}°C` : '—'}
                      {isFever && ' 🌡️'}
                    </span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span style={{ color: 'var(--ct-text-secondary)' }}>농장</span>
                    <span style={{ color: 'var(--ct-text)' }}>{data?.farmName ?? '—'}</span>
                  </div>
                  {data?.simulatedMetrics && data.simulatedMetrics.length > 0 && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-yellow-50 text-yellow-700">
                      추정치 포함
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ===========================
// 유틸
// ===========================

function formatTime(ts: number): string {
  const d = new Date(ts * 1000);
  return `${(d.getMonth() + 1)}/${d.getDate()} ${d.getHours()}시`;
}

function findClosest(
  points: readonly { ts: number; value: number }[],
  targetTs: number,
): { ts: number; value: number } | null {
  if (points.length === 0) return null;

  let best = points[0]!;
  let bestDist = Math.abs(best.ts - targetTs);

  for (const p of points) {
    const dist = Math.abs(p.ts - targetTs);
    if (dist < bestDist) {
      best = p;
      bestDist = dist;
    }
  }

  // 30분 이상 벗어나면 null
  return bestDist <= 1800 ? best : null;
}
