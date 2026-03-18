// CowTalk 도입 ROI 계산기

import React from 'react';
import { useQuery } from '@tanstack/react-query';
import * as economicsApi from '@web/api/economics.api';
import { LoadingSkeleton } from '@web/components/common/LoadingSkeleton';

interface Props {
  readonly farmId: string;
}

export function ROICalculator({ farmId }: Props): React.JSX.Element {
  const { data, isLoading } = useQuery({
    queryKey: ['economics', 'roi', farmId],
    queryFn: () => economicsApi.calculateRoi(farmId),
    staleTime: 30 * 60 * 1000,
  });

  if (isLoading) return <LoadingSkeleton lines={4} />;
  if (!data) return <p className="text-xs text-gray-400">ROI 데이터를 계산할 수 없습니다.</p>;

  const items = [
    { label: '발정감지 개선 효과', value: data.estrusDetectionImprovement, desc: '공태기간 단축 → 수익 증가' },
    { label: '질병 조기발견 절감', value: data.diseaseEarlyDetectionSavings, desc: '치료비 절감 + 유량 손실 방지' },
    { label: '폐사율 감소 효과', value: data.mortalityReduction, desc: '개체 손실 방지' },
  ];

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-bold text-gray-900">CowTalk 도입 경제성</h3>

      <div className="space-y-2">
        {items.map((item) => (
          <div key={item.label} className="flex items-center justify-between rounded-md border border-gray-200 bg-white px-4 py-3">
            <div>
              <p className="text-sm font-medium text-gray-800">{item.label}</p>
              <p className="text-xs text-gray-400">{item.desc}</p>
            </div>
            <p className="text-sm font-bold text-green-600">+{item.value.toLocaleString()}원/월</p>
          </div>
        ))}
      </div>

      <div className="rounded-lg bg-gradient-to-r from-blue-600 to-blue-800 p-4 text-white">
        <div className="grid grid-cols-2 gap-4 text-center">
          <div>
            <p className="text-xs text-blue-200">월 예상 절감액</p>
            <p className="text-2xl font-bold">{data.totalMonthlySavings.toLocaleString()}원</p>
          </div>
          <div>
            <p className="text-xs text-blue-200">투자 대비 수익 (ROI)</p>
            <p className="text-2xl font-bold">{data.roiMultiple.toFixed(1)}배</p>
          </div>
        </div>
      </div>

      <p className="text-[10px] text-gray-400">* IFCN 데이터 참고 (ROI 7.8배, 폐사율 -37.5%)</p>
    </div>
  );
}
