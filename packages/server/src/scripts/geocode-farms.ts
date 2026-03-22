// 농장명에서 지역명을 추출 → 시군구 좌표 테이블로 DB 업데이트
// 실행: npx tsx packages/server/src/scripts/geocode-farms.ts

import { getDb } from '../config/database.js';
import { farms } from '../db/schema.js';
import { eq, and } from 'drizzle-orm';

// ── 한국 시군구 중심 좌표 (시청/군청 기준) ──

const REGION_COORDS: Record<string, { lat: number; lng: number }> = {
  // 수도권
  서울: { lat: 37.5665, lng: 126.978 },
  인천: { lat: 37.4563, lng: 126.7052 },
  수원: { lat: 37.2636, lng: 127.0286 },
  안성: { lat: 37.008, lng: 127.2797 },
  화성: { lat: 37.1996, lng: 126.8312 },
  포천: { lat: 37.8949, lng: 127.2003 },
  파주: { lat: 37.7599, lng: 126.7796 },
  양주: { lat: 37.785, lng: 127.0456 },
  연천: { lat: 38.0963, lng: 127.0753 },
  김포: { lat: 37.6153, lng: 126.7156 },
  양평: { lat: 37.4917, lng: 127.4877 },
  강화: { lat: 37.7469, lng: 126.4879 },

  // 강원
  횡성: { lat: 37.4887, lng: 127.9848 },
  홍천: { lat: 37.6973, lng: 127.8883 },
  춘천: { lat: 37.8813, lng: 127.7298 },
  원주: { lat: 37.3422, lng: 127.9202 },
  철원: { lat: 38.1468, lng: 127.3133 },

  // 충북
  청주: { lat: 36.6424, lng: 127.489 },
  보은: { lat: 36.4893, lng: 127.7293 },
  음성: { lat: 36.9395, lng: 127.6908 },
  충주: { lat: 36.9911, lng: 127.9259 },
  진천: { lat: 36.8553, lng: 127.4352 },

  // 충남
  천안: { lat: 36.8151, lng: 127.1139 },
  보령: { lat: 36.3334, lng: 126.6129 },
  예산: { lat: 36.6827, lng: 126.8498 },
  청양: { lat: 36.4593, lng: 126.8022 },
  금산: { lat: 36.1089, lng: 127.488 },
  공주: { lat: 36.4465, lng: 127.1189 },
  대전: { lat: 36.3504, lng: 127.3845 },
  세종: { lat: 36.48, lng: 127.2489 },

  // 경북
  영주: { lat: 36.8057, lng: 128.6241 },
  안동: { lat: 36.5684, lng: 128.7228 },
  구미: { lat: 36.1198, lng: 128.3443 },
  칠곡: { lat: 35.9955, lng: 128.4017 },
  포항: { lat: 36.019, lng: 129.3435 },
  청도: { lat: 35.6473, lng: 128.7341 },
  경주: { lat: 35.8562, lng: 129.2247 },
  김천: { lat: 36.1398, lng: 128.1136 },
  상주: { lat: 36.4108, lng: 128.1591 },
  문경: { lat: 36.5865, lng: 128.1865 },
  영천: { lat: 35.9733, lng: 128.9385 },

  // 전북
  익산: { lat: 35.9483, lng: 126.9577 },
  김제: { lat: 35.8035, lng: 126.8809 },

  // 전남
  영암: { lat: 34.7987, lng: 126.6969 },
  나주: { lat: 35.0158, lng: 126.7108 },
  함평: { lat: 35.0659, lng: 126.5169 },

  // 경남
  창녕: { lat: 35.5445, lng: 128.4914 },
  대구: { lat: 35.8714, lng: 128.6014 },

  // 제주
  제주: { lat: 33.4996, lng: 126.5312 },

  // 기타 특수
  서운: { lat: 37.0042, lng: 127.2586 }, // 안성 서운면
  미양: { lat: 36.6106, lng: 127.0218 }, // 아산 미양
};

// ── 지역명 추출 ──

function extractRegion(name: string): string | null {
  // 1. 괄호 안 지역명: "목장(포천)" → "포천"
  const parenMatch = name.match(/\(([가-힣]+)\)/);
  if (parenMatch) {
    const candidate = parenMatch[1]!;
    if (!candidate.includes('병원') && !candidate.includes('낙농')) {
      if (REGION_COORDS[candidate]) return candidate;
    }
  }

  // 2. 대학교/기관 → 소재지
  const institutionMap: Record<string, string> = {
    '충남대': '대전',
    '서울대': '서울',
    '건국대': '서울',
    '중앙대': '서울',
    '공주대': '공주',
    '경북축산기술연구소': '영천',
  };

  for (const [key, region] of Object.entries(institutionMap)) {
    if (name.includes(key)) return region;
  }

  // 3. 이름 안에 알려진 지역 키워드 (긴 것 먼저 매칭)
  const sortedRegions = Object.keys(REGION_COORDS).sort((a, b) => b.length - a.length);
  for (const region of sortedRegions) {
    if (name.includes(region)) return region;
  }

  return null;
}

// ── 메인 ──

async function main() {
  const db = getDb();

  // 기본 좌표(36.5, 127.5)인 농장만 대상
  const targetFarms = await db
    .select({ farmId: farms.farmId, name: farms.name })
    .from(farms)
    .where(and(eq(farms.lat, 36.5), eq(farms.lng, 127.5)));

  console.log(`대상 농장: ${targetFarms.length}개\n`);

  let updated = 0;
  let skipped = 0;

  // 같은 지역에 여러 농장이 있으면 약간의 offset을 줘서 겹치지 않게
  const regionCounts = new Map<string, number>();

  for (const farm of targetFarms) {
    const region = extractRegion(farm.name);

    if (!region) {
      console.log(`⏭  "${farm.name}" — 지역명 추출 불가`);
      skipped += 1;
      continue;
    }

    const coords = REGION_COORDS[region];
    if (!coords) {
      console.log(`⏭  "${farm.name}" — "${region}" 좌표 없음`);
      skipped += 1;
      continue;
    }

    // 같은 지역 내 농장끼리 약간 offset (반경 ~0.5~3km 내 분산)
    const count = regionCounts.get(region) ?? 0;
    regionCounts.set(region, count + 1);

    const angle = (count * 137.508) * (Math.PI / 180); // 황금각 분산
    const radius = 0.005 + count * 0.003; // ~0.5km~3km offset
    const lat = coords.lat + radius * Math.cos(angle);
    const lng = coords.lng + radius * Math.sin(angle);

    const roundedLat = Math.round(lat * 1_000_000) / 1_000_000;
    const roundedLng = Math.round(lng * 1_000_000) / 1_000_000;

    await db
      .update(farms)
      .set({ lat: roundedLat, lng: roundedLng })
      .where(eq(farms.farmId, farm.farmId));

    console.log(`✅ "${farm.name}" → ${region} (${roundedLat}, ${roundedLng})`);
    updated += 1;
  }

  console.log(`\n완료: ${updated}개 업데이트, ${skipped}개 스킵`);

  // 결과 확인
  const remaining = await db
    .select({ lat: farms.lat, lng: farms.lng })
    .from(farms)
    .where(and(eq(farms.lat, 36.5), eq(farms.lng, 127.5)));

  console.log(`남은 기본좌표 농장: ${remaining.length}개`);

  // 좌표 분포 확인
  const allCoords = await db
    .select({ lat: farms.lat, lng: farms.lng, name: farms.name })
    .from(farms);

  const uniqueCoords = new Set(allCoords.map((f) => `${f.lat},${f.lng}`));
  console.log(`고유 좌표 수: ${uniqueCoords.size}개 (전체 ${allCoords.length}개 농장)`);

  process.exit(0);
}

main().catch((error) => {
  console.error('Script failed:', error);
  process.exit(1);
});
