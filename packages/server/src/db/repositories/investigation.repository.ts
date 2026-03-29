// 역학조사 DB 리포지토리
// investigations 테이블 CRUD — cluster-repository.ts 패턴 준수

import { eq, and, desc, gte } from 'drizzle-orm';
import { investigations, farms } from '../schema.js';
import { getDb } from '../../config/database.js';
import type {
  InvestigationStatus,
  FeverAnimalDetail,
  InvestigationRadiusSummary,
  InvestigationContactNetwork,
  InvestigationWeather,
} from '@cowtalk/shared';

type DB = ReturnType<typeof getDb>;

// ======================================================================
// INSERT
// ======================================================================

export interface InsertInvestigationInput {
  readonly farmId: string;
  readonly initiatedBy?: string;
  readonly clusterId?: string;
  readonly feverAnimals: readonly FeverAnimalDetail[];
  readonly radiusSummary: InvestigationRadiusSummary;
  readonly contactNetwork: InvestigationContactNetwork;
  readonly weather: InvestigationWeather;
  readonly nearbyAbnormalFarms: number;
}

export async function insertInvestigation(
  db: DB,
  input: InsertInvestigationInput,
): Promise<string> {
  const [row] = await db
    .insert(investigations)
    .values({
      farmId: input.farmId,
      initiatedBy: input.initiatedBy ?? null,
      clusterId: input.clusterId ?? null,
      status: 'draft',
      feverAnimals: input.feverAnimals as unknown as Record<string, unknown>,
      radiusSummary: input.radiusSummary as unknown as Record<string, unknown>,
      contactNetwork: input.contactNetwork as unknown as Record<string, unknown>,
      weather: input.weather as unknown as Record<string, unknown>,
      nearbyAbnormalFarms: input.nearbyAbnormalFarms,
      fieldObservations: '',
    })
    .returning({ investigationId: investigations.investigationId });

  return row!.investigationId;
}

// ======================================================================
// SELECT by ID (with farm JOIN)
// ======================================================================

export async function getInvestigationById(
  db: DB,
  investigationId: string,
): Promise<InvestigationRow | null> {
  const rows = await db
    .select({
      investigationId: investigations.investigationId,
      farmId: investigations.farmId,
      initiatedBy: investigations.initiatedBy,
      clusterId: investigations.clusterId,
      status: investigations.status,
      feverAnimals: investigations.feverAnimals,
      radiusSummary: investigations.radiusSummary,
      contactNetwork: investigations.contactNetwork,
      weather: investigations.weather,
      nearbyAbnormalFarms: investigations.nearbyAbnormalFarms,
      fieldObservations: investigations.fieldObservations,
      createdAt: investigations.createdAt,
      updatedAt: investigations.updatedAt,
      // farm JOIN
      farmName: farms.name,
      farmAddress: farms.address,
      farmOwnerName: farms.ownerName,
      farmPhone: farms.phone,
      farmLat: farms.lat,
      farmLng: farms.lng,
      farmHeadCount: farms.currentHeadCount,
    })
    .from(investigations)
    .innerJoin(farms, eq(investigations.farmId, farms.farmId))
    .where(eq(investigations.investigationId, investigationId))
    .limit(1);

  return rows[0] ?? null;
}

// ======================================================================
// SELECT by farmId
// ======================================================================

export async function getInvestigationsByFarm(
  db: DB,
  farmId: string,
): Promise<readonly InvestigationSummaryRow[]> {
  return db
    .select({
      investigationId: investigations.investigationId,
      farmId: investigations.farmId,
      status: investigations.status,
      nearbyAbnormalFarms: investigations.nearbyAbnormalFarms,
      fieldObservations: investigations.fieldObservations,
      createdAt: investigations.createdAt,
      updatedAt: investigations.updatedAt,
    })
    .from(investigations)
    .where(eq(investigations.farmId, farmId))
    .orderBy(desc(investigations.createdAt));
}

// ======================================================================
// LIST with filters
// ======================================================================

export async function listInvestigations(
  db: DB,
  filters?: {
    readonly status?: string;
    readonly since?: Date;
    readonly limit?: number;
  },
): Promise<readonly InvestigationSummaryRow[]> {
  const conditions: ReturnType<typeof eq>[] = [];

  if (filters?.status) {
    conditions.push(eq(investigations.status, filters.status));
  }
  if (filters?.since) {
    conditions.push(gte(investigations.createdAt, filters.since));
  }

  const query = db
    .select({
      investigationId: investigations.investigationId,
      farmId: investigations.farmId,
      status: investigations.status,
      nearbyAbnormalFarms: investigations.nearbyAbnormalFarms,
      fieldObservations: investigations.fieldObservations,
      createdAt: investigations.createdAt,
      updatedAt: investigations.updatedAt,
    })
    .from(investigations)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(investigations.createdAt))
    .limit(filters?.limit ?? 50);

  return query;
}

// ======================================================================
// UPDATE (status, fieldObservations)
// ======================================================================

export async function updateInvestigation(
  db: DB,
  investigationId: string,
  patch: {
    readonly fieldObservations?: string;
    readonly status?: InvestigationStatus;
  },
): Promise<InvestigationRow | null> {
  const [updated] = await db
    .update(investigations)
    .set({
      ...(patch.fieldObservations !== undefined ? { fieldObservations: patch.fieldObservations } : {}),
      ...(patch.status !== undefined ? { status: patch.status } : {}),
      updatedAt: new Date(),
    })
    .where(eq(investigations.investigationId, investigationId))
    .returning({ investigationId: investigations.investigationId });

  if (!updated) return null;

  return getInvestigationById(db, investigationId);
}

// ======================================================================
// Row 타입
// ======================================================================

export interface InvestigationRow {
  readonly investigationId: string;
  readonly farmId: string;
  readonly initiatedBy: string | null;
  readonly clusterId: string | null;
  readonly status: string;
  readonly feverAnimals: unknown;
  readonly radiusSummary: unknown;
  readonly contactNetwork: unknown;
  readonly weather: unknown;
  readonly nearbyAbnormalFarms: number;
  readonly fieldObservations: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly farmName: string;
  readonly farmAddress: string;
  readonly farmOwnerName: string | null;
  readonly farmPhone: string | null;
  readonly farmLat: number;
  readonly farmLng: number;
  readonly farmHeadCount: number;
}

export interface InvestigationSummaryRow {
  readonly investigationId: string;
  readonly farmId: string;
  readonly status: string;
  readonly nearbyAbnormalFarms: number;
  readonly fieldObservations: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}
