// SEIR 확산 시뮬레이션 페이지
// 이동제한 ON/OFF 비교 + 경제 손실 추정

import React, { useState } from 'react';
import { apiPost } from '@web/api/client';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as ChartTooltip,
  Legend, ResponsiveContainer, AreaChart, Area,
} from 'recharts';

// ===========================
// 타입
// ===========================

type LegalDiseaseCode = 'FMD' | 'BRUCELLOSIS' | 'TB' | 'BEF' | 'LSD' | 'ANTHRAX';

interface SEIRDay {
  readonly day: number;
  readonly S: number;
  readonly E: number;
  readonly I: number;
  readonly R: number;
  readonly newInfections: number;
  readonly cumulativeInfections: number;
  readonly activeFarms: number;
  readonly economicLoss: number;
}

interface ScenarioResult {
  readonly label: string;
  readonly movementRestricted: boolean;
  readonly days: readonly SEIRDay[];
  readonly peakDay: number;
  readonly peakInfected: number;
  readonly totalInfected: number;
  readonly totalEconomicLoss: number;
  readonly extinctionDay: number | null;
}

interface SimulationResult {
  readonly diseaseCode: LegalDiseaseCode;
  readonly totalPopulation: number;
  readonly totalFarms: number;
  readonly initialInfected: number;
  readonly scenarios: readonly [ScenarioResult, ScenarioResult];
  readonly simulatedAt: string;
}

// ===========================
// 상수
// ===========================

const DISEASE_LABELS: Record<LegalDiseaseCode, string> = {
  FMD: '구제역 (FMD)',
  BRUCELLOSIS: '브루셀라병',
  TB: '결핵',
  BEF: '유행열',
  LSD: '럼피스킨병',
  ANTHRAX: '탄저',
};

// ===========================
// 컴포넌트
// ===========================

export default function SpreadSimulationPage(): React.JSX.Element {
  const [diseaseCode, setDiseaseCode] = useState<LegalDiseaseCode>('FMD');
  const [totalPopulation, setTotalPopulation] = useState(7143);
  const [totalFarms, setTotalFarms] = useState(146);
  const [initialInfected, setInitialInfected] = useState(1);
  const [simulationDays, setSimulationDays] = useState(60);
  const [result, setResult] = useState<SimulationResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'seir' | 'farms' | 'economy'>('seir');

  const runSimulation = async () => {
    setLoading(true);
    try {
      const data = await apiPost<SimulationResult>('/epidemiology/simulate', {
        diseaseCode,
        totalPopulation,
        totalFarms,
        initialInfected,
        simulationDays,
      });
      setResult(data);
    } catch {
      // error silently
    } finally {
      setLoading(false);
    }
  };

  // 차트 데이터 병합 (이동제한 없음 + 있음)
  const chartData = result
    ? result.scenarios[0].days.map((d, i) => ({
        day: d.day,
        '이동제한없음_I': d.I,
        '이동제한없음_누적': d.cumulativeInfections,
        '이동제한없음_경제': Math.round(d.economicLoss / 1_000_000),
        '이동제한없음_농장': d.activeFarms,
        '이동제한있음_I': result.scenarios[1].days[i]?.I ?? 0,
        '이동제한있음_누적': result.scenarios[1].days[i]?.cumulativeInfections ?? 0,
        '이동제한있음_경제': Math.round((result.scenarios[1].days[i]?.economicLoss ?? 0) / 1_000_000),
        '이동제한있음_농장': result.scenarios[1].days[i]?.activeFarms ?? 0,
      }))
    : [];

  return (
    <div style={{ padding: 20, maxWidth: 1200, margin: '0 auto' }}>
      <h1 style={{ fontSize: 20, fontWeight: 800, margin: '0 0 4px', color: 'var(--ct-text)' }}>
        📊 역학 AI 확산 시뮬레이션
      </h1>
      <p style={{ fontSize: 12, color: 'var(--ct-text-muted)', margin: '0 0 20px' }}>
        SEIR 모델 기반 질병 확산 예측 — 이동제한 효과 비교
      </p>

      {/* 파라미터 패널 */}
      <div style={{ background: 'var(--ct-card)', border: '1px solid var(--ct-border)', borderRadius: 12, padding: 16, marginBottom: 20 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, marginBottom: 16 }}>
          <ParamField label="질병">
            <select
              value={diseaseCode}
              onChange={(e) => setDiseaseCode(e.target.value as LegalDiseaseCode)}
              style={inputStyle}
            >
              {Object.entries(DISEASE_LABELS).map(([code, label]) => (
                <option key={code} value={code}>{label}</option>
              ))}
            </select>
          </ParamField>
          <ParamField label="총 두수">
            <input type="number" value={totalPopulation} onChange={(e) => setTotalPopulation(Number(e.target.value))} style={inputStyle} />
          </ParamField>
          <ParamField label="총 농장 수">
            <input type="number" value={totalFarms} onChange={(e) => setTotalFarms(Number(e.target.value))} style={inputStyle} />
          </ParamField>
          <ParamField label="초기 감염 두수">
            <input type="number" value={initialInfected} min={1} onChange={(e) => setInitialInfected(Number(e.target.value))} style={inputStyle} />
          </ParamField>
          <ParamField label="시뮬레이션 기간(일)">
            <input type="number" value={simulationDays} min={7} max={365} onChange={(e) => setSimulationDays(Number(e.target.value))} style={inputStyle} />
          </ParamField>
        </div>
        <button
          type="button"
          onClick={runSimulation}
          disabled={loading}
          style={{ padding: '10px 24px', borderRadius: 8, background: '#ef4444', color: '#fff', border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 700, opacity: loading ? 0.6 : 1 }}
        >
          {loading ? '시뮬레이션 중...' : '🔬 시뮬레이션 실행'}
        </button>
      </div>

      {/* 결과 */}
      {result && (
        <>
          {/* 시나리오 비교 카드 */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 }}>
            {result.scenarios.map((scenario) => (
              <ScenarioCard key={scenario.label} scenario={scenario} totalPop={result.totalPopulation} />
            ))}
          </div>

          {/* 탭 차트 */}
          <div style={{ background: 'var(--ct-card)', border: '1px solid var(--ct-border)', borderRadius: 12, padding: 16 }}>
            <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
              {(['seir', 'farms', 'economy'] as const).map((tab) => {
                const labels = { seir: '감염 두수', farms: '발병 농장', economy: '경제 손실' };
                return (
                  <button
                    key={tab}
                    type="button"
                    onClick={() => setActiveTab(tab)}
                    style={{
                      padding: '6px 14px', borderRadius: 6, fontSize: 12, cursor: 'pointer',
                      background: activeTab === tab ? 'var(--ct-primary)' : 'var(--ct-bg)',
                      color: activeTab === tab ? '#fff' : 'var(--ct-text)',
                      border: '1px solid var(--ct-border)',
                      fontWeight: activeTab === tab ? 700 : 400,
                    }}
                  >
                    {labels[tab]}
                  </button>
                );
              })}
            </div>

            <ResponsiveContainer width="100%" height={300}>
              {activeTab === 'seir' ? (
                <AreaChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--ct-border)" />
                  <XAxis dataKey="day" fontSize={11} label={{ value: '일', position: 'insideRight', offset: -5 }} />
                  <YAxis fontSize={11} />
                  <ChartTooltip formatter={(v: number) => v.toLocaleString()} />
                  <Legend />
                  <Area type="monotone" dataKey="이동제한없음_I" stroke="#ef4444" fill="#fecaca" fillOpacity={0.4} strokeWidth={2} />
                  <Area type="monotone" dataKey="이동제한있음_I" stroke="#22c55e" fill="#bbf7d0" fillOpacity={0.4} strokeWidth={2} />
                </AreaChart>
              ) : activeTab === 'farms' ? (
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--ct-border)" />
                  <XAxis dataKey="day" fontSize={11} />
                  <YAxis fontSize={11} />
                  <ChartTooltip />
                  <Legend />
                  <Line type="monotone" dataKey="이동제한없음_농장" stroke="#ef4444" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="이동제한있음_농장" stroke="#22c55e" strokeWidth={2} dot={false} />
                </LineChart>
              ) : (
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--ct-border)" />
                  <XAxis dataKey="day" fontSize={11} />
                  <YAxis fontSize={11} tickFormatter={(v) => `${v}M`} />
                  <ChartTooltip formatter={(v: number) => `${v.toLocaleString()}백만원`} />
                  <Legend />
                  <Line type="monotone" dataKey="이동제한없음_경제" stroke="#ef4444" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="이동제한있음_경제" stroke="#22c55e" strokeWidth={2} dot={false} />
                </LineChart>
              )}
            </ResponsiveContainer>
          </div>

          <div style={{ fontSize: 10, color: 'var(--ct-text-muted)', textAlign: 'right', marginTop: 8 }}>
            시뮬레이션: {new Date(result.simulatedAt).toLocaleString('ko-KR')}
          </div>
        </>
      )}
    </div>
  );
}

// ===========================
// 서브 컴포넌트
// ===========================

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '7px 10px', borderRadius: 8, fontSize: 13,
  border: '1px solid var(--ct-border)', background: 'var(--ct-bg)', color: 'var(--ct-text)',
};

function ParamField({ label, children }: { label: string; children: React.ReactNode }): React.JSX.Element {
  return (
    <div>
      <label style={{ fontSize: 11, color: 'var(--ct-text-muted)', display: 'block', marginBottom: 4 }}>{label}</label>
      {children}
    </div>
  );
}

function ScenarioCard({ scenario, totalPop }: { scenario: ScenarioResult; totalPop: number }): React.JSX.Element {
  const isRestricted = scenario.movementRestricted;
  const color = isRestricted ? '#22c55e' : '#ef4444';
  const attackRate = ((scenario.totalInfected / totalPop) * 100).toFixed(1);

  return (
    <div style={{ background: 'var(--ct-card)', border: `2px solid ${color}`, borderRadius: 12, padding: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <h3 style={{ fontSize: 14, fontWeight: 800, margin: 0 }}>{scenario.label}</h3>
        <span style={{ background: color, color: '#fff', padding: '2px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700 }}>
          {isRestricted ? '이동제한' : '미조치'}
        </span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        <MiniStat label="피크 감염일" value={`${scenario.peakDay}일째`} />
        <MiniStat label="피크 감염 두수" value={scenario.peakInfected.toLocaleString()} />
        <MiniStat label="총 감염 두수" value={scenario.totalInfected.toLocaleString()} />
        <MiniStat label="공격률" value={`${attackRate}%`} />
        <MiniStat label="경제 손실" value={`${(scenario.totalEconomicLoss / 100_000_000).toFixed(1)}억`} />
        <MiniStat label="종식 예상" value={scenario.extinctionDay ? `${scenario.extinctionDay}일째` : '미종식'} />
      </div>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }): React.JSX.Element {
  return (
    <div style={{ padding: '6px 8px', borderRadius: 6, background: 'rgba(0,0,0,0.04)' }}>
      <div style={{ fontSize: 9, color: 'var(--ct-text-muted)', marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--ct-text)' }}>{value}</div>
    </div>
  );
}
