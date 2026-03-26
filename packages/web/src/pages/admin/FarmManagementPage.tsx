// 목장현황 관리 대시보드 — /farm-management
// smaXtec 스타일: KPI 5카드 + 상세 테이블 + 센서 클릭 → 소 목록

import React, { useState, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { DataTable, type Column } from '@web/components/data/DataTable';
import { LoadingSkeleton } from '@web/components/common/LoadingSkeleton';
import { FarmFormPanel } from '@web/components/farm/FarmFormPanel';
import { FarmMiniMap } from '@web/components/farm/FarmMiniMap';
import { FarmAnimalDrawer } from '@web/components/farm/FarmAnimalDrawer';
import {
  getFarmSummary,
  getFarmList,
  type FarmRecord,
  type FarmSummaryKpi,
} from '@web/api/farm-management.api';

// ── 상수 ──

type TabId = 'list' | 'map';

const STATUS_LABELS: Readonly<Record<string, string>> = {
  active: '정상 운영',
  inactive: '비활성',
  quarantine: '점검 중',
  suspended: '중단',
};

const STATUS_COLORS: Readonly<Record<string, { bg: string; text: string }>> = {
  active: { bg: 'rgba(34,197,94,0.15)', text: '#22c55e' },
  inactive: { bg: 'rgba(148,163,184,0.15)', text: '#94a3b8' },
  quarantine: { bg: 'rgba(245,158,11,0.15)', text: '#f59e0b' },
  suspended: { bg: 'rgba(239,68,68,0.15)', text: '#ef4444' },
};

const BREED_LABELS: Readonly<Record<string, string>> = {
  holstein: '홀스타인',
  hanwoo: '한우',
  jersey: '저지',
  brown_swiss: '브라운스위스',
  mixed: '혼합',
};

// ── KPI 카드 ──

function SummaryCard({
  label,
  value,
  unit,
  color,
}: {
  readonly label: string;
  readonly value: string | number;
  readonly unit?: string;
  readonly color: string;
}): React.JSX.Element {
  return (
    <div
      className="rounded-xl p-4"
      style={{
        background: 'var(--ct-card)',
        border: '1px solid var(--ct-border)',
        borderTop: `3px solid ${color}`,
      }}
    >
      <p className="text-xs mb-1" style={{ color: 'var(--ct-text-secondary)' }}>{label}</p>
      <p className="text-2xl font-extrabold" style={{ color }}>
        {typeof value === 'number' ? value.toLocaleString() : value}
        {unit && <span className="text-sm font-normal ml-1" style={{ color: 'var(--ct-text-secondary)' }}>{unit}</span>}
      </p>
    </div>
  );
}

// ── 메인 페이지 ──

export default function FarmManagementPage(): React.JSX.Element {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<TabId>('list');
  const [statusFilter, setStatusFilter] = useState('all');
  const [breedFilter, setBreedFilter] = useState('all');
  const [showForm, setShowForm] = useState(false);
  const [editFarm, setEditFarm] = useState<FarmRecord | null>(null);
  // 소 목록 드로어
  const [drawerFarm, setDrawerFarm] = useState<{ farmId: string; farmName: string } | null>(null);

  // 데이터 로딩
  const { data: summaryData, isLoading: summaryLoading } = useQuery({
    queryKey: ['farm-management', 'summary'],
    queryFn: getFarmSummary,
    staleTime: 60 * 1000,
  });

  const { data: listData, isLoading: listLoading } = useQuery({
    queryKey: ['farm-management', 'list', statusFilter],
    queryFn: () => getFarmList(statusFilter !== 'all' ? { status: statusFilter } : undefined),
    staleTime: 60 * 1000,
  });

  const summary: FarmSummaryKpi = summaryData ?? {
    totalFarms: 0,
    totalHeadCount: 0,
    activeFarms: 0,
    inactiveFarms: 0,
    tracedAnimalCount: 0,
    sensorAnimalCount: 0,
    avgOperationRate: 0,
  };

  const farmList = useMemo(() => {
    const list = (listData ?? []) as readonly FarmRecord[];
    if (breedFilter === 'all') return list;
    return list.filter((f) => (f.primaryBreed ?? '').toLowerCase().includes(breedFilter));
  }, [listData, breedFilter]);

  const handleRowClick = useCallback((row: Record<string, unknown>) => {
    navigate(`/cow/${String(row.farmId)}`);
  }, [navigate]);

  const handleEditClick = useCallback((farm: FarmRecord) => {
    setEditFarm(farm);
    setShowForm(true);
  }, []);

  const handleSensorClick = useCallback((farm: FarmRecord) => {
    setDrawerFarm({ farmId: farm.farmId, farmName: farm.name });
  }, []);

  // 테이블 컬럼 — 디자인 목업 기준
  const farmColumns = useMemo((): readonly Column<Record<string, unknown>>[] => [
    {
      key: 'name',
      label: '목장명',
      sortable: true,
      render: (row) => (
        <span style={{ color: '#22c55e', fontWeight: 700, cursor: 'pointer' }}>
          {String(row.name)}
        </span>
      ),
    },
    { key: 'ownerName', label: '대표자', sortable: true },
    {
      key: 'region',
      label: '지역',
      sortable: true,
      render: (row) => {
        const p = String(row.regionProvince ?? '');
        const d = String(row.regionDistrict ?? '');
        return p ? `${p} ${d}` : '-';
      },
    },
    {
      key: 'primaryBreed',
      label: '품종',
      sortable: true,
      render: (row) => {
        const breed = String(row.primaryBreed ?? '-');
        return BREED_LABELS[breed.toLowerCase()] ?? breed;
      },
    },
    {
      key: 'currentHeadCount',
      label: '두수',
      sortable: true,
      render: (row) => <strong>{String(row.currentHeadCount ?? 0)}</strong>,
    },
    {
      key: 'sensorCount',
      label: '센서',
      sortable: true,
      render: (row) => {
        const sensorCount = Number(row.sensorCount ?? 0);
        return (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              handleSensorClick(row as unknown as FarmRecord);
            }}
            style={{
              background: 'none',
              border: 'none',
              color: sensorCount > 0 ? '#3b82f6' : 'var(--ct-text-muted)',
              fontWeight: 700,
              cursor: sensorCount > 0 ? 'pointer' : 'default',
              textDecoration: sensorCount > 0 ? 'underline' : 'none',
              padding: 0,
            }}
            title={sensorCount > 0 ? '클릭하여 소 목록 보기' : '센서 없음'}
          >
            {sensorCount}
          </button>
        );
      },
    },
    {
      key: 'operationRate',
      label: '가동률',
      sortable: true,
      render: (row) => {
        const head = Number(row.currentHeadCount ?? 0);
        const sensor = Number(row.sensorCount ?? 0);
        const rate = head > 0 ? ((sensor / head) * 100) : 0;
        const color = rate >= 90 ? '#22c55e' : rate >= 70 ? '#f59e0b' : '#ef4444';
        return <span style={{ color, fontWeight: 600 }}>{rate.toFixed(1)}%</span>;
      },
    },
    {
      key: 'status',
      label: '상태',
      sortable: true,
      render: (row) => {
        const s = String(row.status);
        const style = STATUS_COLORS[s] ?? { bg: 'rgba(148,163,184,0.15)', text: '#94a3b8' };
        return (
          <span style={{
            background: style.bg,
            color: style.text,
            padding: '3px 10px',
            borderRadius: 6,
            fontSize: 12,
            fontWeight: 600,
          }}>
            {STATUS_LABELS[s] ?? s}
          </span>
        );
      },
    },
    {
      key: 'actions',
      label: '관리',
      width: '80px',
      render: (row) => (
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              handleEditClick(row as unknown as FarmRecord);
            }}
            style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid var(--ct-border)', borderRadius: 6, padding: '4px 10px', color: 'var(--ct-text-secondary)', cursor: 'pointer', fontSize: 11 }}
          >
            수정
          </button>
        </div>
      ),
    },
  ], [handleEditClick, handleSensorClick]);

  if (summaryLoading && listLoading) return <LoadingSkeleton lines={8} />;

  return (
    <div className="space-y-6 pb-24">
      {/* 헤더 */}
      <div
        className="flex items-center justify-between flex-wrap gap-3 p-4 rounded-xl"
        style={{ background: 'var(--ct-card)', border: '1px solid var(--ct-border)' }}
      >
        <div className="flex items-center gap-3">
          <div style={{
            width: 40, height: 40, borderRadius: 10,
            background: 'rgba(34,197,94,0.15)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 20,
          }}>🏠</div>
          <div>
            <h1 className="text-lg font-bold" style={{ color: 'var(--ct-text)' }}>
              CowTalk — 목장 현황 관리
            </h1>
            <p className="text-xs" style={{ color: 'var(--ct-text-muted)' }}>
              등록·수정·조회 통합 대시보드
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => { setEditFarm(null); setShowForm(true); }}
          className="rounded-lg px-4 py-2 text-sm font-semibold text-white"
          style={{ background: 'linear-gradient(135deg, #10b981, #059669)' }}
        >
          + 목장 신규 등록
        </button>
      </div>

      {/* KPI 5카드 */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <SummaryCard label="등록 목장" value={summary.totalFarms} unit="개소" color="#3b82f6" />
        <SummaryCard label="정상운영" value={summary.activeFarms} unit="개소" color="#22c55e" />
        <SummaryCard label="총 두수" value={summary.totalHeadCount} unit="두" color="#10b981" />
        <SummaryCard label="설치 센서" value={summary.sensorAnimalCount} unit="개" color="#f59e0b" />
        <SummaryCard label="평균 가동률" value={`${summary.avgOperationRate}%`} color="#8b5cf6" />
      </div>

      {/* 폼 패널 */}
      {showForm && (
        <FarmFormPanel
          editFarm={editFarm}
          onClose={() => { setShowForm(false); setEditFarm(null); }}
          onSaved={() => { setShowForm(false); setEditFarm(null); }}
        />
      )}

      {/* 필터 바 */}
      <div
        className="flex items-center gap-3 flex-wrap p-4 rounded-xl"
        style={{ background: 'var(--ct-card)', border: '1px solid var(--ct-border)' }}
      >
        {/* 탭 */}
        <div className="flex rounded-lg overflow-hidden" style={{ border: '1px solid var(--ct-border)' }}>
          {(['list', 'map'] as const).map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setActiveTab(tab)}
              className="px-4 py-2 text-sm font-medium transition-colors"
              style={{
                background: activeTab === tab ? '#10b981' : 'transparent',
                color: activeTab === tab ? '#fff' : 'var(--ct-text-secondary)',
              }}
            >
              {tab === 'list' ? '목록' : '지도'}
            </button>
          ))}
        </div>

        {/* 상태 필터 */}
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="rounded-lg border px-3 py-2 text-sm"
          style={{ background: 'var(--ct-bg)', borderColor: 'var(--ct-border)', color: 'var(--ct-text)' }}
          aria-label="상태 필터"
        >
          <option value="all">전체 상태</option>
          <option value="active">정상 운영</option>
          <option value="inactive">비활성</option>
          <option value="quarantine">점검 중</option>
          <option value="suspended">중단</option>
        </select>

        {/* 품종 필터 */}
        <select
          value={breedFilter}
          onChange={(e) => setBreedFilter(e.target.value)}
          className="rounded-lg border px-3 py-2 text-sm"
          style={{ background: 'var(--ct-bg)', borderColor: 'var(--ct-border)', color: 'var(--ct-text)' }}
          aria-label="품종 필터"
        >
          <option value="all">전체 유형</option>
          <option value="holstein">홀스타인</option>
          <option value="hanwoo">한우</option>
          <option value="jersey">저지</option>
        </select>

        {/* 결과 수 */}
        <span className="text-xs ml-auto" style={{ color: 'var(--ct-text-muted)' }}>
          {farmList.length}/{summary.totalFarms}개소 표시
        </span>
      </div>

      {/* 콘텐츠 */}
      {activeTab === 'list' ? (
        <DataTable
          columns={farmColumns}
          data={farmList as unknown as readonly Record<string, unknown>[]}
          keyField="farmId"
          onRowClick={handleRowClick}
          pageSize={20}
          searchPlaceholder="목장명·대표자·지역 검색..."
          searchField="name"
        />
      ) : (
        <FarmMiniMap
          farms={farmList}
          onFarmClick={(farmId) => navigate(`/farm/${farmId}/groups`)}
        />
      )}

      {/* 소 목록 드로어 */}
      {drawerFarm && (
        <FarmAnimalDrawer
          farmId={drawerFarm.farmId}
          farmName={drawerFarm.farmName}
          onClose={() => setDrawerFarm(null)}
          onAnimalClick={(animalId) => {
            setDrawerFarm(null);
            navigate(`/cow/${animalId}`);
          }}
        />
      )}
    </div>
  );
}
