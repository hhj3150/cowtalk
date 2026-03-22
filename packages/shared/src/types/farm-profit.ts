// 농장 수익성 대시보드 타입 정의

export interface CostBreakdownItem {
  readonly category: 'feed' | 'vet' | 'breeding' | 'labor' | 'facility' | 'other';
  readonly label: string;
  readonly amount: number;
  readonly percentOfTotal: number;
  readonly trend: 'up' | 'stable' | 'down';
  readonly changePercent: number;
}

export interface RevenueBreakdownItem {
  readonly category: 'milk' | 'calves' | 'subsidies' | 'cull_sales' | 'other';
  readonly label: string;
  readonly amount: number;
  readonly percentOfTotal: number;
}

export interface MonthlyProfitTrend {
  readonly month: string; // YYYY-MM
  readonly revenue: number;
  readonly costs: number;
  readonly profit: number;
  readonly profitMargin: number;
}

export interface PerHeadMetric {
  readonly animalId: string;
  readonly earTag: string;
  readonly estimatedDailyCost: number;
  readonly healthCostContribution: number;
  readonly breedingStatus: string;
  readonly milkYieldKg: number;
  readonly profitability: 'profitable' | 'breakeven' | 'loss';
}

export interface ProfitInsight {
  readonly id: string;
  readonly category: 'feed' | 'health' | 'breeding' | 'management';
  readonly severity: 'critical' | 'high' | 'medium' | 'low';
  readonly title: string;
  readonly description: string;
  readonly estimatedSavings: number; // KRW
  readonly actionRequired: string;
}

export interface FarmProfitSummary {
  readonly totalRevenue: number;
  readonly totalCosts: number;
  readonly netProfit: number;
  readonly profitMargin: number;
  readonly profitPerHead: number;
  readonly costPerHead: number;
  readonly revenuePerHead: number;
  readonly headCount: number;
}

export interface FarmProfitData {
  readonly farmId: string;
  readonly farmName: string;
  readonly period: string; // YYYY-MM
  readonly dataSource: 'actual' | 'simulated' | 'mixed';
  readonly summary: FarmProfitSummary;
  readonly costBreakdown: readonly CostBreakdownItem[];
  readonly revenueBreakdown: readonly RevenueBreakdownItem[];
  readonly monthlyTrend: readonly MonthlyProfitTrend[];
  readonly topLossAnimals: readonly PerHeadMetric[];
  readonly topProfitAnimals: readonly PerHeadMetric[];
  readonly insights: readonly ProfitInsight[];
  readonly lastUpdated: string;
}

// ── 농장 수익성 입력 데이터 ──

export interface FarmProfitEntryInput {
  readonly farmId: string;
  readonly period: string; // YYYY-MM
  // 수입 (KRW, 정수)
  readonly revenueMilk: number;
  readonly revenueCalves: number;
  readonly revenueSubsidies: number;
  readonly revenueCullSales: number;
  readonly revenueOther: number;
  // 지출 (KRW, 정수)
  readonly costFeed: number;
  readonly costVet: number;
  readonly costBreeding: number;
  readonly costLabor: number;
  readonly costFacility: number;
  readonly costOther: number;
}

export interface FarmProfitEntry extends FarmProfitEntryInput {
  readonly entryId: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}
