// 씨수소(정액) 카탈로그 시딩 + 공공데이터 동기화 서비스
//
// 젖소(Holstein): KAI 보증씨수소 주요 종모우 + 해외 주요 종모우 (ABS·CRI·Semex·Alta)
// 한우: 농촌진흥청 공공데이터 API (15101999) → 주 1회 동기화
//
// 참고:
//  KAI 보증씨수소 자료: https://www.nias.go.kr/front/prboardList.do
//  공공데이터 API: https://apis.data.go.kr/1390906/brblInfo_gong/getList_brblInfo

import { getDb } from '../../config/database.js';
import { semenCatalog } from '../../db/schema.js';
import { eq, count } from 'drizzle-orm';
import { logger } from '../../lib/logger.js';
import { config } from '../../config/index.js';
import { SemenConnector } from '../../pipeline/connectors/public-data/semen.connector.js';

// ===========================
// 젖소 종모우 기초 데이터 (KAI 보증씨수소 + 해외 주요 종모우)
// genomicTraits: { milk(유량 kg), fat(유지방 kg), protein(유단백 kg), scs(체세포, 낮을수록 좋), dpr(임신율%), pl(생산수명) }
// ===========================

const DAIRY_BULLS_SEED = [
  // ── KAI 한국 보증씨수소 ──
  {
    bullName: '슈퍼샷 KH2024-001', bullRegistration: 'KH2024-001',
    breed: 'Holstein', supplier: '한국종축개량협회(KAI)',
    pricePerStraw: 15000,
    genomicTraits: { milk: 1250, fat: 48, protein: 38, scs: 2.72, dpr: 1.2, pl: 3.1, type: 2.1 },
    availableStraws: 500,
  },
  {
    bullName: '한빛 KH2023-089', bullRegistration: 'KH2023-089',
    breed: 'Holstein', supplier: '한국종축개량협회(KAI)',
    pricePerStraw: 12000,
    genomicTraits: { milk: 980, fat: 42, protein: 35, scs: 2.81, dpr: 1.5, pl: 2.8, type: 1.8 },
    availableStraws: 800,
  },
  {
    bullName: '천둥 KH2023-041', bullRegistration: 'KH2023-041',
    breed: 'Holstein', supplier: '한국종축개량협회(KAI)',
    pricePerStraw: 13000,
    genomicTraits: { milk: 1100, fat: 45, protein: 36, scs: 2.65, dpr: 0.8, pl: 2.5, type: 2.4 },
    availableStraws: 350,
  },
  {
    bullName: '백두 KH2022-112', bullRegistration: 'KH2022-112',
    breed: 'Holstein', supplier: '한국종축개량협회(KAI)',
    pricePerStraw: 11000,
    genomicTraits: { milk: 850, fat: 38, protein: 33, scs: 2.95, dpr: 2.1, pl: 3.5, type: 1.5 },
    availableStraws: 1200,
  },
  // ── 해외 수입 종모우 ──
  {
    bullName: 'Hotline (ABS)', bullRegistration: 'HO840003127754524',
    breed: 'Holstein', supplier: 'ABS Global',
    pricePerStraw: 28000,
    genomicTraits: { milk: 1580, fat: 62, protein: 52, scs: 2.58, dpr: 1.0, pl: 3.8, type: 2.8 },
    availableStraws: 200,
  },
  {
    bullName: 'Supershot (Semex)', bullRegistration: 'HO840003012574152',
    breed: 'Holstein', supplier: 'Semex Korea',
    pricePerStraw: 32000,
    genomicTraits: { milk: 1320, fat: 55, protein: 45, scs: 2.61, dpr: 1.3, pl: 4.2, type: 3.5 },
    availableStraws: 150,
  },
  {
    bullName: 'Tracer (CRI)', bullRegistration: 'HO840003134352681',
    breed: 'Holstein', supplier: 'CRI Korea',
    pricePerStraw: 25000,
    genomicTraits: { milk: 1420, fat: 59, protein: 48, scs: 2.55, dpr: 0.5, pl: 2.9, type: 2.2 },
    availableStraws: 300,
  },
  {
    bullName: 'AltaZazzle (Alta)', bullRegistration: 'HO840003140986498',
    breed: 'Holstein', supplier: 'Alta Genetics Korea',
    pricePerStraw: 30000,
    genomicTraits: { milk: 1650, fat: 65, protein: 55, scs: 2.48, dpr: -0.2, pl: 2.6, type: 1.9 },
    availableStraws: 180,
  },
  {
    bullName: 'Coldplay (Semex)', bullRegistration: 'HO840003138799154',
    breed: 'Holstein', supplier: 'Semex Korea',
    pricePerStraw: 29000,
    genomicTraits: { milk: 1180, fat: 51, protein: 41, scs: 2.70, dpr: 1.8, pl: 4.5, type: 2.6 },
    availableStraws: 250,
  },
  {
    bullName: 'Yaron (ABS)', bullRegistration: 'HO840003148377261',
    breed: 'Holstein', supplier: 'ABS Global',
    pricePerStraw: 27000,
    genomicTraits: { milk: 1090, fat: 47, protein: 39, scs: 2.62, dpr: 2.5, pl: 5.1, type: 1.7 },
    availableStraws: 400,
  },
  // ── 성감별 정액 ──
  {
    bullName: 'Hotline (ABS) 성감별', bullRegistration: 'HO840003127754524-SX',
    breed: 'Holstein', supplier: 'ABS Global (성감별)',
    pricePerStraw: 68000,
    genomicTraits: { milk: 1580, fat: 62, protein: 52, scs: 2.58, dpr: 1.0, pl: 3.8, type: 2.8 },
    availableStraws: 80,
  },
  {
    bullName: 'Supershot (Semex) 성감별', bullRegistration: 'HO840003012574152-SX',
    breed: 'Holstein', supplier: 'Semex Korea (성감별)',
    pricePerStraw: 75000,
    genomicTraits: { milk: 1320, fat: 55, protein: 45, scs: 2.61, dpr: 1.3, pl: 4.2, type: 3.5 },
    availableStraws: 60,
  },
] as const;

// 한우 기초 데이터 (공공API 전 초기 시딩 — 실제 보증씨수소)
const HANWOO_BULLS_SEED = [
  {
    bullName: '타워 KPN1148', bullRegistration: 'KPN1148',
    breed: '한우', supplier: '한우개량사업소',
    pricePerStraw: 8000,
    genomicTraits: { marbling: 4.2, backfat: -0.3, loin: 1.8, retail: 62.1 },
    availableStraws: 1000,
  },
  {
    bullName: '용산 KPN1186', bullRegistration: 'KPN1186',
    breed: '한우', supplier: '한우개량사업소',
    pricePerStraw: 8000,
    genomicTraits: { marbling: 3.9, backfat: -0.2, loin: 2.1, retail: 61.8 },
    availableStraws: 800,
  },
  {
    bullName: '위너 KPN1215', bullRegistration: 'KPN1215',
    breed: '한우', supplier: '한우개량사업소',
    pricePerStraw: 9000,
    genomicTraits: { marbling: 4.5, backfat: -0.4, loin: 1.5, retail: 60.9 },
    availableStraws: 600,
  },
  {
    bullName: '파워 KPN1094', bullRegistration: 'KPN1094',
    breed: '한우', supplier: '한우개량사업소',
    pricePerStraw: 7500,
    genomicTraits: { marbling: 3.6, backfat: -0.1, loin: 2.5, retail: 63.2 },
    availableStraws: 1500,
  },
  {
    bullName: '설악 KPN1061', bullRegistration: 'KPN1061',
    breed: '한우', supplier: '한우개량사업소',
    pricePerStraw: 7500,
    genomicTraits: { marbling: 3.4, backfat: 0.1, loin: 2.8, retail: 64.1 },
    availableStraws: 2000,
  },
] as const;

// ===========================
// 카탈로그 시딩 (최초 1회 or 비어있을 때)
// ===========================

export async function seedSemenCatalog(): Promise<{ seeded: number; skipped: number }> {
  const db = getDb();

  const countResult = await db
    .select({ value: count() })
    .from(semenCatalog);
  const existingCount = countResult[0]?.value ?? 0;

  if (Number(existingCount) >= 5) {
    logger.info({ count: existingCount }, '[SemenSeed] 카탈로그 이미 존재 — 시딩 스킵');
    return { seeded: 0, skipped: Number(existingCount) };
  }

  let seeded = 0;

  const allBulls = [
    ...DAIRY_BULLS_SEED.map((b) => ({ ...b, genomicTraits: b.genomicTraits as Record<string, number> })),
    ...HANWOO_BULLS_SEED.map((b) => ({ ...b, genomicTraits: b.genomicTraits as Record<string, number> })),
  ];

  for (const bull of allBulls) {
    try {
      // 이름 중복 체크
      const [dup] = await db
        .select({ id: semenCatalog.semenId })
        .from(semenCatalog)
        .where(eq(semenCatalog.bullName, bull.bullName))
        .limit(1);

      if (dup) continue;

      await db.insert(semenCatalog).values({
        bullName: bull.bullName,
        bullRegistration: bull.bullRegistration,
        breed: bull.breed,
        supplier: bull.supplier,
        pricePerStraw: bull.pricePerStraw,
        genomicTraits: bull.genomicTraits,
        availableStraws: bull.availableStraws,
        isActive: true,
      });
      seeded++;
    } catch (err) {
      logger.warn({ err, bullName: bull.bullName }, '[SemenSeed] 삽입 오류');
    }
  }

  logger.info({ seeded, total: allBulls.length }, '[SemenSeed] 씨수소 카탈로그 시딩 완료');
  return { seeded, skipped: Number(existingCount) };
}

// ===========================
// 공공 API → 한우 씨수소 동기화 (주 1회)
// ===========================

export async function syncHanwooSemenFromPublicApi(): Promise<{ synced: number }> {
  if (!config.PUBLIC_DATA_API_KEY) {
    logger.warn('[SemenSync] PUBLIC_DATA_API_KEY 미설정 — 한우 씨수소 공공API 동기화 스킵');
    return { synced: 0 };
  }

  const db = getDb();
  const connector = new SemenConnector();

  try {
    await connector.connect();
    const result = await connector.fetch();
    let synced = 0;

    for (const bull of result.data) {
      if (!bull.bullNo || !bull.bullName) continue;
      if (!bull.isAlive) continue; // 폐기 씨수소 제외

      try {
        const regNo = `HANWOO-${bull.bullNo}`;
        const [existing] = await db
          .select({ id: semenCatalog.semenId })
          .from(semenCatalog)
          .where(eq(semenCatalog.bullRegistration, regNo))
          .limit(1);

        if (existing) continue; // 이미 있으면 스킵

        await db.insert(semenCatalog).values({
          bullName: bull.bullName,
          bullRegistration: regNo,
          breed: bull.breed || '한우',
          supplier: '농촌진흥청 국립축산과학원',
          pricePerStraw: 8000, // 기본 단가
          genomicTraits: {
            inbreedingCoeff: bull.inbreedingCoeff ?? 0,
            fatherNo: bull.fatherNo,
            birthDate: bull.birthDate,
          },
          availableStraws: 500, // 기본값
          isActive: true,
        });
        synced++;
      } catch (err) {
        logger.debug({ err, bullName: bull.bullName }, '[SemenSync] 한우 씨수소 저장 오류');
      }
    }

    await connector.disconnect();
    logger.info({ synced, fetched: result.count }, '[SemenSync] 한우 씨수소 공공API 동기화 완료');
    return { synced };
  } catch (err) {
    logger.error({ err }, '[SemenSync] 한우 씨수소 동기화 실패');
    await connector.disconnect().catch(() => {});
    return { synced: 0 };
  }
}
