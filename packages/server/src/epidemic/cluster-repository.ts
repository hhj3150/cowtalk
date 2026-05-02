// 전염병 클러스터 DB 리포지토리
// disease_clusters, cluster_farm_memberships, epidemic_warnings CRUD

import { eq, and, desc, gte, isNull } from 'drizzle-orm';
import {
  diseaseClusters,
  clusterFarmMemberships,
  epidemicWarnings,
  epidemicDailySnapshots,
  farms,
} from '../db/schema.js';
import type { DetectedCluster } from './cluster-detector.js';
import { getDb } from '../config/database.js';

type DB = ReturnType<typeof getDb>;

// ======================================================================
// 클러스터 CRUD
// ======================================================================

export async function insertCluster(
  db: DB,
  cluster: DetectedCluster,
): Promise<string> {
  const [row] = await db
    .insert(diseaseClusters)
    .values({
      diseaseType: cluster.diseaseType,
      centerLat: cluster.center.lat,
      centerLng: cluster.center.lng,
      radiusKm: cluster.radiusKm,
      level: cluster.level,
      status: 'active',
      farmCount: cluster.farms.length,
      eventCount: cluster.totalEvents,
      spreadRateFarmsPerDay: cluster.spreadRate.farmsPerDay,
      spreadRateEventsPerDay: cluster.spreadRate.eventsPerDay,
      spreadTrend: cluster.spreadRate.trend,
      metadata: {},
      firstDetectedAt: cluster.firstEventAt,
      lastUpdatedAt: new Date(),
    })
    .returning({ clusterId: diseaseClusters.clusterId });

  const clusterId = row!.clusterId;

  // 농장 멤버십 일괄 삽입
  if (cluster.farms.length > 0) {
    await db.insert(clusterFarmMemberships).values(
      cluster.farms.map((farm) => ({
        clusterId,
        farmId: farm.farmId,
        eventCount: farm.eventCount,
        latestEventAt: farm.latestEventAt,
      })),
    );
  }

  return clusterId;
}

export async function updateCluster(
  db: DB,
  clusterId: string,
  updates: {
    readonly level?: string;
    readonly status?: string;
    readonly farmCount?: number;
    readonly eventCount?: number;
    readonly spreadRateFarmsPerDay?: number;
    readonly spreadRateEventsPerDay?: number;
    readonly spreadTrend?: string;
    readonly centerLat?: number;
    readonly centerLng?: number;
    readonly radiusKm?: number;
  },
): Promise<void> {
  await db
    .update(diseaseClusters)
    .set({
      ...updates,
      lastUpdatedAt: new Date(),
    })
    .where(eq(diseaseClusters.clusterId, clusterId));
}

export async function getActiveClusters(
  db: DB,
  regionId?: string,
): Promise<readonly ActiveClusterRow[]> {
  const conditions = [
    eq(diseaseClusters.status, 'active'),
  ];

  const rows = await db
    .select()
    .from(diseaseClusters)
    .where(and(...conditions))
    .orderBy(desc(diseaseClusters.lastUpdatedAt));

  // regionId 필터링은 farmMemberships → farms → regionId를 통해 처리
  if (regionId) {
    const clusterIds = rows.map((r) => r.clusterId);
    const membershipsWithFarms = await Promise.all(
      clusterIds.map(async (cid) => {
        const members = await db
          .select({
            clusterId: clusterFarmMemberships.clusterId,
            farmId: clusterFarmMemberships.farmId,
            regionId: farms.regionId,
          })
          .from(clusterFarmMemberships)
          .innerJoin(farms, eq(clusterFarmMemberships.farmId, farms.farmId))
          .where(eq(clusterFarmMemberships.clusterId, cid));
        return members;
      }),
    );

    const regionClusterIds = new Set(
      membershipsWithFarms
        .flat()
        .filter((m) => m.regionId === regionId)
        .map((m) => m.clusterId),
    );

    return rows.filter((r) => regionClusterIds.has(r.clusterId));
  }

  return rows;
}

export async function getClusterFarms(
  db: DB,
  clusterId: string,
): Promise<readonly ClusterFarmRow[]> {
  return db
    .select({
      membershipId: clusterFarmMemberships.membershipId,
      clusterId: clusterFarmMemberships.clusterId,
      farmId: clusterFarmMemberships.farmId,
      eventCount: clusterFarmMemberships.eventCount,
      latestEventAt: clusterFarmMemberships.latestEventAt,
      farmName: farms.name,
      lat: farms.lat,
      lng: farms.lng,
    })
    .from(clusterFarmMemberships)
    .innerJoin(farms, eq(clusterFarmMemberships.farmId, farms.farmId))
    .where(eq(clusterFarmMemberships.clusterId, clusterId));
}

export async function resolveCluster(
  db: DB,
  clusterId: string,
): Promise<void> {
  const now = new Date();
  await db
    .update(diseaseClusters)
    .set({ status: 'resolved', resolvedAt: now, lastUpdatedAt: now })
    .where(eq(diseaseClusters.clusterId, clusterId));

  // 관련 경보도 해제
  await db
    .update(epidemicWarnings)
    .set({ status: 'resolved', resolvedAt: now, updatedAt: now })
    .where(
      and(
        eq(epidemicWarnings.clusterId, clusterId),
        eq(epidemicWarnings.status, 'active'),
      ),
    );
}

// ======================================================================
// 경보 CRUD
// ======================================================================

export async function createWarning(
  db: DB,
  warning: {
    readonly clusterId: string;
    readonly level: string;
    readonly scope: string;
    readonly regionId?: string;
    readonly aiInterpretation?: unknown;
  },
): Promise<string> {
  const [row] = await db
    .insert(epidemicWarnings)
    .values({
      clusterId: warning.clusterId,
      level: warning.level,
      scope: warning.scope,
      regionId: warning.regionId ?? null,
      aiInterpretation: warning.aiInterpretation ?? null,
    })
    .returning({ warningId: epidemicWarnings.warningId });

  return row!.warningId;
}

export async function getActiveWarnings(
  db: DB,
  filters?: {
    readonly regionId?: string;
    readonly level?: string;
  },
): Promise<readonly WarningRow[]> {
  const conditions = [eq(epidemicWarnings.status, 'active')];

  if (filters?.regionId) {
    conditions.push(eq(epidemicWarnings.regionId, filters.regionId));
  }
  if (filters?.level) {
    conditions.push(eq(epidemicWarnings.level, filters.level));
  }

  return db
    .select()
    .from(epidemicWarnings)
    .where(and(...conditions))
    .orderBy(desc(epidemicWarnings.createdAt));
}

export async function acknowledgeWarning(
  db: DB,
  warningId: string,
  userId: string,
): Promise<void> {
  await db
    .update(epidemicWarnings)
    .set({
      status: 'acknowledged',
      acknowledgedBy: userId,
      acknowledgedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(epidemicWarnings.warningId, warningId));
}

// ======================================================================
// 일별 스냅샷
// ======================================================================

export async function upsertDailySnapshot(
  db: DB,
  snapshot: {
    readonly date: string;
    readonly regionId?: string;
    readonly clusterCount: number;
    readonly warningLevel: string;
    readonly totalHealthEvents: number;
    readonly totalAffectedFarms: number;
    readonly totalAffectedAnimals: number;
    readonly metrics: Record<string, unknown>;
  },
): Promise<void> {
  await db
    .insert(epidemicDailySnapshots)
    .values({
      date: snapshot.date,
      regionId: snapshot.regionId ?? null,
      clusterCount: snapshot.clusterCount,
      warningLevel: snapshot.warningLevel,
      totalHealthEvents: snapshot.totalHealthEvents,
      totalAffectedFarms: snapshot.totalAffectedFarms,
      totalAffectedAnimals: snapshot.totalAffectedAnimals,
      metrics: snapshot.metrics,
    })
    .onConflictDoUpdate({
      // drizzle target 타입이 nullable 컬럼 조합을 추론 못하는 알려진 제약
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      target: [epidemicDailySnapshots.date, epidemicDailySnapshots.regionId] as any,
      set: {
        clusterCount: snapshot.clusterCount,
        warningLevel: snapshot.warningLevel,
        totalHealthEvents: snapshot.totalHealthEvents,
        totalAffectedFarms: snapshot.totalAffectedFarms,
        totalAffectedAnimals: snapshot.totalAffectedAnimals,
        metrics: snapshot.metrics,
      },
    });
}

export async function getDailySnapshots(
  db: DB,
  regionId: string | null,
  days: number,
): Promise<readonly DailySnapshotRow[]> {
  const since = new Date();
  since.setDate(since.getDate() - days);
  const sinceStr = since.toISOString().split('T')[0] ?? '';

  const conditions = [gte(epidemicDailySnapshots.date, sinceStr)];
  if (regionId) {
    conditions.push(eq(epidemicDailySnapshots.regionId, regionId));
  } else {
    conditions.push(isNull(epidemicDailySnapshots.regionId));
  }

  return db
    .select()
    .from(epidemicDailySnapshots)
    .where(and(...conditions))
    .orderBy(epidemicDailySnapshots.date);
}

// ======================================================================
// Row 타입
// ======================================================================

export interface ActiveClusterRow {
  readonly clusterId: string;
  readonly diseaseType: string;
  readonly centerLat: number;
  readonly centerLng: number;
  readonly radiusKm: number;
  readonly level: string;
  readonly status: string;
  readonly farmCount: number;
  readonly eventCount: number;
  readonly spreadRateFarmsPerDay: number;
  readonly spreadRateEventsPerDay: number;
  readonly spreadTrend: string;
  readonly firstDetectedAt: Date;
  readonly lastUpdatedAt: Date;
}

export interface ClusterFarmRow {
  readonly farmId: string;
  readonly farmName: string;
  readonly lat: number | null;
  readonly lng: number | null;
  readonly eventCount: number;
  readonly latestEventAt: Date;
}

export interface WarningRow {
  readonly warningId: string;
  readonly clusterId: string;
  readonly level: string;
  readonly scope: string;
  readonly regionId: string | null;
  readonly aiInterpretation: unknown;
  readonly status: string;
  readonly createdAt: Date;
}

export interface DailySnapshotRow {
  readonly date: string;
  readonly regionId: string | null;
  readonly clusterCount: number;
  readonly warningLevel: string;
  readonly totalHealthEvents: number;
  readonly totalAffectedFarms: number;
  readonly totalAffectedAnimals: number;
  readonly metrics: unknown;
}
