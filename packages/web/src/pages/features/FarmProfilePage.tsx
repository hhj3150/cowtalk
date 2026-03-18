// 농장 프로필 페이지 — 학습이력 + 유사농장 + 성적표

import React from 'react';
import { useFarmStore } from '@web/stores/farm.store';
import { FarmLearningProfile } from '@web/components/farm/FarmLearningProfile';
import { SimilarFarmRecommendation } from '@web/components/farm/SimilarFarmRecommendation';
import { FarmReportCard } from '@web/components/farm/FarmReportCard';
import { EmptyState } from '@web/components/common/EmptyState';

export default function FarmProfilePage(): React.JSX.Element {
  const farmId = useFarmStore((s) => s.selectedFarmId);

  if (!farmId) {
    return (
      <div className="space-y-6">
        <h1 className="text-xl font-bold text-gray-900">농장 프로필</h1>
        <EmptyState message="농장을 선택해 주세요." />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold text-gray-900">농장 프로필</h1>

      <div className="rounded-lg border border-gray-200 bg-white p-4">
        <h2 className="mb-3 text-sm font-semibold text-gray-800">AI 학습 이력</h2>
        <FarmLearningProfile farmId={farmId} />
      </div>

      <div className="rounded-lg border border-gray-200 bg-white p-4">
        <h2 className="mb-3 text-sm font-semibold text-gray-800">분기 성적표</h2>
        <FarmReportCard farmId={farmId} />
      </div>

      <div className="rounded-lg border border-gray-200 bg-white p-4">
        <h2 className="mb-3 text-sm font-semibold text-gray-800">유사 농장 비교</h2>
        <SimilarFarmRecommendation farmId={farmId} />
      </div>
    </div>
  );
}
