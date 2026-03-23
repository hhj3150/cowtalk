// 월간 농장 보고서 — /report/farm/:farmId/monthly
// AI가 선택한 월의 데이터를 분석하여 보고서 생성

import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { apiGet } from '@web/api/client';
import { useIsMobile } from '@web/hooks/useIsMobile';

interface MonthlyReport {
  readonly farmId: string;
  readonly farmName: string;
  readonly month: string;
  readonly summary: {
    readonly totalAnimals: number;
    readonly sensorAttached: number;
    readonly totalAlerts: number;
    readonly alertsByType: readonly { type: string; label: string; count: number }[];
  };
  readonly breeding: {
    readonly conceptionRate: number;
    readonly avgDaysOpen: number;
    readonly calvingInterval: number;
    readonly estrusDetectionRate: number;
    readonly inseminationCount: number;
    readonly conceptionPerService: number;
  };
  readonly health: {
    readonly diseaseByType: readonly { type: string; count: number }[];
    readonly mortalityCount: number;
    readonly cullingCount: number;
  };
  readonly sensor: {
    readonly sensorCoverage: number;
    readonly alertAccuracy: number;
    readonly aiVsHumanDetection: number;
  };
  readonly aiComment: string;
}

const MONTH_OPTIONS = (() => {
  const months: string[] = [];
  const now = new Date();
  for (let i = 0; i < 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }
  return months;
})();

export default function MonthlyReportPage(): React.JSX.Element {
  const { farmId } = useParams<{ farmId: string }>();
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const [month, setMonth] = useState(MONTH_OPTIONS[0]!);
  const [report, setReport] = useState<MonthlyReport | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!farmId) return;
    setLoading(true);
    apiGet<MonthlyReport>(`/reports/farm/${farmId}/monthly?month=${month}`)
      .then(setReport)
      .catch(() => setReport(null))
      .finally(() => setLoading(false));
  }, [farmId, month]);

  return (
    <div data-theme="dark" style={{ background: 'var(--ct-bg)', color: 'var(--ct-text)', minHeight: '100vh', padding: isMobile ? '12px 10px' : '20px 24px' }}>
      {/* 헤더 */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button type="button" onClick={() => navigate(-1)} style={{ background: 'var(--ct-card)', border: '1px solid var(--ct-border)', borderRadius: 8, padding: '6px 12px', color: 'var(--ct-text)', cursor: 'pointer', fontSize: 13 }}>← 돌아가기</button>
          <h1 style={{ fontSize: 18, fontWeight: 800, margin: 0 }}>📊 월간 농장 보고서</h1>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <select value={month} onChange={(e) => setMonth(e.target.value)} style={{ background: 'var(--ct-card)', color: 'var(--ct-text)', border: '1px solid var(--ct-border)', borderRadius: 8, padding: '6px 12px', fontSize: 13 }}>
            {MONTH_OPTIONS.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
          <button type="button" onClick={() => window.print()} style={{ padding: '6px 12px', borderRadius: 8, background: 'var(--ct-primary)', color: '#fff', border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>🖨️ 인쇄</button>
        </div>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 60, color: 'var(--ct-text-muted)' }}>보고서 생성 중...</div>
      ) : !report ? (
        <div style={{ textAlign: 'center', padding: 60 }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>📋</div>
          <div style={{ color: 'var(--ct-text-muted)' }}>해당 월의 보고서를 생성할 수 없습니다.</div>
          <div style={{ fontSize: 12, color: 'var(--ct-text-muted)', marginTop: 8 }}>데이터가 축적 시 자동 분석됩니다.</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* 농장 정보 */}
          <div style={{ background: 'var(--ct-card)', border: '1px solid var(--ct-border)', borderRadius: 12, padding: 20 }}>
            <h2 style={{ fontSize: 16, fontWeight: 800, margin: '0 0 8px' }}>{report.farmName} — {month} 보고서</h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 24, fontWeight: 800 }}>{report.summary.totalAnimals}</div>
                <div style={{ fontSize: 10, color: 'var(--ct-text-muted)' }}>총 두수</div>
              </div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 24, fontWeight: 800 }}>{report.summary.sensorAttached}</div>
                <div style={{ fontSize: 10, color: 'var(--ct-text-muted)' }}>센서 장착</div>
              </div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 24, fontWeight: 800 }}>{report.summary.totalAlerts}</div>
                <div style={{ fontSize: 10, color: 'var(--ct-text-muted)' }}>총 알림</div>
              </div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 24, fontWeight: 800, color: '#22c55e' }}>{report.sensor.sensorCoverage}%</div>
                <div style={{ fontSize: 10, color: 'var(--ct-text-muted)' }}>센서 커버리지</div>
              </div>
            </div>
          </div>

          {/* 번식 성적표 */}
          <div style={{ background: 'var(--ct-card)', border: '1px solid var(--ct-border)', borderRadius: 12, padding: 20 }}>
            <h2 style={{ fontSize: 14, fontWeight: 800, margin: '0 0 12px' }}>🐄 번식 성적표</h2>
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(3, 1fr)', gap: 12 }}>
              {[
                { label: '수태율', value: `${report.breeding.conceptionRate}%`, target: '≥50%', color: report.breeding.conceptionRate >= 50 ? '#22c55e' : '#ef4444' },
                { label: '평균 공태일', value: `${report.breeding.avgDaysOpen}일`, target: '<130일', color: report.breeding.avgDaysOpen <= 130 ? '#22c55e' : '#ef4444' },
                { label: '분만간격', value: `${report.breeding.calvingInterval}일`, target: '<400일', color: report.breeding.calvingInterval <= 400 ? '#22c55e' : '#ef4444' },
                { label: '발정감지율', value: `${report.breeding.estrusDetectionRate}%`, target: '≥70%', color: report.breeding.estrusDetectionRate >= 70 ? '#22c55e' : '#ef4444' },
                { label: '수정 횟수', value: `${report.breeding.inseminationCount}회`, target: '', color: 'var(--ct-text)' },
                { label: '수정당 수태', value: `${report.breeding.conceptionPerService}회`, target: '<2.0', color: report.breeding.conceptionPerService <= 2.0 ? '#22c55e' : '#ef4444' },
              ].map((kpi) => (
                <div key={kpi.label} style={{ padding: '10px 12px', borderRadius: 8, background: 'var(--ct-bg)' }}>
                  <div style={{ fontSize: 10, color: 'var(--ct-text-muted)' }}>{kpi.label} {kpi.target && <span style={{ color: '#64748b' }}>({kpi.target})</span>}</div>
                  <div style={{ fontSize: 20, fontWeight: 800, color: kpi.color }}>{kpi.value}</div>
                </div>
              ))}
            </div>
          </div>

          {/* 건강 요약 */}
          <div style={{ background: 'var(--ct-card)', border: '1px solid var(--ct-border)', borderRadius: 12, padding: 20 }}>
            <h2 style={{ fontSize: 14, fontWeight: 800, margin: '0 0 12px' }}>🏥 건강 요약</h2>
            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
              {report.health.diseaseByType.map((d) => (
                <div key={d.type} style={{ padding: '6px 12px', borderRadius: 6, background: 'var(--ct-bg)', fontSize: 12 }}>
                  <span style={{ fontWeight: 600 }}>{d.type}</span>: {d.count}건
                </div>
              ))}
              <div style={{ padding: '6px 12px', borderRadius: 6, background: 'rgba(239,68,68,0.1)', fontSize: 12, color: '#ef4444' }}>
                폐사: {report.health.mortalityCount}건 | 도태: {report.health.cullingCount}건
              </div>
            </div>
          </div>

          {/* 알림 유형별 */}
          <div style={{ background: 'var(--ct-card)', border: '1px solid var(--ct-border)', borderRadius: 12, padding: 20 }}>
            <h2 style={{ fontSize: 14, fontWeight: 800, margin: '0 0 12px' }}>⚠️ 알림 발생 추이</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {report.summary.alertsByType.map((a) => {
                const pct = report.summary.totalAlerts > 0 ? (a.count / report.summary.totalAlerts * 100) : 0;
                return (
                  <div key={a.type} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
                    <span style={{ minWidth: 80, color: 'var(--ct-text-secondary)' }}>{a.label}</span>
                    <div style={{ flex: 1, height: 16, background: 'var(--ct-bg)', borderRadius: 4, overflow: 'hidden' }}>
                      <div style={{ width: `${pct}%`, height: '100%', background: 'var(--ct-primary)', borderRadius: 4, minWidth: 2 }} />
                    </div>
                    <span style={{ fontWeight: 700, minWidth: 40, textAlign: 'right' }}>{a.count}</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* AI 종합 코멘트 */}
          <div style={{ background: 'linear-gradient(135deg, rgba(99,102,241,0.1), rgba(139,92,246,0.1))', border: '1px solid rgba(99,102,241,0.3)', borderRadius: 12, padding: 20 }}>
            <h2 style={{ fontSize: 14, fontWeight: 800, margin: '0 0 8px', color: '#8b5cf6' }}>🤖 AI 종합 코멘트</h2>
            <p style={{ fontSize: 13, lineHeight: 1.8, color: 'var(--ct-text-secondary)', margin: 0 }}>{report.aiComment}</p>
            <div style={{ marginTop: 8, fontSize: 9, color: 'var(--ct-text-muted)', fontStyle: 'italic' }}>
              이 정보는 수의사의 임상적 판단을 보조하기 위한 참고 자료입니다.
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
