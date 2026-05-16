// 방역 이력 및 학습 데이터베이스
// 경보 이력 테이블 + 정탐/오탐 피드백 + AI 정확도 차트
// BUG-008: 표본 부족 시 정확도 차트 대신 "—" 안내 + neutral 색.

import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  RadarChart, PolarGrid, PolarAngleAxis, Radar,
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
} from 'recharts';
import { listCases, submitCaseFeedback } from '@web/api/epidemic.api';
import type { CaseRecord, CaseOutcome, AccuracyStats, AccuracyMetricResult } from '@web/api/epidemic.api';

const INSUFFICIENT_RESULT: AccuracyMetricResult = {
  numerator: 0,
  denominator: 0,
  rate: null,
  displayValue: '—',
  status: 'data_insufficient',
};

function AccuracyMetric({ label, result, okColor, okStyle }: {
  readonly label: string;
  readonly result: AccuracyMetricResult;
  readonly okColor: string;
  readonly okStyle?: React.CSSProperties;
}): React.JSX.Element {
  const insufficient = result.status === 'data_insufficient';
  return (
    <div className="text-center">
      <p
        className={`text-lg font-bold ${insufficient ? '' : okColor}`}
        style={insufficient ? { color: 'var(--ct-text-muted)' } : okStyle}
        role="status"
        aria-label={insufficient ? `${label} 데이터 부족` : `${label} ${result.displayValue}`}
        title={insufficient ? '충분한 표본이 없습니다' : undefined}
      >
        {result.displayValue}
      </p>
      <p className="text-xs" style={{ color: 'var(--ct-text-secondary)' }}>{label}</p>
    </div>
  );
}


// ===========================
// 메인 컴포넌트
// ===========================

export default function CaseDatabase(): React.JSX.Element {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [filterOutcome, setFilterOutcome] = useState<CaseOutcome | 'all'>('all');

  const { data, isLoading } = useQuery({
    queryKey: ['quarantine', 'cases', filterOutcome, search],
    queryFn: () => listCases({
      outcome: filterOutcome !== 'all' ? filterOutcome : undefined,
      search: search || undefined,
      limit: 50,
    }),
  });

  const cases: readonly CaseRecord[] = data?.cases ?? [];
  const accuracy: AccuracyStats = data?.accuracy ?? {
    precision: 0, recall: 0, f1: 0,
    precisionResult: INSUFFICIENT_RESULT,
    recallResult: INSUFFICIENT_RESULT,
    f1Result: INSUFFICIENT_RESULT,
    totalCases: 0, truePositives: 0, falsePositives: 0, pending: 0,
  };
  // D5/D4 (BUG-008): 표본 부족 시 차트/숫자 모두 neutral. "0%" 녹색 표시 금지.
  const allInsufficient = accuracy.precisionResult.status === 'data_insufficient'
    && accuracy.recallResult.status === 'data_insufficient'
    && accuracy.f1Result.status === 'data_insufficient';

  const feedbackMutation = useMutation({
    mutationFn: ({ alertId, outcome, farmId }: { alertId: string; outcome: CaseOutcome; farmId: string }) =>
      submitCaseFeedback(alertId, outcome, farmId),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['quarantine', 'cases'] }),
  });

  // D5/D4 (BUG-008): 표본 부족 시 chart value=0 (radar 비어보임).
  // 충분 시 rate 직접 (server 측 clampPct + minSamples 통과한 값).
  const radarData = [
    { metric: '정밀도', value: accuracy.precisionResult.rate ?? 0 },
    { metric: '재현율', value: accuracy.recallResult.rate ?? 0 },
    { metric: 'F1', value: accuracy.f1Result.rate ?? 0 },
    { metric: '정탐률', value: accuracy.totalCases > 0 ? Math.round(accuracy.truePositives / accuracy.totalCases * 100) : 0 },
    { metric: '커버리지', value: accuracy.totalCases > 0 ? Math.round((accuracy.truePositives + accuracy.falsePositives) / accuracy.totalCases * 100) : 0 },
  ];

  const outcomeDist = [
    { name: '정탐', value: accuracy.truePositives, fill: '#22c55e' },
    { name: '오탐', value: accuracy.falsePositives, fill: '#ef4444' },
    { name: '확인 중', value: accuracy.pending, fill: '#94a3b8' },
  ];

  return (
    <div className="space-y-6">
      {/* 헤더 */}
      <div>
        <h1 className="text-xl font-bold" style={{ color: 'var(--ct-text)' }}>
          방역 사례 데이터베이스
        </h1>
        <p className="text-sm mt-0.5" style={{ color: 'var(--ct-text-secondary)' }}>
          경보 이력 + AI 피드백 루프 — 정탐/오탐 입력으로 정확도 지속 개선
        </p>
      </div>

      {/* AI 정확도 요약 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* 레이더 차트 */}
        <div
          className="rounded-xl border p-4"
          style={{ background: 'var(--ct-card)', borderColor: 'var(--ct-border)' }}
        >
          <h3 className="text-sm font-semibold mb-3" style={{ color: 'var(--ct-text)' }}>
            AI 정확도 지표
          </h3>
          <ResponsiveContainer width="100%" height={200}>
            <RadarChart data={radarData}>
              <PolarGrid />
              <PolarAngleAxis dataKey="metric" tick={{ fontSize: 11 }} />
              <Radar dataKey="value" stroke="var(--ct-primary)" fill="var(--ct-primary)" fillOpacity={0.3} />
            </RadarChart>
          </ResponsiveContainer>
        </div>

        {/* 결과 분포 */}
        <div
          className="rounded-xl border p-4"
          style={{ background: 'var(--ct-card)', borderColor: 'var(--ct-border)' }}
        >
          <h3 className="text-sm font-semibold mb-3" style={{ color: 'var(--ct-text)' }}>
            경보 결과 분포 ({accuracy.totalCases}건)
          </h3>
          <ResponsiveContainer width="100%" height={160}>
            <BarChart data={outcomeDist}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--ct-border)" />
              <XAxis dataKey="name" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip />
              <Bar dataKey="value" name="건수">
                {outcomeDist.map((entry) => (
                  <rect key={entry.name} fill={entry.fill} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          <div className="flex gap-4 mt-3 justify-center">
            {/* D5/D4 (BUG-008): 표본 부족 시 "—" neutral. 컬러 라벨 금지. */}
            <AccuracyMetric label="정밀도" result={accuracy.precisionResult} okColor="text-emerald-600" />
            <AccuracyMetric label="재현율" result={accuracy.recallResult} okColor="text-blue-600" />
            <AccuracyMetric label="F1" result={accuracy.f1Result} okColor="" okStyle={{ color: 'var(--ct-primary)' }} />
          </div>
          {allInsufficient && (
            <p
              className="mt-3 text-center text-xs"
              style={{ color: 'var(--ct-text-secondary)' }}
            >
              충분한 표본이 없습니다 (최소 10건 필요, 현재 {accuracy.precisionResult.denominator}건)
            </p>
          )}
        </div>
      </div>

      {/* 검색 + 필터 */}
      <div className="flex flex-wrap gap-3">
        <input
          type="text"
          placeholder="농장명, 경보 유형 검색..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1 min-w-0 rounded-lg border px-3 py-2 text-sm"
          style={{
            background: 'var(--ct-card)',
            borderColor: 'var(--ct-border)',
            color: 'var(--ct-text)',
          }}
        />
        <div className="flex gap-1.5">
          {(['all', 'true_positive', 'false_positive', 'pending'] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilterOutcome(f)}
              className={`rounded-lg px-3 py-2 text-xs font-medium border transition-colors ${
                filterOutcome === f ? 'text-white' : ''
              }`}
              style={
                filterOutcome === f
                  ? { background: 'var(--ct-primary)', borderColor: 'var(--ct-primary)', color: 'white' }
                  : { borderColor: 'var(--ct-border)', color: 'var(--ct-text-secondary)', background: 'var(--ct-card)' }
              }
            >
              {f === 'all' ? '전체' : f === 'true_positive' ? '정탐' : f === 'false_positive' ? '오탐' : '확인 중'}
            </button>
          ))}
        </div>
      </div>

      {/* 사례 테이블 */}
      <div
        className="rounded-xl border overflow-hidden"
        style={{ borderColor: 'var(--ct-border)' }}
      >
        {isLoading ? (
          <div className="p-4 space-y-2">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-14 rounded animate-pulse" style={{ background: 'var(--ct-border)' }} />
            ))}
          </div>
        ) : (
          <div className="overflow-x-auto -mx-1">
          <table className="w-full min-w-[600px]">
            <thead style={{ background: 'var(--ct-bg)' }}>
              <tr>
                {['날짜', '농장', '경보 내용', 'DSI', '결과', '피드백'].map((h) => (
                  <th key={h} className="text-left px-4 py-3 text-xs font-semibold" style={{ color: 'var(--ct-text-secondary)' }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {cases.map((c, i) => (
                <tr
                  key={c.alertId}
                  style={{
                    background: i % 2 === 0 ? 'var(--ct-card)' : 'var(--ct-bg)',
                    borderTop: '1px solid var(--ct-border)',
                  }}
                >
                  <td className="px-4 py-3 text-xs" style={{ color: 'var(--ct-text-secondary)' }}>
                    {new Date(c.createdAt).toLocaleDateString('ko')}
                  </td>
                  <td className="px-4 py-3">
                    <p className="text-xs font-medium" style={{ color: 'var(--ct-text)' }}>{c.farmName}</p>
                    {c.diseaseName && (
                      <p className="text-xs text-red-600 font-semibold">{c.diseaseName}</p>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs max-w-48 truncate" style={{ color: 'var(--ct-text)' }}>
                    {c.title}
                  </td>
                  <td className="px-4 py-3 text-xs font-bold" style={{ color: 'var(--ct-primary)' }}>
                    {c.dsiScore ?? '—'}
                  </td>
                  <td className="px-4 py-3">
                    {c.outcome === 'true_positive' ? (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">정탐</span>
                    ) : c.outcome === 'false_positive' ? (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-700">오탐</span>
                    ) : (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">확인 중</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {c.outcome === 'pending' && (
                      <div className="flex gap-1.5">
                        <button
                          onClick={() => feedbackMutation.mutate({ alertId: c.alertId, outcome: 'true_positive', farmId: c.farmId })}
                          className="text-xs px-2 py-1 rounded border border-emerald-300 text-emerald-700 hover:bg-emerald-50"
                        >
                          정탐
                        </button>
                        <button
                          onClick={() => feedbackMutation.mutate({ alertId: c.alertId, outcome: 'false_positive', farmId: c.farmId })}
                          className="text-xs px-2 py-1 rounded border border-red-300 text-red-700 hover:bg-red-50"
                        >
                          오탐
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        )}

        {!isLoading && cases.length === 0 && (
          <div className="text-center py-12">
            <p className="text-sm" style={{ color: 'var(--ct-text-secondary)' }}>
              경보 이력이 없습니다
            </p>
            <p className="text-xs mt-1" style={{ color: 'var(--ct-text-secondary)' }}>
              smaXtec 센서 이벤트가 수집되면 자동으로 표시됩니다
            </p>
          </div>
        )}
      </div>

      <p className="text-xs text-center" style={{ color: 'var(--ct-text-secondary)' }}>
        방역관이 입력한 피드백은 AI 질병 시그니처 모델 개선에 자동 반영됩니다
      </p>
    </div>
  );
}
