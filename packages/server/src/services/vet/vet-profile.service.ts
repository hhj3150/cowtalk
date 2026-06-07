// 수의사 면허/병원 마스터 — 문서 발행 시 면허번호·병원정보 자동 기입 원천.
import { getDb } from '../../config/database.js';
import { veterinarianProfiles } from '../../db/schema.js';
import { eq } from 'drizzle-orm';
import { logger } from '../../lib/logger.js';

export interface VetProfile {
  readonly licenseNumber: string | null;
  readonly clinicName: string | null;
  readonly clinicAddress: string | null;
  readonly clinicPhone: string | null;
  readonly updatedAt: string | null;
}

export async function getVetProfile(userId: string): Promise<VetProfile | null> {
  const db = getDb();
  const [row] = await db.select().from(veterinarianProfiles)
    .where(eq(veterinarianProfiles.userId, userId)).limit(1);
  if (!row) return null;
  return {
    licenseNumber: row.licenseNumber ?? null,
    clinicName: row.clinicName ?? null,
    clinicAddress: row.clinicAddress ?? null,
    clinicPhone: row.clinicPhone ?? null,
    updatedAt: row.updatedAt ? row.updatedAt.toISOString() : null,
  };
}

export interface UpsertVetProfileInput {
  readonly licenseNumber?: string | null;
  readonly clinicName?: string | null;
  readonly clinicAddress?: string | null;
  readonly clinicPhone?: string | null;
}

export async function upsertVetProfile(userId: string, input: UpsertVetProfileInput): Promise<VetProfile> {
  const db = getDb();
  const values = {
    userId,
    licenseNumber: input.licenseNumber ?? null,
    clinicName: input.clinicName ?? null,
    clinicAddress: input.clinicAddress ?? null,
    clinicPhone: input.clinicPhone ?? null,
    updatedAt: new Date(),
  };
  await db.insert(veterinarianProfiles).values(values)
    .onConflictDoUpdate({
      target: veterinarianProfiles.userId,
      set: {
        licenseNumber: values.licenseNumber,
        clinicName: values.clinicName,
        clinicAddress: values.clinicAddress,
        clinicPhone: values.clinicPhone,
        updatedAt: values.updatedAt,
      },
    });
  logger.info({ userId }, '[VetCenter] 수의사 면허/병원 마스터 저장');
  const saved = await getVetProfile(userId);
  return saved as VetProfile;
}
