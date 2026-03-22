// 지역명 없는 농장들을 전국 주요 축산 지역에 분산 배치
// 실행: npx tsx packages/server/src/scripts/geocode-remaining.ts

import { getDb } from '../config/database.js';
import { farms } from '../db/schema.js';
import { eq, and } from 'drizzle-orm';

// 주요 축산 지역 (충남, 경기, 강원, 전북, 경북 등)
const LIVESTOCK_REGIONS = [
  { name: '천안', lat: 36.815, lng: 127.114 },
  { name: '홍성', lat: 36.601, lng: 126.660 },
  { name: '논산', lat: 36.187, lng: 127.099 },
  { name: '서산', lat: 36.785, lng: 126.450 },
  { name: '예산', lat: 36.683, lng: 126.850 },
  { name: '이천', lat: 37.272, lng: 127.435 },
  { name: '여주', lat: 37.298, lng: 127.637 },
  { name: '평택', lat: 36.992, lng: 127.112 },
  { name: '가평', lat: 37.831, lng: 127.510 },
  { name: '정읍', lat: 35.570, lng: 126.856 },
  { name: '남원', lat: 35.416, lng: 127.390 },
  { name: '상주', lat: 36.411, lng: 128.159 },
  { name: '의성', lat: 36.353, lng: 128.697 },
  { name: '횡성', lat: 37.489, lng: 127.985 },
  { name: '괴산', lat: 36.815, lng: 127.786 },
];

async function main() {
  const db = getDb();

  const targets = await db
    .select({ farmId: farms.farmId, name: farms.name })
    .from(farms)
    .where(and(eq(farms.lat, 36.5), eq(farms.lng, 127.5)));

  console.log(`남은 농장: ${targets.length}개\n`);

  for (let i = 0; i < targets.length; i++) {
    const farm = targets[i]!;
    const region = LIVESTOCK_REGIONS[i % LIVESTOCK_REGIONS.length]!;

    // 같은 지역 내 offset (겹침 방지)
    const offset = Math.floor(i / LIVESTOCK_REGIONS.length);
    const angle = (offset * 137.508) * (Math.PI / 180);
    const r = 0.01 + offset * 0.005;
    const lat = Math.round((region.lat + r * Math.cos(angle)) * 1_000_000) / 1_000_000;
    const lng = Math.round((region.lng + r * Math.sin(angle)) * 1_000_000) / 1_000_000;

    await db
      .update(farms)
      .set({ lat, lng })
      .where(eq(farms.farmId, farm.farmId));

    console.log(`✅ "${farm.name}" → ${region.name} (${lat}, ${lng})`);
  }

  const remaining = await db
    .select({ lat: farms.lat })
    .from(farms)
    .where(and(eq(farms.lat, 36.5), eq(farms.lng, 127.5)));

  console.log(`\n남은 기본좌표 농장: ${remaining.length}개`);
  process.exit(0);
}

main().catch((error) => {
  console.error('Script failed:', error);
  process.exit(1);
});
