// 역할별 대시보드 서비스
// Claude 해석 결과 + 프로파일 → 역할 맞춤 대시보드 데이터

import type {
  Role, Severity,
  AnimalInterpretation, FarmInterpretation,
  RegionalInterpretation, TenantInterpretation,
} from '@cowtalk/shared';
import {
  analyzeAnimal, analyzeFarm, analyzeRegion, analyzeTenant,
} from '../ai-brain/index.js';

// ===========================
// 대시보드 응답 타입
// ===========================

export interface DashboardData {
  readonly role: Role;
  readonly timestamp: Date;
  readonly kpis: readonly KpiItem[];
  readonly todayActions: readonly ActionItem[];
  readonly alerts: readonly AlertItem[];
  readonly insights: readonly InsightItem[];
  readonly roleData?: Record<string, unknown>;
}

export interface KpiItem {
  readonly label: string;
  readonly value: string | number;
  readonly unit: string;
  readonly trend: 'up' | 'down' | 'stable' | null;
  readonly severity: Severity | null;
  readonly drilldownType?: string | null;
}

export interface ActionItem {
  readonly priority: number;
  readonly action: string;
  readonly target: string;
  readonly urgency: Severity;
}

export interface AlertItem {
  readonly type: string;
  readonly message: string;
  readonly severity: Severity;
  readonly timestamp: Date;
}

export interface InsightItem {
  readonly title: string;
  readonly description: string;
  readonly source: string;
}

// ===========================
// 농장주 대시보드
// ===========================

export async function getFarmerDashboard(
  farmId: string,
): Promise<DashboardData | null> {
  const interpretation = await analyzeFarm(farmId, 'farmer');
  if (!interpretation) return null;

  return buildDashboardFromFarm(interpretation, 'farmer');
}

// ===========================
// 수의사 대시보드
// ===========================

export async function getVetDashboard(
  tenantId: string,
): Promise<DashboardData | null> {
  const interpretation = await analyzeTenant(tenantId, 'veterinarian');
  if (!interpretation) return null;

  return buildDashboardFromTenant(interpretation, 'veterinarian');
}

// ===========================
// 수정사 대시보드
// ===========================

export async function getInseminatorDashboard(
  tenantId: string,
): Promise<DashboardData | null> {
  const interpretation = await analyzeTenant(tenantId, 'inseminator');
  if (!interpretation) return null;

  return buildDashboardFromTenant(interpretation, 'inseminator');
}

// ===========================
// 행정관 대시보드
// ===========================

export async function getAdminDashboard(
  regionId: string,
): Promise<DashboardData | null> {
  const interpretation = await analyzeRegion(regionId, 'government_admin');
  if (!interpretation) return null;

  return buildDashboardFromRegional(interpretation, 'government_admin');
}

// ===========================
// 방역관 대시보드
// ===========================

export async function getQuarantineDashboard(
  regionId: string,
): Promise<DashboardData | null> {
  const interpretation = await analyzeRegion(regionId, 'quarantine_officer');
  if (!interpretation) return null;

  return buildDashboardFromRegional(interpretation, 'quarantine_officer');
}

// ===========================
// 사료회사 대시보드
// ===========================

export async function getFeedCompanyDashboard(
  tenantId: string,
): Promise<DashboardData | null> {
  const interpretation = await analyzeTenant(tenantId, 'feed_company');
  if (!interpretation) return null;

  return buildDashboardFromTenant(interpretation, 'feed_company');
}

// ===========================
// 개체 상세 (드릴다운)
// ===========================

export async function getAnimalDetail(
  animalId: string,
  role: Role,
): Promise<AnimalInterpretation | null> {
  return analyzeAnimal(animalId, role);
}

// ===========================
// 빌더 함수
// ===========================

function buildDashboardFromFarm(
  interpretation: FarmInterpretation,
  role: Role,
): DashboardData {
  const kpis: KpiItem[] = [];

  if (interpretation.healthScore !== null) {
    kpis.push({
      label: '농장 건강 점수',
      value: interpretation.healthScore,
      unit: '/100',
      trend: null,
      severity: interpretation.healthScore >= 80 ? 'low' : interpretation.healthScore >= 60 ? 'medium' : 'high',
    });
  }

  const todayActions: ActionItem[] = interpretation.todayPriorities.map((p) => ({
    priority: p.priority,
    action: p.action,
    target: p.target,
    urgency: p.urgency,
  }));

  const alerts: AlertItem[] = interpretation.animalHighlights
    .filter((h) => h.severity === 'high' || h.severity === 'critical')
    .map((h) => ({
      type: 'animal_highlight',
      message: `${h.earTag}: ${h.issue}`,
      severity: h.severity,
      timestamp: interpretation.timestamp,
    }));

  const insights: InsightItem[] = [{
    title: '오늘의 요약',
    description: interpretation.summary,
    source: interpretation.source,
  }];

  if (interpretation.risks.length > 0) {
    insights.push({
      title: '위험 요소',
      description: interpretation.risks.join('. '),
      source: interpretation.source,
    });
  }

  return { role, timestamp: interpretation.timestamp, kpis, todayActions, alerts, insights };
}

function buildDashboardFromTenant(
  interpretation: TenantInterpretation,
  role: Role,
): DashboardData {
  const kpis: KpiItem[] = [
    { label: '관리 농장', value: interpretation.farmPriorities.length, unit: '개', trend: null, severity: null },
  ];

  const todayActions: ActionItem[] = interpretation.todaySchedule.map((s) => ({
    priority: s.priority,
    action: `${s.farmName}: ${s.task}`,
    target: s.farmName,
    urgency: s.urgency,
  }));

  const alerts: AlertItem[] = interpretation.urgentCases.map((c) => ({
    type: 'urgent_case',
    message: `${c.earTag} (${c.farmName}): ${c.issue}`,
    severity: c.severity,
    timestamp: interpretation.timestamp,
  }));

  return {
    role,
    timestamp: interpretation.timestamp,
    kpis,
    todayActions,
    alerts,
    insights: [{ title: '요약', description: interpretation.summary, source: interpretation.source }],
  };
}

function buildDashboardFromRegional(
  interpretation: RegionalInterpretation,
  role: Role,
): DashboardData {
  const kpis: KpiItem[] = [
    { label: '관할 농장', value: interpretation.farmRankings.length, unit: '개', trend: null, severity: null },
  ];

  const alerts: AlertItem[] = interpretation.clusterAnalysis
    .filter((c) => c.severity === 'high' || c.severity === 'critical')
    .map((c) => ({
      type: 'cluster_signal',
      message: `${c.signalType}: ${c.interpretation}`,
      severity: c.severity,
      timestamp: interpretation.timestamp,
    }));

  return {
    role,
    timestamp: interpretation.timestamp,
    kpis,
    todayActions: [],
    alerts,
    insights: [{ title: '지역 요약', description: interpretation.summary, source: interpretation.source }],
  };
}
