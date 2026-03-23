// 방역 이력 및 학습 데이터베이스
// 경보 이력 테이블 + 정탐/오탐 피드백 + AI 정확도 차트

import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  RadarChart, PolarGrid, PolarAngleAxis, Radar,
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
} from 'recharts';


// ===========================
// 타입
// ===========================

type FeedbackOutcome = 'true_positive' | 'false_positive' | 'pending';

interface CaseRecord {
  alertId: string;
  farmId: string;
  farmName: string;
  alertType: string;
  priority: string;
  title: string;
  createdAt: string;
  status: string;
  outcome: FeedbackOutcome;
  diseaseName: string | null;
  dsiScore: number | null;
}

interface AccuracyStats {
  precision: number;
  recall: number;
  f1: number;
  totalCases: number;
  truePositives: number;
  falsePositives: number;
  pending: number;
}

// ===========================
// 목 데이터 생성 (서버 없을 때 fallback)
// ===========================

const MOCK_CASES: CaseRecord[] = Array.from({ length: 20 }, (_, i) => ({
  alertId: `mock-${i}`,
  farmId: `farm-${i % 5}`,
  farmName: `가나 농장 ${i + 1}호`,
  alertType: i % 3 === 0 ? 'cluster_fever' : 'fever',
  priority: i < 3 ? 'critical' : i < 8 ? 'high' : 'medium',
  title: i % 3 === 0 ? '집단 발열 감지' : `체온 이상 감지 (${(39.5 + i * 0.1).toFixed(1)}°C)`,
  createdAt: new Date(Date.now() - i * 2 * 24 * 60 * 60 * 1000).toISOString(),
  status: i < 10 ? 'acknowledged' : 'new',
  outcome: i < 12 ? 'true_positive' : i < 15 ? 'false_positive' : 'pending',
  diseaseName: i < 2 ? '구제역 의심' : null,
  dsiScore: 30 + i * 3,
}));

// ===========================
// API 훅
// ===========================

async function fetchCases(): Promise<CaseRecord[]> {
  // 데모: 모의 데이터 (실제: /api/quarantine/cases)
  await new Promise((r) => setTimeout(r, 300));
  return MOCK_CASES;
}

async function submitFeedback(alertId: string, outcome: FeedbackOutcome): Promise<void> {
  // 실제: POST /api/feedback
  await new Promise((r) => setTimeout(r, 200));
  void alertId;
  void outcome;
}

// ===========================
// 정확도 계산
// ===========================

function calcAccuracy(cases: CaseRecord[]): AccuracyStats {
  const tp = cases.filter((c) => c.outcome === 'true_positive').length;
  const fp = cases.filter((c) => c.outcome === 'false_positive').length;
  const pending = cases.filter((c) => c.outcome === 'pending').length;
  const total = cases.length;
  const precision = tp + fp > 0 ? tp / (tp + fp) : 0;
  const recall = total > 0 ? tp / (tp + pending * 0.5) : 0;
  const f1 = precision + recall > 0 ? 2 * precision * recall / (precision + recall) : 0;
  return { precision, recall, f1, totalCases: total, truePositives: tp, falsePositives: fp, pending };
}

// ===========================
// 메인 컴포넌트
// ===========================

export default function CaseDatabase(): React.JSX.Element {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [filterOutcome, setFilterOutcome] = useState<FeedbackOutcome | 'all'>('all');

  const { data: cases = [], isLoading } = useQuery({
    queryKey: ['quarantine', 'cases'],
    queryFn: fetchCases,
  });

  const feedbackMutation = useMutation({
    mutationFn: ({ alertId, outcome }: { alertId: string; outcome: FeedbackOutcome }) =>
      submitFeedback(alertId, outcome),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['quarantine', 'cases'] }),
  });

  const filtered = cases.filter((c) => {
    const matchSearch = !search ||
      c.farmName.includes(search) ||
      c.title.includes(search) ||
      (c.diseaseName ?? '').includes(search);
    const matchOutcome = filterOutcome === 'all' || c.outcome === filterOutcome;
    return matchSearch && matchOutcome;
  });

  const accuracy = calcAccuracy(cases);

  const radarData = [
    { metric: '정밀도', value: Math.round(accuracy.precision * 100) },
    { metric: '재현율', value: Math.round(accuracy.recall * 100) },
    { metric: 'F1', value: Math.round(accuracy.f1 * 100) },
    { metric: '정탐률', value: accuracy.totalCases > 0 ? Math.round(accuracy.truePositives / accuracy.totalCases * 100) : 0 },
    { metric: '커버리지', value: 85 },
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
          📚 방역 사례 데이터베이스
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
            🎯 AI 정확도 지표
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
            📊 경보 결과 분포 ({accuracy.totalCases}건)
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
            <div className="text-center">
              <p className="text-lg font-bold text-emerald-600">{(accuracy.precision * 100).toFixed(0)}%</p>
              <p className="text-xs" style={{ color: 'var(--ct-text-secondary)' }}>정밀도</p>
            </div>
            <div className="text-center">
              <p className="text-lg font-bold text-blue-600">{(accuracy.recall * 100).toFixed(0)}%</p>
              <p className="text-xs" style={{ color: 'var(--ct-text-secondary)' }}>재현율</p>
            </div>
            <div className="text-center">
              <p className="text-lg font-bold" style={{ color: 'var(--ct-primary)' }}>
                {(accuracy.f1 * 100).toFixed(0)}%
              </p>
              <p className="text-xs" style={{ color: 'var(--ct-text-secondary)' }}>F1</p>
            </div>
          </div>
        </div>
      </div>

      {/* 검색 + 필터 */}
      <div className="flex flex-wrap gap-3">
        <input
          type="text"
          placeholder="농장명, 경보 내용, 질병명 검색..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1 min-w-48 rounded-lg border px-3 py-2 text-sm"
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
          <table className="w-full">
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
              {filtered.map((c, i) => (
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
                      <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">정탐 ✓</span>
                    ) : c.outcome === 'false_positive' ? (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-700">오탐 ✗</span>
                    ) : (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">확인 중</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {c.outcome === 'pending' && (
                      <div className="flex gap-1.5">
                        <button
                          onClick={() => feedbackMutation.mutate({ alertId: c.alertId, outcome: 'true_positive' })}
                          className="text-xs px-2 py-1 rounded border border-emerald-300 text-emerald-700 hover:bg-emerald-50"
                        >
                          정탐
                        </button>
                        <button
                          onClick={() => feedbackMutation.mutate({ alertId: c.alertId, outcome: 'false_positive' })}
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
        )}

        {!isLoading && filtered.length === 0 && (
          <p className="text-center py-8 text-sm" style={{ color: 'var(--ct-text-secondary)' }}>
            검색 결과가 없습니다
          </p>
        )}
      </div>

      <p className="text-xs text-center" style={{ color: 'var(--ct-text-secondary)' }}>
        방역관이 입력한 피드백은 AI 질병 시그니처 모델 개선에 자동 반영됩니다
      </p>
    </div>
  );
}
