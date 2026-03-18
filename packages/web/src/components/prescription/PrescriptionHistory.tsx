// 처방 이력 + PDF 다운로드

import React from 'react';
import { useQuery } from '@tanstack/react-query';
import * as prescriptionApi from '@web/api/prescription.api';
import { Badge } from '@web/components/common/Badge';
import { LoadingSkeleton } from '@web/components/common/LoadingSkeleton';

interface Props {
  readonly animalId: string;
}

export function PrescriptionHistory({ animalId }: Props): React.JSX.Element {
  const { data, isLoading } = useQuery({
    queryKey: ['prescriptions', animalId],
    queryFn: () => prescriptionApi.getPrescriptionsByAnimal(animalId),
    staleTime: 5 * 60 * 1000,
  });

  if (isLoading) return <LoadingSkeleton lines={3} />;
  if (!data?.length) return <p className="text-xs text-gray-400">처방 이력이 없습니다.</p>;

  return (
    <div className="space-y-3">
      {data.map((rx) => (
        <div key={rx.prescriptionId} className="rounded-md border border-gray-200 bg-white p-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-800">{rx.diagnosis}</p>
              <p className="text-xs text-gray-400">{rx.vetName} · {rx.createdAt}</p>
            </div>
            <a
              href={prescriptionApi.getPrescriptionPdfUrl(rx.prescriptionId)}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded bg-gray-100 px-2 py-1 text-xs text-gray-600 hover:bg-gray-200"
            >
              PDF
            </a>
          </div>
          <div className="mt-2 space-y-1">
            {rx.drugs.map((drug) => (
              <div key={drug.drugId} className="flex items-center justify-between text-xs">
                <span className="text-gray-600">{drug.drugName} {drug.dosage}{drug.unit} {drug.route}</span>
                <div className="flex gap-2">
                  <span className="text-gray-400">{drug.durationDays}일</span>
                  {drug.withdrawalMilkUntil && (
                    <Badge label={`우유출하: ${drug.withdrawalMilkUntil}`} variant="medium" />
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
