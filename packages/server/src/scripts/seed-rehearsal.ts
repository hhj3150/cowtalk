// 리허설/데모 시드 확장 — 실제 경기도 규모(~50 농장)에 맞춰 로컬 데모를 현실화 + 번식 임신감정
//  1) 경기도 농장을 ~50개로 보장(시군별 실좌표)
//  2) 새 농장에 젖소 개체(센서 장착) 부여
//  3) 모든 개체에 분만 이벤트(없으면) + 일부 임신감정 → 번식 칸반 임신확인/후기/분만예정 채움
// 멱등: 재실행해도 중복 없음(경기 농장 수·DEMO 마커·기존 임신감정 기준).
//
// 실행: tsx src/scripts/seed-rehearsal.ts

import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { getDatabaseUrl } from '../config/index';
import * as schema from '../db/schema';

const GG_REGION = '594f33eb-7df6-4bce-8fc9-552d29da1fce'; // 경기도(화성) region
const SIGUN: ReadonlyArray<readonly [string, number, number]> = [
  ['포천', 37.895, 127.200], ['연천', 38.096, 127.075], ['안성', 37.008, 127.279],
  ['이천', 37.272, 127.435], ['여주', 37.298, 127.637], ['화성', 37.199, 126.831],
  ['평택', 36.992, 127.112], ['양평', 37.491, 127.487], ['가평', 37.831, 127.510],
  ['파주', 37.760, 126.780], ['김포', 37.615, 126.715], ['용인', 37.241, 127.178],
  ['광주', 37.429, 127.255], ['남양주', 37.636, 127.216], ['양주', 37.785, 127.046],
];
const COW = ['별이', '달이', '구름이', '솔이', '꽃이', '은별', '초롱이', '다솜이', '나비', '두리', '새별', '가을', '봄이', '햇살이', '미소'];

function rand(a: number, b: number): number { return a + Math.random() * (b - a); }
function ri(a: number, b: number): number { return Math.floor(rand(a, b + 1)); }
function daysAgo(d: number): Date { return new Date(Date.now() - d * 86_400_000); }

async function main(): Promise<void> {
  const dbsql = postgres(getDatabaseUrl());
  const db = drizzle(dbsql, { schema });
  try {
    // 1. 경기 농장 ~50 보장
    const ggRows = await dbsql`SELECT count(*)::int AS c FROM farms f JOIN regions r ON r.region_id=f.region_id WHERE r.province='경기도' AND f.status='active'`;
    const GG_TARGET = 52; // 운영 실데이터 기준 경기도 농장 수
    const toAdd = Math.max(0, GG_TARGET - Number(ggRows[0]?.c ?? 0));
    let newFarmIds: string[] = [];
    if (toAdd > 0) {
      const farms = Array.from({ length: toAdd }, (_, i) => {
        const [nm, lat, lng] = SIGUN[i % SIGUN.length]!;
        const round = Math.floor(i / SIGUN.length) + 1;
        return {
          regionId: GG_REGION, name: `${nm}${round}목장`,
          address: `경기도 ${nm}시 목장로 ${ri(1, 300)}`,
          lat: lat + rand(-0.04, 0.04), lng: lng + rand(-0.04, 0.04),
          capacity: ri(100, 400), currentHeadCount: ri(40, 220), status: 'active',
          ownerName: `${nm}농장주`, phone: `031-${ri(200, 999)}-${ri(1000, 9999)}`,
        };
      });
      const inserted = await db.insert(schema.farms).values(farms).returning({ farmId: schema.farms.farmId });
      newFarmIds = inserted.map((f) => f.farmId);

      // 2. 새 농장 개체(젖소·센서 장착)
      const animalRows: Array<typeof schema.animals.$inferInsert> = [];
      let idx = 0;
      for (const farmId of newFarmIds) {
        const n = ri(6, 12);
        for (let j = 0; j < n; j++) {
          idx++;
          const parity = ri(1, 5);
          const dim = ri(20, 300);
          animalRows.push({
            farmId, earTag: `GG-${String(idx).padStart(4, '0')}`, name: `${COW[idx % COW.length]!}${idx}`,
            breed: 'holstein', breedType: 'dairy', sex: 'female', parity, daysInMilk: dim,
            lactationStatus: dim > 250 ? 'dry' : 'milking', status: 'active',
            currentDeviceId: `DEMO-GG-${idx}`,
          });
        }
      }
      if (animalRows.length > 0) await db.insert(schema.animals).values(animalRows);
      console.info(`  - 경기 농장 +${newFarmIds.length}, 개체 +${animalRows.length}`);
    } else {
      console.info('  - 경기 농장 이미 충분 — 농장 추가 스킵');
    }

    const allAnimals = await db.select({ animalId: schema.animals.animalId, farmId: schema.animals.farmId }).from(schema.animals);

    // 3. 분만 이벤트(없는 개체만) — open 개체 공태일 현실화
    const calvExist = await dbsql`SELECT DISTINCT animal_id FROM smaxtec_events WHERE external_event_id LIKE 'DEMO-CALV-%'`;
    const calvSet = new Set(calvExist.map((r) => String(r.animal_id)));
    const calvRows: Array<typeof schema.smaxtecEvents.$inferInsert> = [];
    for (const a of allAnimals) {
      if (calvSet.has(a.animalId)) continue;
      const recent = rand(70, 130); const prev = recent + rand(380, 410);
      calvRows.push({ animalId: a.animalId, farmId: a.farmId, eventType: 'calving', externalEventId: `DEMO-CALV0-${a.animalId}`, confidence: 0.96, severity: 'low', detectedAt: daysAgo(prev), acknowledged: true });
      calvRows.push({ animalId: a.animalId, farmId: a.farmId, eventType: 'calving', externalEventId: `DEMO-CALV-${a.animalId}`, confidence: 0.96, severity: 'low', detectedAt: daysAgo(recent), acknowledged: true });
    }
    if (calvRows.length > 0) await db.insert(schema.smaxtecEvents).values(calvRows);

    // 4. 임신감정(없는 개체 중 ~35% pregnant, 단계 분산) → 칸반 임신확인/후기/분만예정
    const pregExist = await dbsql`SELECT DISTINCT animal_id FROM pregnancy_checks`;
    const pregSet = new Set(pregExist.map((r) => String(r.animal_id)));
    const pregRows: Array<typeof schema.pregnancyChecks.$inferInsert> = [];
    for (const a of allAnimals) {
      if (pregSet.has(a.animalId)) continue;
      if (Math.random() >= 0.35) continue;
      const s = Math.random();
      const ago = s < 0.5 ? rand(20, 150) : s < 0.8 ? rand(165, 215) : rand(225, 245); // 확인/후기/분만예정
      pregRows.push({ animalId: a.animalId, checkDate: daysAgo(ago), result: 'pregnant', method: 'ultrasound', daysPostInsemination: ri(30, 60), notes: '데모 임신감정' });
    }
    if (pregRows.length > 0) await db.insert(schema.pregnancyChecks).values(pregRows);

    console.info(`  - 분만 +${calvRows.length}건, 임신감정 +${pregRows.length}건`);
    console.info('리허설 시드 완료.');
  } catch (e) {
    console.error('리허설 시드 실패:', e); throw e;
  } finally {
    await dbsql.end();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
