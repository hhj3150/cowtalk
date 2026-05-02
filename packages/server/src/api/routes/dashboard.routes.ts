// 대시보드 라우트 — 역할별 DB 기반 대시보드

import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import { authenticate } from '../middleware/auth.js';
import type { Role } from '@cowtalk/shared';
import type { DashboardData } from '../../serving/dashboard.service.js';
import { logger } from '../../lib/logger.js';
import { getDb } from '../../config/database.js';
import {
  farms, animals, smaxtecEvents, breedingEvents,
  prescriptions, prescriptionItems, drugDatabase,
  vaccineSchedules, sensorDevices, regions,
} from '../../db/schema.js';
import { eq, count, sql, gt, and, desc, isNull } from 'drizzle-orm';

export const dashboardRouter = Router();

dashboardRouter.use(authenticate);

// ===========================
// 메인 대시보드 엔드포인트
// ===========================

dashboardRouter.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const role = req.user?.role as Role;
    const farmIds = req.user?.farmIds as string[] | undefined;

    const dashboard = await buildDashboardForRole(role, farmIds);
    res.json({ success: true, data: dashboard });
  } catch (error) {
    next(error);
  }
});

// ===========================
// AI 인사이트 엔드포인트 (비동기)
// ===========================

dashboardRouter.get('/insights', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const role = req.user?.role as Role;
    const farmIds = req.user?.farmIds as string[] | undefined;

    const dashboard = await buildDashboardForRole(role, farmIds);

    const { generateDashboardInsight } = await import('../../serving/dashboard-insight.service.js');
    const insight = await generateDashboardInsight({
      role,
      kpis: dashboard.kpis.map((k) => ({
        label: k.label,
        value: k.value,
        unit: k.unit,
        severity: k.severity,
      })),
      todayActions: dashboard.todayActions.map((a) => ({
        action: a.action,
        target: a.target,
        urgency: a.urgency,
      })),
      roleData: dashboard.roleData ?? {},
    }, farmIds);

    res.json({ success: true, data: insight });
  } catch (error) {
    next(error);
  }
});

dashboardRouter.get('/kpi', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const role = req.user?.role as Role;
    const farmIds = req.user?.farmIds as string[] | undefined;

    const dashboard = await buildDashboardForRole(role, farmIds);
    res.json({ success: true, data: { kpis: dashboard.kpis } });
  } catch (error) {
    next(error);
  }
});

// ===========================
// 발정 목장별 그룹핑 (수정사 전용)
// ===========================

dashboardRouter.get('/estrus-by-farm', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await buildEstrusByFarm();
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
});

// ===========================
// 수정 동선 (최적 방문 순서)
// ===========================

dashboardRouter.get('/estrus-route', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await buildEstrusRoute();
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
});

// ===========================
// 수정 액션 기록 (수정 완료 / 넘김)
// ===========================

dashboardRouter.post('/estrus-action', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const db = getDb();
    const {
      eventId,
      animalId,
      action,
      semenName,
      skipReason,
    } = req.body as {
      eventId: string;
      animalId: string;
      action: 'inseminated' | 'skipped';
      semenName?: string;
      skipReason?: string;
    };

    const technicianId = req.user?.userId ?? null;

    if (action === 'inseminated') {
      await db.insert(breedingEvents).values({
        animalId,
        eventDate: new Date(),
        type: 'ai',
        semenInfo: semenName ?? null,
        technicianId,
        notes: `발정 이벤트 ${eventId} 기반 수정`,
      });
    } else {
      await db.insert(breedingEvents).values({
        animalId,
        eventDate: new Date(),
        type: 'skipped',
        semenInfo: null,
        technicianId,
        notes: skipReason ?? '사유 미입력',
      });
    }

    res.json({ success: true, data: { eventId, action } });
  } catch (error) {
    next(error);
  }
});

// ===========================
// 역할별 대시보드 빌더 분기
// ===========================

async function buildDashboardForRole(role: Role, farmIds?: string[]): Promise<DashboardData> {
  try {
    switch (role) {
      case 'farmer':
        return await buildFarmerDashboard(farmIds?.[0]);
      case 'veterinarian':
        return await buildVetDashboard();
      case 'government_admin':
        return await buildAdminDashboard();
      case 'quarantine_officer':
        return await buildQuarantineOfficerDashboard();
      default:
        return buildFallback(role);
    }
  } catch (error) {
    logger.warn({ error, role }, 'Dashboard builder failed, using fallback');
    return buildFallback(role);
  }
}

function buildFallback(role: Role): DashboardData {
  return {
    role,
    timestamp: new Date(),
    kpis: [],
    todayActions: [],
    alerts: [],
    insights: [{ title: '대시보드', description: '데이터를 불러오는 중입니다.', source: 'system' }],
    roleData: {},
  };
}

// ===========================
// 1. 농장주 대시보드
// ===========================

async function buildFarmerDashboard(farmId?: string): Promise<DashboardData> {
  const db = getDb();
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  const oneDayAgo = new Date();
  oneDayAgo.setDate(oneDayAgo.getDate() - 1);

  let targetFarmId = farmId;
  if (!targetFarmId) {
    const [firstFarm] = await db.select({ farmId: farms.farmId }).from(farms).where(eq(farms.status, 'active')).limit(1);
    targetFarmId = firstFarm?.farmId;
  }

  if (!targetFarmId) return buildFallback('farmer');

  const [farmInfo] = await db.select().from(farms).where(eq(farms.farmId, targetFarmId));

  const [animalCount] = await db.select({ count: count() }).from(animals)
    .where(and(eq(animals.farmId, targetFarmId), eq(animals.status, 'active')));

  const [sensorCount] = await db.select({ count: count() }).from(sensorDevices)
    .where(and(eq(sensorDevices.status, 'active'), isNull(sensorDevices.removeDate)));

  const [todayEventCount] = await db.select({ count: count() }).from(smaxtecEvents)
    .where(and(eq(smaxtecEvents.farmId, targetFarmId), gt(smaxtecEvents.detectedAt, oneDayAgo)));

  const [healthWarnings] = await db.select({ count: count() }).from(smaxtecEvents)
    .where(and(
      eq(smaxtecEvents.farmId, targetFarmId),
      gt(smaxtecEvents.detectedAt, sevenDaysAgo),
      sql`${smaxtecEvents.eventType} IN ('health_warning', 'temperature_warning')`,
    ));

  const recentEvents = await db.select({
    eventId: smaxtecEvents.eventId,
    eventType: smaxtecEvents.eventType,
    severity: smaxtecEvents.severity,
    detectedAt: smaxtecEvents.detectedAt,
    animalId: smaxtecEvents.animalId,
  }).from(smaxtecEvents)
    .where(and(eq(smaxtecEvents.farmId, targetFarmId), gt(smaxtecEvents.detectedAt, oneDayAgo)))
    .orderBy(desc(smaxtecEvents.detectedAt))
    .limit(10);

  const totalAnimals = (animalCount?.count ?? 0) as number;
  const totalSensors = (sensorCount?.count ?? 0) as number;
  const todayEvents = (todayEventCount?.count ?? 0) as number;
  const healthWarnCount = (healthWarnings?.count ?? 0) as number;

  return {
    role: 'farmer' as Role,
    timestamp: new Date(),
    kpis: [
      { label: '사육 두수', value: totalAnimals, unit: '두', trend: null, severity: null, drilldownType: 'all' },
      { label: '센서 장착', value: totalSensors, unit: '대', trend: null, severity: null },
      { label: '금일 알림', value: todayEvents, unit: '건', trend: null, severity: todayEvents > 5 ? 'medium' : 'low' },
      { label: '건강 주의', value: healthWarnCount, unit: '건', trend: null, severity: healthWarnCount > 3 ? 'high' : healthWarnCount > 0 ? 'medium' : 'low', drilldownType: 'health_risk' },
    ],
    todayActions: recentEvents.map((evt, idx) => ({
      priority: idx + 1,
      action: formatEventAction(evt.eventType, evt.severity),
      target: `개체 ${evt.animalId?.slice(0, 8) ?? ''}`,
      urgency: evt.severity as 'high' | 'medium' | 'low',
    })),
    alerts: [],
    insights: [{
      title: '농장 현황',
      description: `${farmInfo?.name ?? '내 농장'}에서 ${totalAnimals}마리를 사육 중입니다. 센서 ${totalSensors}대 활성. 최근 24시간 이벤트 ${todayEvents}건${healthWarnCount > 0 ? `, 건강 주의 ${healthWarnCount}건` : ''}.`,
      source: 'db_aggregate',
    }],
    roleData: {
      farmName: farmInfo?.name ?? '',
      farmId: targetFarmId,
      sensorRate: totalAnimals > 0 ? Math.round((totalSensors / totalAnimals) * 100) : 0,
      recentEvents: recentEvents.map((e) => ({
        eventId: e.eventId,
        eventType: e.eventType,
        severity: e.severity,
        detectedAt: e.detectedAt,
        animalId: e.animalId,
      })),
    },
  };
}

// ===========================
// 2. 수의사 대시보드
// ===========================

async function buildVetDashboard(): Promise<DashboardData> {
  const db = getDb();
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  const oneDayAgo = new Date();
  oneDayAgo.setDate(oneDayAgo.getDate() - 1);

  const [farmCount] = await db.select({ count: count() }).from(farms).where(eq(farms.status, 'active'));
  const [animalCount] = await db.select({ count: count() }).from(animals).where(eq(animals.status, 'active'));

  const [healthEventCount] = await db.select({ count: count() }).from(smaxtecEvents)
    .where(and(
      gt(smaxtecEvents.detectedAt, sevenDaysAgo),
      sql`${smaxtecEvents.eventType} IN ('health_warning', 'temperature_warning', 'drinking_warning')`,
    ));

  const urgentAnimals = await db.select({
    eventId: smaxtecEvents.eventId,
    animalId: smaxtecEvents.animalId,
    earTag: animals.earTag,
    farmId: smaxtecEvents.farmId,
    eventType: smaxtecEvents.eventType,
    severity: smaxtecEvents.severity,
    detectedAt: smaxtecEvents.detectedAt,
  }).from(smaxtecEvents)
    .leftJoin(animals, eq(smaxtecEvents.animalId, animals.animalId))
    .where(and(
      gt(smaxtecEvents.detectedAt, oneDayAgo),
      sql`${smaxtecEvents.severity} IN ('high', 'critical')`,
    ))
    .orderBy(desc(smaxtecEvents.detectedAt))
    .limit(20);

  // 7일 기준 Top 경고 농장
  const topFarmEvents = await db.select({
    farmId: smaxtecEvents.farmId,
    farmName: farms.name,
    eventCount: count(),
  }).from(smaxtecEvents)
    .innerJoin(farms, eq(smaxtecEvents.farmId, farms.farmId))
    .where(gt(smaxtecEvents.detectedAt, sevenDaysAgo))
    .groupBy(smaxtecEvents.farmId, farms.name)
    .orderBy(sql`count(*) DESC`)
    .limit(10);

  // 최근 24시간 기준 이벤트 카운트 (자정 리셋 방지)
  const todayStart = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const todayFarmEvents = await db.select({
    farmId: smaxtecEvents.farmId,
    eventCount: count(),
  }).from(smaxtecEvents)
    .where(gt(smaxtecEvents.detectedAt, todayStart))
    .groupBy(smaxtecEvents.farmId);
  const todayCountMap = new Map(todayFarmEvents.map((f) => [f.farmId, Number(f.eventCount)]));

  const [rxCount] = await db.select({ count: count() }).from(prescriptions).where(eq(prescriptions.status, 'active'));

  // 활성 처방전 상세 목록 (처방 + 약품 정보 JOIN)
  const prescriptionList = await db.select({
    prescriptionId: prescriptions.prescriptionId,
    animalId: prescriptions.animalId,
    farmId: prescriptions.farmId,
    diagnosis: prescriptions.diagnosis,
    prescribedAt: prescriptions.prescribedAt,
    expiresAt: prescriptions.expiresAt,
    drugName: drugDatabase.name,
    dosage: prescriptionItems.dosage,
    withdrawalMeatDays: drugDatabase.withdrawalMeatDays,
    withdrawalMilkDays: drugDatabase.withdrawalMilkDays,
  }).from(prescriptions)
    .innerJoin(prescriptionItems, eq(prescriptionItems.prescriptionId, prescriptions.prescriptionId))
    .innerJoin(drugDatabase, eq(prescriptionItems.drugId, drugDatabase.drugId))
    .where(eq(prescriptions.status, 'active'))
    .orderBy(desc(prescriptions.prescribedAt))
    .limit(20);

  // 경합 해석(Fusion) 후보: 24시간 내 2개 이상 다른 이벤트 유형을 가진 동물
  const fusionRaw = await db.select({
    animalId: smaxtecEvents.animalId,
    eventType: smaxtecEvents.eventType,
    severity: smaxtecEvents.severity,
    detectedAt: smaxtecEvents.detectedAt,
  }).from(smaxtecEvents)
    .where(and(
      gt(smaxtecEvents.detectedAt, oneDayAgo),
      sql`${smaxtecEvents.severity} IN ('high', 'critical')`,
    ))
    .orderBy(desc(smaxtecEvents.detectedAt))
    .limit(100);

  // 동물별로 이벤트 그룹핑 → 2개 이상 유형이면 Fusion 후보
  const animalEventsMap = new Map<string, Array<{ eventType: string; severity: string; detectedAt: Date }>>();
  for (const evt of fusionRaw) {
    if (!evt.animalId) continue;
    const existing = animalEventsMap.get(evt.animalId) ?? [];
    existing.push({ eventType: evt.eventType, severity: evt.severity, detectedAt: evt.detectedAt });
    animalEventsMap.set(evt.animalId, existing);
  }

  const fusionCandidates: Array<{
    animalId: string;
    events: Array<{ eventType: string; severity: string; detectedAt: Date }>;
    primary: { interpretation: string; confidence: number };
    secondary: { interpretation: string; confidence: number };
    recommendedAction: string;
  }> = [];

  for (const [aid, events] of animalEventsMap) {
    const types = new Set(events.map((e) => e.eventType));
    if (types.size < 2) continue;
    const fusion = deriveFusionInterpretation(Array.from(types));
    fusionCandidates.push({
      animalId: aid,
      events,
      primary: fusion.primary,
      secondary: fusion.secondary,
      recommendedAction: fusion.action,
    });
  }

  const totalFarms = (farmCount?.count ?? 0) as number;
  const totalAnimals = (animalCount?.count ?? 0) as number;
  const healthWarnings = (healthEventCount?.count ?? 0) as number;
  const activeRx = (rxCount?.count ?? 0) as number;

  return {
    role: 'veterinarian' as Role,
    timestamp: new Date(),
    kpis: [
      { label: '관할 농장', value: totalFarms, unit: '개', trend: null, severity: null, drilldownType: 'all' },
      { label: '총 두수', value: totalAnimals, unit: '두', trend: null, severity: null },
      { label: '건강 경고(7일)', value: healthWarnings, unit: '건', trend: null, severity: healthWarnings > 50 ? 'high' : healthWarnings > 10 ? 'medium' : 'low', drilldownType: 'health_risk' },
      { label: '긴급 개체', value: urgentAnimals.length, unit: '두', trend: null, severity: urgentAnimals.length > 5 ? 'critical' : urgentAnimals.length > 0 ? 'high' : 'low' },
      { label: '활성 처방', value: activeRx, unit: '건', trend: null, severity: null },
    ],
    todayActions: urgentAnimals.slice(0, 5).map((evt, idx) => ({
      priority: idx + 1,
      action: `[긴급] ${formatEventAction(evt.eventType, evt.severity)}`,
      target: evt.earTag ? `개체 #${evt.earTag}` : `개체 ${evt.animalId.slice(0, 8)}`,
      urgency: evt.severity as 'high' | 'critical',
    })),
    alerts: [],
    insights: [{
      title: '수의 현황 요약',
      description: `전체 ${totalFarms}개 농장, ${totalAnimals}마리 관리 중. 최근 7일 건강 경고 ${healthWarnings}건, 긴급 개체 ${urgentAnimals.length}마리. 활성 처방전 ${activeRx}건.`,
      source: 'db_aggregate',
    }],
    roleData: {
      urgentAnimals: urgentAnimals.map((a) => ({
        eventId: a.eventId,
        animalId: a.animalId,
        farmId: a.farmId,
        eventType: a.eventType,
        severity: a.severity,
        detectedAt: a.detectedAt,
      })),
      topWarningFarms: topFarmEvents.map((f) => ({
        farmId: f.farmId,
        farmName: f.farmName,
        eventCount: Number(f.eventCount),
        todayCount: todayCountMap.get(f.farmId) ?? 0,
      })),
      activePrescriptions: activeRx,
      prescriptionList: prescriptionList.map((rx) => ({
        prescriptionId: rx.prescriptionId,
        animalId: rx.animalId,
        farmId: rx.farmId,
        diagnosis: rx.diagnosis,
        drugName: rx.drugName,
        dosage: rx.dosage,
        withdrawalMeatDays: rx.withdrawalMeatDays,
        withdrawalMilkDays: rx.withdrawalMilkDays,
        prescribedAt: rx.prescribedAt,
        expiresAt: rx.expiresAt,
      })),
      fusionCandidates: fusionCandidates.slice(0, 5),
    },
  };
}

// ===========================
// 4. 행정관 대시보드
// ===========================

async function buildAdminDashboard(): Promise<DashboardData> {
  const db = getDb();
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  const [farmCount] = await db.select({ count: count() }).from(farms).where(eq(farms.status, 'active'));
  const [animalCount] = await db.select({ count: count() }).from(animals).where(eq(animals.status, 'active'));
  const [eventCount] = await db.select({ count: count() }).from(smaxtecEvents)
    .where(gt(smaxtecEvents.detectedAt, sevenDaysAgo));

  const warningFarms = await db.selectDistinct({ farmId: smaxtecEvents.farmId }).from(smaxtecEvents)
    .where(and(
      gt(smaxtecEvents.detectedAt, sevenDaysAgo),
      sql`${smaxtecEvents.severity} IN ('high', 'critical')`,
    ));

  const topFarms = await db.select({
    farmId: smaxtecEvents.farmId,
    farmName: farms.name,
    eventCount: count(),
    regionId: farms.regionId,
  }).from(smaxtecEvents)
    .innerJoin(farms, eq(smaxtecEvents.farmId, farms.farmId))
    .where(gt(smaxtecEvents.detectedAt, sevenDaysAgo))
    .groupBy(smaxtecEvents.farmId, farms.name, farms.regionId)
    .orderBy(sql`count(*) DESC`)
    .limit(10);

  const eventByType = await db.select({ eventType: smaxtecEvents.eventType, count: count() })
    .from(smaxtecEvents)
    .where(gt(smaxtecEvents.detectedAt, sevenDaysAgo))
    .groupBy(smaxtecEvents.eventType)
    .orderBy(sql`count(*) DESC`)
    .limit(5);

  const regionList = await db.select({
    regionId: regions.regionId,
    province: regions.province,
    district: regions.district,
  }).from(regions);

  const totalFarms = (farmCount?.count ?? 0) as number;
  const totalAnimals = (animalCount?.count ?? 0) as number;
  const recentEvents = (eventCount?.count ?? 0) as number;
  const warningFarmCount = warningFarms.length;

  const eventSummary = eventByType.map((e) => `${e.eventType}: ${e.count}건`).join(', ');

  return {
    role: 'government_admin' as Role,
    timestamp: new Date(),
    kpis: [
      { label: '관할 농장', value: totalFarms, unit: '개', trend: null, severity: null, drilldownType: 'all' },
      { label: '총 두수', value: totalAnimals, unit: '두', trend: null, severity: null, drilldownType: 'all' },
      { label: '7일 센서 이벤트', value: recentEvents, unit: '건', trend: null, severity: recentEvents > 100 ? 'medium' : 'low', drilldownType: 'health_risk' },
      { label: '주의 농장', value: warningFarmCount, unit: '개', trend: null, severity: warningFarmCount > 10 ? 'high' : warningFarmCount > 0 ? 'medium' : 'low' },
    ],
    todayActions: [],
    alerts: [],
    insights: [{
      title: '전체 현황 요약',
      description: `전체 ${totalFarms}개 농장, ${totalAnimals}마리 관리 중. 최근 7일 센서 이벤트 ${recentEvents}건${eventSummary ? ` (${eventSummary})` : ''}. 주의 농장 ${warningFarmCount}개.`,
      source: 'db_aggregate',
    }],
    roleData: {
      topWarningFarms: topFarms.map((f) => ({
        farmId: f.farmId,
        farmName: f.farmName,
        eventCount: Number(f.eventCount),
        regionId: f.regionId,
      })),
      eventByType: eventByType.map((e) => ({ eventType: e.eventType, count: Number(e.count) })),
      regions: regionList,
      warningFarmCount,
    },
  };
}

// ===========================
// 5. 방역관 대시보드
// ===========================

async function buildQuarantineOfficerDashboard(): Promise<DashboardData> {
  const db = getDb();
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  const threeDaysAgo = new Date();
  threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);

  const [farmCount] = await db.select({ count: count() }).from(farms).where(eq(farms.status, 'active'));

  const [tempAnomalyCount] = await db.select({ count: count() }).from(smaxtecEvents)
    .where(and(
      gt(smaxtecEvents.detectedAt, sevenDaysAgo),
      eq(smaxtecEvents.eventType, 'temperature_warning'),
    ));

  const healthWarningsByFarm = await db.select({
    farmId: smaxtecEvents.farmId,
    farmName: farms.name,
    count: count(),
  }).from(smaxtecEvents)
    .innerJoin(farms, eq(smaxtecEvents.farmId, farms.farmId))
    .where(and(
      gt(smaxtecEvents.detectedAt, threeDaysAgo),
      sql`${smaxtecEvents.eventType} IN ('health_warning', 'temperature_warning')`,
    ))
    .groupBy(smaxtecEvents.farmId, farms.name)
    .orderBy(sql`count(*) DESC`)
    .limit(20);

  const clusterFarms = healthWarningsByFarm.filter((f) => Number(f.count) >= 3);

  const [vaccineTotal] = await db.select({ count: count() }).from(vaccineSchedules);
  const [vaccineDone] = await db.select({ count: count() }).from(vaccineSchedules).where(eq(vaccineSchedules.status, 'completed'));

  const totalFarms = (farmCount?.count ?? 0) as number;
  const tempAnomalies = (tempAnomalyCount?.count ?? 0) as number;
  const totalVaccine = (vaccineTotal?.count ?? 0) as number;
  const doneVaccine = (vaccineDone?.count ?? 0) as number;
  const vaccineRate = totalVaccine > 0 ? Math.round((doneVaccine / totalVaccine) * 100) : 0;
  const earlyWarningScore = Math.min(100, Math.round((clusterFarms.length / Math.max(totalFarms, 1)) * 1000));

  return {
    role: 'quarantine_officer' as Role,
    timestamp: new Date(),
    kpis: [
      { label: '관할 농장', value: totalFarms, unit: '개', trend: null, severity: null, drilldownType: 'all' },
      { label: '체온 이상(7일)', value: tempAnomalies, unit: '건', trend: null, severity: tempAnomalies > 20 ? 'critical' : tempAnomalies > 5 ? 'high' : 'low' },
      { label: '집단 의심 농장', value: clusterFarms.length, unit: '개', trend: null, severity: clusterFarms.length > 3 ? 'critical' : clusterFarms.length > 0 ? 'high' : 'low' },
      { label: '백신 접종률', value: vaccineRate, unit: '%', trend: null, severity: vaccineRate < 50 ? 'high' : vaccineRate < 80 ? 'medium' : 'low' },
    ],
    todayActions: clusterFarms.slice(0, 5).map((f, idx) => ({
      priority: idx + 1,
      action: `[집단 의심] 건강 경고 ${f.count}건 — 역학조사 필요`,
      target: f.farmName,
      urgency: 'critical' as const,
    })),
    alerts: [],
    insights: [{
      title: '방역 현황',
      description: `조기 경보 수준 ${earlyWarningScore}/100. 체온 이상 ${tempAnomalies}건, 집단 의심 농장 ${clusterFarms.length}개. 백신 접종률 ${vaccineRate}%.`,
      source: 'db_aggregate',
    }],
    roleData: {
      earlyWarningScore,
      clusterFarms: clusterFarms.map((f) => ({ farmId: f.farmId, farmName: f.farmName, warningCount: Number(f.count) })),
      healthWarningsByFarm: healthWarningsByFarm.map((f) => ({ farmId: f.farmId, farmName: f.farmName, count: Number(f.count) })),
      vaccineRate,
      vaccineDone: doneVaccine,
      vaccineTotal: totalVaccine,
    },
  };
}

// ===========================
// 발정 목장별 그룹핑 빌더
// ===========================

interface EstrusFarmGroup {
  readonly farmId: string;
  readonly farmName: string;
  readonly lat: number;
  readonly lng: number;
  readonly address: string;
  readonly nowCount: number;
  readonly soonCount: number;
  readonly watchCount: number;
  readonly totalEstrus: number;
  readonly animals: readonly {
    readonly eventId: string;
    readonly animalId: string;
    readonly earTag: string;
    readonly confidence: number;
    readonly detectedAt: Date;
    readonly stage: string;
  }[];
}

async function buildEstrusByFarm(): Promise<{
  readonly todayTotal: number;
  readonly farmGroups: readonly EstrusFarmGroup[];
}> {
  const db = getDb();
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  // 7일 이내 발정 이벤트 + 농장 정보 + 동물 이표 JOIN
  const estrusRows = await db.select({
    eventId: smaxtecEvents.eventId,
    animalId: smaxtecEvents.animalId,
    farmId: smaxtecEvents.farmId,
    confidence: smaxtecEvents.confidence,
    detectedAt: smaxtecEvents.detectedAt,
    stage: smaxtecEvents.stage,
    farmName: farms.name,
    lat: farms.lat,
    lng: farms.lng,
    address: farms.address,
    earTag: animals.earTag,
  })
    .from(smaxtecEvents)
    .innerJoin(farms, eq(smaxtecEvents.farmId, farms.farmId))
    .innerJoin(animals, eq(smaxtecEvents.animalId, animals.animalId))
    .where(and(
      gt(smaxtecEvents.detectedAt, sevenDaysAgo),
      eq(smaxtecEvents.eventType, 'estrus'),
    ))
    .orderBy(desc(smaxtecEvents.detectedAt))
    .limit(200);

  // 목장별 그룹핑
  const now = Date.now();
  const h24 = 24 * 60 * 60 * 1000;
  const h48 = 48 * 60 * 60 * 1000;

  const farmMap = new Map<string, {
    farmId: string;
    farmName: string;
    lat: number;
    lng: number;
    address: string;
    nowCount: number;
    soonCount: number;
    watchCount: number;
    animals: Array<{
      eventId: string;
      animalId: string;
      earTag: string;
      confidence: number;
      detectedAt: Date;
      stage: string;
    }>;
  }>();

  for (const row of estrusRows) {
    const existing = farmMap.get(row.farmId) ?? {
      farmId: row.farmId,
      farmName: row.farmName,
      lat: row.lat,
      lng: row.lng,
      address: row.address,
      nowCount: 0,
      soonCount: 0,
      watchCount: 0,
      animals: [],
    };

    const age = now - new Date(row.detectedAt).getTime();
    const stage = age < h24 ? 'now' : age < h48 ? 'soon' : 'watch';

    if (stage === 'now') existing.nowCount += 1;
    else if (stage === 'soon') existing.soonCount += 1;
    else existing.watchCount += 1;

    existing.animals.push({
      eventId: row.eventId,
      animalId: row.animalId,
      earTag: row.earTag,
      confidence: row.confidence,
      detectedAt: row.detectedAt,
      stage,
    });

    farmMap.set(row.farmId, existing);
  }

  // NOW가 많은 순 → SOON → WATCH 순 정렬
  const farmGroups = Array.from(farmMap.values())
    .map((fg) => ({ ...fg, totalEstrus: fg.nowCount + fg.soonCount + fg.watchCount }))
    .sort((a, b) => (b.nowCount * 100 + b.soonCount * 10 + b.watchCount) - (a.nowCount * 100 + a.soonCount * 10 + a.watchCount));

  const todayTotal = farmGroups.reduce((sum, fg) => sum + fg.totalEstrus, 0);

  return { todayTotal, farmGroups };
}

// ===========================
// 수정 동선 빌더 (Nearest Neighbor)
// ===========================

interface RouteStop {
  readonly order: number;
  readonly farmId: string;
  readonly farmName: string;
  readonly lat: number;
  readonly lng: number;
  readonly address: string;
  readonly estrusCount: number;
  readonly nowCount: number;
  readonly distanceFromPrev: number; // km
  readonly cumulativeDistance: number; // km
}

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

async function buildEstrusRoute(): Promise<{
  readonly totalStops: number;
  readonly totalDistanceKm: number;
  readonly estimatedMinutes: number;
  readonly stops: readonly RouteStop[];
}> {
  const { farmGroups } = await buildEstrusByFarm();

  // NOW가 있는 농장만 경로에 포함 (NOW 없으면 SOON도 포함)
  let routeFarms = farmGroups.filter((fg) => fg.nowCount > 0);
  if (routeFarms.length === 0) {
    routeFarms = farmGroups.filter((fg) => fg.soonCount > 0);
  }
  if (routeFarms.length === 0) {
    return { totalStops: 0, totalDistanceKm: 0, estimatedMinutes: 0, stops: [] };
  }

  // Nearest Neighbor — NOW 가장 많은 농장부터 시작
  const remaining = [...routeFarms];
  const route: RouteStop[] = [];

  // 시작점: NOW가 가장 많은 농장
  remaining.sort((a, b) => b.nowCount - a.nowCount);
  const first = remaining.shift()!;
  route.push({
    order: 1,
    farmId: first.farmId,
    farmName: first.farmName,
    lat: first.lat,
    lng: first.lng,
    address: first.address,
    estrusCount: first.totalEstrus,
    nowCount: first.nowCount,
    distanceFromPrev: 0,
    cumulativeDistance: 0,
  });

  let cumDist = 0;
  while (remaining.length > 0) {
    const last = route[route.length - 1]!;
    let nearestIdx = 0;
    let nearestDist = Infinity;
    for (let i = 0; i < remaining.length; i++) {
      const d = haversineKm(last.lat, last.lng, remaining[i]!.lat, remaining[i]!.lng);
      if (d < nearestDist) {
        nearestDist = d;
        nearestIdx = i;
      }
    }
    const next = remaining.splice(nearestIdx, 1)[0]!;
    const dist = Math.round(nearestDist * 10) / 10;
    cumDist += dist;
    route.push({
      order: route.length + 1,
      farmId: next.farmId,
      farmName: next.farmName,
      lat: next.lat,
      lng: next.lng,
      address: next.address,
      estrusCount: next.totalEstrus,
      nowCount: next.nowCount,
      distanceFromPrev: dist,
      cumulativeDistance: Math.round(cumDist * 10) / 10,
    });
  }

  // 이동 시간 추정: 평균 40km/h + 농장당 30분 작업
  const drivingMinutes = Math.round((cumDist / 40) * 60);
  const workMinutes = route.length * 30;

  return {
    totalStops: route.length,
    totalDistanceKm: Math.round(cumDist * 10) / 10,
    estimatedMinutes: drivingMinutes + workMinutes,
    stops: route,
  };
}

// ===========================
// 유틸리티
// ===========================

// Decision Fusion — 복수 이벤트 유형 경합 해석
function deriveFusionInterpretation(types: string[]): {
  primary: { interpretation: string; confidence: number };
  secondary: { interpretation: string; confidence: number };
  action: string;
} {
  const typeSet = new Set(types);
  const hasTemp = typeSet.has('temperature_warning');
  const hasHealth = typeSet.has('health_warning');
  const hasActivity = typeSet.has('activity_warning');
  const hasRumination = typeSet.has('rumination_warning');
  const hasDrinking = typeSet.has('drinking_warning');
  const hasEstrus = typeSet.has('estrus');

  // 발정 + 활동 → 발정 우선
  if (hasEstrus || (hasActivity && hasTemp)) {
    return {
      primary: { interpretation: '발정 가능성', confidence: hasEstrus ? 85 : 65 },
      secondary: { interpretation: hasTemp ? '발열/질병 가능성' : '열스트레스 가능성', confidence: hasTemp ? 25 : 15 },
      action: hasEstrus ? '직장검사 + 수정 적기 확인' : '체온 재측정 + 발정 징후 관찰',
    };
  }

  // 체온 + 건강경고 → 질병 우선
  if (hasTemp && hasHealth) {
    return {
      primary: { interpretation: '질병/감염 가능성', confidence: 78 },
      secondary: { interpretation: '열스트레스 가능성', confidence: 18 },
      action: '직장검사 + 혈액검사 권고',
    };
  }

  // 반추 + 음수 → 사양 문제 우선
  if (hasRumination && hasDrinking) {
    return {
      primary: { interpretation: '사양/소화 문제', confidence: 72 },
      secondary: { interpretation: '초기 질병 가능성', confidence: 22 },
      action: '사료 급여량 및 품질 확인',
    };
  }

  // 체온 단독 + 다른 유형
  if (hasTemp) {
    return {
      primary: { interpretation: '발열 의심', confidence: 60 },
      secondary: { interpretation: '환경적 요인(열스트레스)', confidence: 30 },
      action: '체온 재측정 + 환경 온도 확인',
    };
  }

  // 기본 경합
  return {
    primary: { interpretation: '복합 이상 감지', confidence: 55 },
    secondary: { interpretation: '환경/일시적 요인', confidence: 25 },
    action: '상세 관찰 + 반복 확인',
  };
}

function formatEventAction(eventType: string, severity: string): string {
  const typeMap: Record<string, string> = {
    estrus: '발정 감지',
    health_warning: '건강 경고',
    temperature_warning: '체온 이상',
    calving: '분만 징후',
    drinking_warning: '음수 이상',
    rumination_warning: '반추 이상',
    feeding_warning: '사양 이상',
    activity_warning: '활동 이상',
  };
  const label = typeMap[eventType] ?? eventType;
  return severity === 'critical' || severity === 'high' ? `⚠️ ${label}` : label;
}
