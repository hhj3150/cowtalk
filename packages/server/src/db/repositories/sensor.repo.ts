// Sensor Repository

import { eq, and, gte, lte, desc } from 'drizzle-orm';
import { getDb } from '../../config/database';
import { sensorMeasurements, sensorDevices } from '../schema';

type MeasurementRow = typeof sensorMeasurements.$inferSelect;
type DeviceRow = typeof sensorDevices.$inferSelect;

export async function findMeasurements(
  animalId: string,
  metricType?: string,
  from?: Date,
  to?: Date,
  limit = 500,
): Promise<readonly MeasurementRow[]> {
  const db = getDb();
  const conditions = [eq(sensorMeasurements.animalId, animalId)];

  if (metricType) {
    conditions.push(eq(sensorMeasurements.metricType, metricType));
  }
  if (from) {
    conditions.push(gte(sensorMeasurements.timestamp, from));
  }
  if (to) {
    conditions.push(lte(sensorMeasurements.timestamp, to));
  }

  return db
    .select()
    .from(sensorMeasurements)
    .where(and(...conditions))
    .orderBy(desc(sensorMeasurements.timestamp))
    .limit(limit);
}

export async function insertMeasurements(
  data: readonly (typeof sensorMeasurements.$inferInsert)[],
): Promise<number> {
  if (data.length === 0) return 0;
  const db = getDb();
  const rows = await db.insert(sensorMeasurements).values([...data]).returning();
  return rows.length;
}

export async function findDevicesByAnimal(animalId: string): Promise<readonly DeviceRow[]> {
  const db = getDb();
  return db
    .select()
    .from(sensorDevices)
    .where(eq(sensorDevices.animalId, animalId));
}

export async function getLatestMeasurement(
  animalId: string,
  metricType: string,
): Promise<MeasurementRow | undefined> {
  const db = getDb();
  const result = await db
    .select()
    .from(sensorMeasurements)
    .where(
      and(
        eq(sensorMeasurements.animalId, animalId),
        eq(sensorMeasurements.metricType, metricType),
      ),
    )
    .orderBy(desc(sensorMeasurements.timestamp))
    .limit(1);
  return result[0];
}
