// 비유곡선 API (젖소 전용)

import { apiGet } from './client';

export interface LactationDataPoint {
  readonly dim: number;
  readonly actualYield: number | null;
  readonly predictedYield: number;
  readonly date: string | null;
}

export interface LactationCurve {
  readonly animalId: string;
  readonly currentDim: number;
  readonly currentParity: number;
  readonly peakYieldDim: number;
  readonly peakYieldKg: number;
  readonly recommendedDryOffDim: number;
  readonly optimalBreedingDim: number;
  readonly totalExpectedYield: number;
  readonly data: readonly LactationDataPoint[];
  readonly previousParityData: readonly LactationDataPoint[] | null;
  readonly economicEstimate: {
    readonly totalExpectedRevenue: number;
    readonly milkPricePerKg: number;
    readonly qualityPremium: number;
  };
}

export function getLactationCurve(animalId: string): Promise<LactationCurve> {
  return apiGet<LactationCurve>(`/lactation/${animalId}`);
}
