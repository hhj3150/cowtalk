// 역학 조사 워크플로우
// 6항목 자동 수집 → 보고서 폼 → KAHIS 상태 관리

import React, { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useParams, useNavigate } from 'react-router-dom';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { apiGet, apiPost, apiPatch } from '@web/api/client';

// ===========================
// 타입
// ===========================

type InvestigationStatus = 'draft' | 'pending_submit' | 'kahis_submitted';

interface FeverAnimalDetail {
  animalId: string;
  earTag: string;
  name: string | null;
  currentTemp: number | null;
  feverStartAt: string | null;
  dsiScore: number;
  tempHistory: { ts: string; value: number }[];
}

interface InvestigationData {
  investigationId: string;
  farmId: string;
  farm: {
    name: string;
    address: string;
    ownerName: string | null;
    phone: string | null;
    lat: number;
    lng: number;
    currentHeadCount: number;
  };
  feverAnimals: FeverAnimalDetail[];
  radiusSummary: {
    zone500m: { farmCount: number; headCount: number };
    zone1km: { farmCount: number; headCount: number };
    zone3km: { farmCount: number; headCount: number };
  };
  contactNetwork: { nodeCount: number; edgeCount: number; directContacts: number };
  weather: { temperature: number | null; windDeg: number | null; windSpeed: number | null; description: string };
  nearbyAbnormalFarms: number;
  status: InvestigationStatus;
  fieldObservations: string;
  createdAt: string;
  updatedAt: string;
}

// ===========================
// API
// ===========================

async function startInvestigation(farmId: string): Promise<InvestigationData> {
  return apiPost<InvestigationData>(`/investigation/start/${farmId}`);
}

async function fetchInvestigation(id: string): Promise<InvestigationData> {
  return apiGet<InvestigationData>(`/investigation/${id}`);
}

async function updateInvestigation(id: string, patch: { fieldObservations?: string; status?: InvestigationStatus }): Promise<InvestigationData> {
  return apiPatch<InvestigationData>(`/investigation/${id}`, patch);
}

// ===========================
// 상태 배지
// ===========================

const STATUS_CONFIG: Record<InvestigationStatus, { label: string; color: string }> = {
  draft: { label: '작성 중', color: 'bg-slate-100 text-slate-700' },
  pending_submit: { label: '제출 대기', color: 'bg-yellow-100 text-yellow-700' },
  kahis_submitted: { label: 'KAHIS 제출 완료', color: 'bg-green-100 text-green-700' },
};

// ===========================
// 수집 항목 카드
// ===========================

interface CollectionCardProps {
  number: number;
  title: string;
  content: React.ReactNode;
}

function CollectionCard({ number, title, content }: CollectionCardProps): React.JSX.Element {
  return (
    <div
      className="rounded-xl border p-4"
      style={{ background: 'var(--ct-card)', borderColor: 'var(--ct-border)' }}
    >
      <div className="flex items-center gap-2 mb-3">
        <span
          className="flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold text-white"
          style={{ background: 'var(--ct-primary)' }}
        >
          {number}
        </span>
        <h3 className="text-sm font-semibold" style={{ color: 'var(--ct-text)' }}>{title}</h3>
      </div>
      {content}
    </div>
  );
}

// ===========================
// 메인 컴포넌트
// ===========================

export default function InvestigationWorkflow(): React.JSX.Element {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  // farmId 파라미터로 신규 조사 시작
  const farmId = new URLSearchParams(location.search).get('farmId') ?? '';

  const [investigationId, setInvestigationId] = useState<string>(id ?? '');
  const [fieldObservations, setFieldObservations] = useState('');
  const [isStarting, setIsStarting] = useState(false);
  const [selectedAnimal, setSelectedAnimal] = useState<string | null>(null);

  // 기존 조사 조회
  const { data, isLoading, refetch } = useQuery({
    queryKey: ['investigation', investigationId],
    queryFn: () => fetchInvestigation(investigationId),
    enabled: !!investigationId,
  });

  // 조사 저장 mutation
  const saveMutation = useMutation({
    mutationFn: (patch: { fieldObservations?: string; status?: InvestigationStatus }) =>
      updateInvestigation(investigationId, patch),
    onSuccess: () => void refetch(),
  });

  // 조사 시작
  const handleStart = async (): Promise<void> => {
    if (!farmId) return;
    setIsStarting(true);
    try {
      const result = await startInvestigation(farmId);
      setInvestigationId(result.investigationId);
      setFieldObservations(result.fieldObservations);
      navigate(`/epidemiology/investigation/${result.investigationId}`, { replace: true });
    } finally {
      setIsStarting(false);
    }
  };

  // 조사 시작 전 화면
  if (!investigationId && farmId) {
    return (
      <div className="max-w-lg mx-auto mt-12 text-center space-y-4">
        <span className="text-4xl">🔬</span>
        <h1 className="text-xl font-bold" style={{ color: 'var(--ct-text)' }}>역학 조사 시작</h1>
        <p className="text-sm" style={{ color: 'var(--ct-text-secondary)' }}>
          6가지 역학 정보를 자동으로 수집합니다:<br />
          발생 농장 정보 · 발열 개체 상세 · 반경별 농장 현황 ·
          이동 네트워크 · 기상 데이터 · 주변 이상 여부
        </p>
        <button
          onClick={() => void handleStart()}
          disabled={isStarting}
          className="rounded-xl px-8 py-3 font-semibold text-white transition-opacity disabled:opacity-50"
          style={{ background: 'var(--ct-primary)' }}
        >
          {isStarting ? '⏳ 데이터 수집 중...' : '🚀 역학 조사 시작'}
        </button>
      </div>
    );
  }

  if (!investigationId) {
    return (
      <div className="max-w-lg mx-auto mt-12 text-center space-y-4">
        <span className="text-4xl">⚠️</span>
        <h1 className="text-lg font-bold" style={{ color: 'var(--ct-text)' }}>농장 ID가 필요합니다</h1>
        <p className="text-sm" style={{ color: 'var(--ct-text-secondary)' }}>
          반경 분석 페이지에서 농장을 선택하여 역학 조사를 시작하세요.
        </p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-48 rounded animate-pulse" style={{ background: 'var(--ct-border)' }} />
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-40 rounded-xl animate-pulse" style={{ background: 'var(--ct-border)' }} />
        ))}
      </div>
    );
  }

  if (!data) {
    return <p style={{ color: 'var(--ct-text-secondary)' }}>조사 기록을 찾을 수 없습니다.</p>;
  }

  const statusCfg = STATUS_CONFIG[data.status];
  const selectedAnimalData = data.feverAnimals.find((a) => a.animalId === selectedAnimal);

  return (
    <div className="space-y-6">
      {/* 헤더 */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold" style={{ color: 'var(--ct-text)' }}>
            🔬 역학 조사 보고서
          </h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--ct-text-secondary)' }}>
            {data.farm.name} — {new Date(data.createdAt).toLocaleDateString('ko')}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className={`rounded-full px-3 py-1 text-xs font-semibold ${statusCfg.color}`}>
            {statusCfg.label}
          </span>
        </div>
      </div>

      {/* 자동 수집 6항목 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

        {/* 1. 발생 농장 기본 정보 */}
        <CollectionCard
          number={1}
          title="발생 농장 기본 정보"
          content={
            <div className="space-y-1.5 text-sm">
              {[
                ['농장명', data.farm.name],
                ['주소', data.farm.address],
                ['농장주', data.farm.ownerName ?? '미등록'],
                ['연락처', data.farm.phone ?? '미등록'],
                ['사육 두수', `${data.farm.currentHeadCount}두`],
              ].map(([k, v]) => (
                <div key={k} className="flex gap-2">
                  <span className="text-xs font-medium w-16 shrink-0" style={{ color: 'var(--ct-text-secondary)' }}>{k}</span>
                  <span className="text-xs" style={{ color: 'var(--ct-text)' }}>{v}</span>
                </div>
              ))}
            </div>
          }
        />

        {/* 2. 발열 개체 상세 */}
        <CollectionCard
          number={2}
          title={`발열 개체 상세 (${data.feverAnimals.length}두)`}
          content={
            <div>
              <div className="space-y-1.5 max-h-32 overflow-y-auto">
                {data.feverAnimals.map((a) => (
                  <button
                    key={a.animalId}
                    onClick={() => setSelectedAnimal(a.animalId === selectedAnimal ? null : a.animalId)}
                    className={`w-full flex items-center justify-between rounded-lg px-3 py-2 text-left transition-colors ${
                      a.animalId === selectedAnimal ? 'ring-2 ring-red-400' : ''
                    }`}
                    style={{ background: 'var(--ct-bg)' }}
                  >
                    <div>
                      <span className="text-xs font-medium" style={{ color: 'var(--ct-text)' }}>{a.earTag}</span>
                      {a.name && <span className="text-xs ml-1" style={{ color: 'var(--ct-text-secondary)' }}>({a.name})</span>}
                    </div>
                    <div className="text-right">
                      <span className="text-xs font-bold text-red-600">{a.currentTemp?.toFixed(1)}°C</span>
                      <span className="text-xs ml-2 px-1.5 py-0.5 rounded" style={{ background: 'var(--ct-border)', color: 'var(--ct-text-secondary)' }}>
                        DSI {a.dsiScore}
                      </span>
                    </div>
                  </button>
                ))}
                {data.feverAnimals.length === 0 && (
                  <p className="text-xs" style={{ color: 'var(--ct-text-secondary)' }}>발열 개체 없음</p>
                )}
              </div>

              {/* 선택 개체 체온 추이 */}
              {selectedAnimalData && selectedAnimalData.tempHistory.length > 0 && (
                <div className="mt-3">
                  <p className="text-xs font-medium mb-1" style={{ color: 'var(--ct-text-secondary)' }}>
                    {selectedAnimalData.earTag} 체온 추이
                  </p>
                  <ResponsiveContainer width="100%" height={100}>
                    <LineChart
                      data={selectedAnimalData.tempHistory.map((t) => ({
                        time: new Date(t.ts).getHours() + '시',
                        temp: t.value,
                      }))}
                    >
                      <XAxis dataKey="time" tick={{ fontSize: 9 }} />
                      <YAxis domain={['auto', 'auto']} tick={{ fontSize: 9 }} />
                      <Tooltip />
                      <Line type="monotone" dataKey="temp" stroke="#ef4444" dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>
          }
        />

        {/* 3. 반경별 인근 농장 현황 */}
        <CollectionCard
          number={3}
          title="반경별 인근 농장 현황"
          content={
            <div className="space-y-2">
              {[
                { label: '500m 이내', data: data.radiusSummary.zone500m },
                { label: '1km 이내', data: data.radiusSummary.zone1km },
                { label: '3km 이내', data: data.radiusSummary.zone3km },
              ].map(({ label, data: zone }) => (
                <div key={label} className="flex items-center justify-between rounded-lg px-3 py-2" style={{ background: 'var(--ct-bg)' }}>
                  <span className="text-xs font-medium" style={{ color: 'var(--ct-text)' }}>{label}</span>
                  <span className="text-xs" style={{ color: 'var(--ct-text-secondary)' }}>
                    {zone.farmCount}농장 · {zone.headCount}두
                  </span>
                </div>
              ))}
              <p className="text-xs mt-1 text-orange-600">
                🏚️ 주변 이상 농장: {data.nearbyAbnormalFarms}건
              </p>
            </div>
          }
        />

        {/* 4. 이동 네트워크 */}
        <CollectionCard
          number={4}
          title="최근 30일 개체 이동 네트워크"
          content={
            <div className="space-y-2">
              {[
                ['연결 농장 수', `${data.contactNetwork.nodeCount}개`],
                ['이동 이력 수', `${data.contactNetwork.edgeCount}건`],
                ['직접 접촉 농장', `${data.contactNetwork.directContacts}개`],
              ].map(([k, v]) => (
                <div key={k} className="flex items-center justify-between rounded-lg px-3 py-2" style={{ background: 'var(--ct-bg)' }}>
                  <span className="text-xs" style={{ color: 'var(--ct-text-secondary)' }}>{k}</span>
                  <span className="text-xs font-bold" style={{ color: 'var(--ct-text)' }}>{v}</span>
                </div>
              ))}
            </div>
          }
        />

        {/* 5. 기상 데이터 */}
        <CollectionCard
          number={5}
          title="기상 데이터"
          content={
            <div className="space-y-1.5">
              {[
                ['현재 기온', `${data.weather.temperature ?? '—'}°C`],
                ['풍향', data.weather.windDeg != null ? `${data.weather.windDeg}°` : '—'],
                ['풍속', data.weather.windSpeed != null ? `${data.weather.windSpeed}m/s` : '—'],
                ['상태', data.weather.description],
              ].map(([k, v]) => (
                <div key={k} className="flex gap-2">
                  <span className="text-xs font-medium w-16 shrink-0" style={{ color: 'var(--ct-text-secondary)' }}>{k}</span>
                  <span className="text-xs" style={{ color: 'var(--ct-text)' }}>{v}</span>
                </div>
              ))}
            </div>
          }
        />

        {/* 6. 주변 농장 체온 이상 */}
        <CollectionCard
          number={6}
          title="주변 농장 체온 이상 여부"
          content={
            <div className="flex items-center gap-3 p-3 rounded-lg" style={{ background: 'var(--ct-bg)' }}>
              <span className="text-3xl">{data.nearbyAbnormalFarms > 0 ? '⚠️' : '✅'}</span>
              <div>
                <p className="text-sm font-semibold" style={{ color: 'var(--ct-text)' }}>
                  {data.nearbyAbnormalFarms > 0
                    ? `${data.nearbyAbnormalFarms}개 농장 이상 감지`
                    : '주변 농장 이상 없음'}
                </p>
                <p className="text-xs" style={{ color: 'var(--ct-text-secondary)' }}>3km 반경 기준</p>
              </div>
            </div>
          }
        />
      </div>

      {/* 현장 소견 입력 */}
      <div
        className="rounded-xl border p-4"
        style={{ background: 'var(--ct-card)', borderColor: 'var(--ct-border)' }}
      >
        <h3 className="text-sm font-semibold mb-2" style={{ color: 'var(--ct-text)' }}>
          📝 방역관 현장 소견
        </h3>
        <textarea
          className="w-full rounded-lg border px-3 py-2 text-sm resize-none"
          style={{
            background: 'var(--ct-bg)',
            borderColor: 'var(--ct-border)',
            color: 'var(--ct-text)',
            minHeight: '120px',
          }}
          placeholder="현장 관찰 내용, 임상 증상, 기타 특이사항을 입력하세요..."
          value={fieldObservations || data.fieldObservations}
          onChange={(e) => setFieldObservations(e.target.value)}
        />
      </div>

      {/* 버튼 */}
      <div className="flex flex-wrap gap-3 justify-end">
        <button
          onClick={() => saveMutation.mutate({ fieldObservations })}
          disabled={saveMutation.isPending}
          className="rounded-xl px-5 py-2.5 text-sm font-semibold border"
          style={{ borderColor: 'var(--ct-border)', color: 'var(--ct-text)' }}
        >
          💾 임시 저장
        </button>
        {data.status === 'draft' && (
          <button
            onClick={() => saveMutation.mutate({ fieldObservations, status: 'pending_submit' })}
            disabled={saveMutation.isPending}
            className="rounded-xl px-5 py-2.5 text-sm font-semibold text-white"
            style={{ background: '#f97316' }}
          >
            📋 제출 대기로 변경
          </button>
        )}
        {data.status === 'pending_submit' && (
          <button
            onClick={() => saveMutation.mutate({ fieldObservations, status: 'kahis_submitted' })}
            disabled={saveMutation.isPending}
            className="rounded-xl px-5 py-2.5 text-sm font-semibold text-white"
            style={{ background: 'var(--ct-primary)' }}
          >
            🏛️ KAHIS 제출 완료
          </button>
        )}
        <button
          onClick={() => {
            const printWindow = window.open('', '_blank');
            if (printWindow) {
              printWindow.document.write(`<pre>${JSON.stringify(data, null, 2)}</pre>`);
              printWindow.print();
            }
          }}
          className="rounded-xl px-5 py-2.5 text-sm font-semibold border"
          style={{ borderColor: 'var(--ct-border)', color: 'var(--ct-text)' }}
        >
          🖨️ 인쇄/PDF
        </button>
      </div>
    </div>
  );
}
