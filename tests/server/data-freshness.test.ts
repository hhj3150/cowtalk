// 데이터 신선도 서비스 — 소스별 판정 + 팅커벨 주입 라인

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { getDataFreshness, formatFreshnessLine, clearFreshnessCache } from '@server/services/metrics/data-freshness.service.js';
import { getDb, closeDb } from '@server/config/database.js';
import { regions, farms, animals, smaxtecEvents, sensorMeasurements } from '@server/db/schema.js';
import { eq } from 'drizzle-orm';

let regionId: string;
let farmId: string;
let animalId: string;
let eventId: string;

beforeAll(async () => {
  const db = getDb();
  const [region] = await db.insert(regions).values({
    province: '테스트도', district: '신선군', code: `F${String(Date.now()).slice(-8)}`,
  }).returning();
  regionId = region!.regionId;
  const [farm] = await db.insert(farms).values({
    regionId, name: '신선도목장', address: '주소', lat: 37, lng: 127,
  }).returning();
  farmId = farm!.farmId;
  const [animal] = await db.insert(animals).values({
    farmId, earTag: `F-${String(Date.now()).slice(-6)}`,
  }).returning();
  animalId = animal!.animalId;
  // 방금 수집된 이벤트 — smaxtec_events는 live 판정이어야 함
  const [event] = await db.insert(smaxtecEvents).values({
    animalId, farmId, eventType: 'estrus', detectedAt: new Date(),
  }).returning();
  eventId = event!.eventId;
  // 파이프라인이 저장하는 실제 metric_type은 'temperature' (smaXtec 원어 'temp' 아님)
  await db.insert(sensorMeasurements).values({
    animalId, timestamp: new Date(), metricType: 'temperature', value: 38.6,
  });
  clearFreshnessCache();
});

afterAll(async () => {
  const db = getDb();
  await db.delete(sensorMeasurements).where(eq(sensorMeasurements.animalId, animalId));
  await db.delete(smaxtecEvents).where(eq(smaxtecEvents.eventId, eventId));
  await db.delete(animals).where(eq(animals.animalId, animalId));
  await db.delete(farms).where(eq(farms.farmId, farmId));
  await db.delete(regions).where(eq(regions.regionId, regionId));
  clearFreshnessCache();
  await closeDb();
});

describe('getDataFreshness', () => {
  it('5개 소스 전부 판정 + 방금 넣은 이벤트는 live', async () => {
    const report = await getDataFreshness();
    expect(report.sources).toHaveLength(5);
    for (const s of report.sources) {
      expect(['live', 'delayed', 'stale', 'none']).toContain(s.status);
    }
    const events = report.sources.find((s) => s.source === 'smaxtec_events');
    expect(events?.status).toBe('live');
    expect(events?.ageMinutes).toBeLessThanOrEqual(5);

    // 센서는 'temperature' 타입으로 저장된 방금 데이터가 잡혀야 함 ('temp'로 조회하면 none이 되는 회귀 방지)
    const sensors = report.sources.find((s) => s.source === 'smaxtec_sensors');
    expect(sensors?.status).toBe('live');
  });

  it('60초 캐시 — 같은 리포트 재사용', async () => {
    const a = await getDataFreshness();
    const b = await getDataFreshness();
    expect(b.checkedAt).toBe(a.checkedAt);
  });
});

describe('formatFreshnessLine', () => {
  it('팅커벨 주입용 한 줄 — 센서·이벤트·파이프라인 포함', async () => {
    clearFreshnessCache();
    const line = formatFreshnessLine(await getDataFreshness());
    expect(line).toContain('데이터 신선도');
    expect(line).toContain('이벤트');
    expect(line).toContain('파이프라인');
  });

  it('비실시간이면 기준 시점 명시 지시가 붙는다', async () => {
    clearFreshnessCache();
    const report = await getDataFreshness();
    const line = formatFreshnessLine(report);
    if (report.overall !== 'live') {
      expect(line).toContain('기준 시점을 명시');
    }
  });
});
