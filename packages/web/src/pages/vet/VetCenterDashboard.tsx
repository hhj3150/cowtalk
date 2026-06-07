// /vet — 수의사 진료센터 대시보드 (1단계)
import React from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { vetApi } from '@web/api/vet.api';
import { VetCard } from './vet-ui';

export default function VetCenterDashboard(): React.JSX.Element {
  const { data: farms, isLoading } = useQuery({
    queryKey: ['vet', 'farms'],
    queryFn: () => vetApi.listFarms(),
  });

  const farmCount = farms?.length ?? 0;

  return (
    <div className="mx-auto max-w-3xl space-y-4 p-1">
      <header className="space-y-1">
        <h1 className="text-xl font-bold" style={{ color: 'var(--ct-text)' }}>수의사 진료센터</h1>
        <p className="text-sm" style={{ color: 'var(--ct-text-secondary)' }}>
          목장 현장에서 소 옆에서 바로 쓰는 대동물 수의사 진료 시스템
        </p>
      </header>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Kpi label="접근 가능 목장" value={isLoading ? '…' : String(farmCount)} />
        <Kpi label="오늘 진료" value="—" />
        <Kpi label="미전송 문서" value="—" />
        <Kpi label="동기화 대기" value="—" />
      </div>

      <VetCard>
        <h2 className="mb-3 text-sm font-bold" style={{ color: 'var(--ct-text)' }}>빠른 시작</h2>
        <div className="flex flex-wrap gap-2">
          <Link
            to="/vet/farms"
            className="min-h-[44px] rounded-lg px-4 py-2 text-sm font-semibold"
            style={{ background: 'var(--ct-primary, #7c3aed)', color: '#fff' }}
          >
            목장 진료 접근 →
          </Link>
        </div>
      </VetCard>

      <VetCard>
        <h2 className="mb-2 text-sm font-bold" style={{ color: 'var(--ct-text)' }}>곧 추가될 기능</h2>
        <ul className="space-y-1 text-sm" style={{ color: 'var(--ct-text-secondary)' }}>
          <li>· 대화형 현장 진료기록 (2단계)</li>
          <li>· 진료기록 수정·이력관리 (3단계)</li>
          <li>· 진료기록부·처방전·진단서 PDF 발행 (4~6단계)</li>
          <li>· 문서 보내기·프린트 (5단계)</li>
          <li>· 상위 데이터베이스 연동 (8단계)</li>
        </ul>
      </VetCard>
    </div>
  );
}

function Kpi({ label, value }: { label: string; value: string }): React.JSX.Element {
  return (
    <VetCard className="flex flex-col justify-between">
      <span className="text-xs" style={{ color: 'var(--ct-text-secondary)' }}>{label}</span>
      <span className="text-2xl font-bold" style={{ color: 'var(--ct-text)' }}>{value}</span>
    </VetCard>
  );
}
