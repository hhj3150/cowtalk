// Seed 데이터 — 7역할 사용자 + 5농장 + 50두 + AI 모델

import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { getDatabaseUrl } from '../config/index';
import * as schema from './schema';
import bcrypt from 'bcryptjs';

async function seed(): Promise<void> {
  const sql = postgres(getDatabaseUrl());
  const db = drizzle(sql, { schema });

  try {
    console.info('Seeding database...');

    // 1. 지역 (5개)
    const regions = await db.insert(schema.regions).values([
      { province: '경기도', district: '화성시', code: '41590' },
      { province: '경기도', district: '이천시', code: '41500' },
      { province: '충청남도', district: '홍성군', code: '44800' },
      { province: '전라남도', district: '영광군', code: '46870' },
      { province: '경상북도', district: '의성군', code: '47730' },
    ]).returning();

    const gyeonggiRegion = regions[0]!;
    const chungnamRegion = regions[2]!;
    const jeonnamRegion = regions[3]!;

    // 2. 테스트 농장 (5개)
    const farms = await db.insert(schema.farms).values([
      {
        regionId: gyeonggiRegion.regionId,
        name: '행복목장',
        address: '경기도 화성시 장안면 목장길 123',
        lat: 37.123,
        lng: 127.045,
        capacity: 200,
        currentHeadCount: 142,
        status: 'active',
        ownerName: '김목장',
        phone: '031-123-4567',
      },
      {
        regionId: gyeonggiRegion.regionId,
        name: '푸른목장',
        address: '경기도 화성시 남양읍 목장로 456',
        lat: 37.201,
        lng: 126.982,
        capacity: 150,
        currentHeadCount: 98,
        status: 'active',
        ownerName: '이목장',
        phone: '031-234-5678',
      },
      {
        regionId: chungnamRegion.regionId,
        name: '해뜨는목장',
        address: '충청남도 홍성군 홍북읍 목장길 789',
        lat: 36.601,
        lng: 126.660,
        capacity: 300,
        currentHeadCount: 210,
        status: 'active',
        ownerName: '박목장',
        phone: '041-345-6789',
      },
      {
        regionId: jeonnamRegion.regionId,
        name: '초원목장',
        address: '전라남도 영광군 영광읍 초원길 101',
        lat: 35.277,
        lng: 126.512,
        capacity: 180,
        currentHeadCount: 125,
        status: 'active',
        ownerName: '최목장',
        phone: '061-456-7890',
      },
      {
        regionId: gyeonggiRegion.regionId,
        name: '별빛목장',
        address: '경기도 이천시 마장면 별빛로 202',
        lat: 37.272,
        lng: 127.443,
        capacity: 250,
        currentHeadCount: 178,
        status: 'active',
        ownerName: '정목장',
        phone: '031-567-8901',
      },
    ]).returning();

    const farm1 = farms[0]!;
    const farm2 = farms[1]!;
    const farm3 = farms[2]!;
    const farm4 = farms[3]!;
    const farm5 = farms[4]!;
    const allFarmIds = farms.map((f) => f.farmId);

    // 3. 사용자 (7명 — 요구사항 기반)
    const passwordHash = await bcrypt.hash('test1234', 10);

    const userValues = [
      { name: '하현제 (Master Admin)', email: 'ha@d2o.kr', role: 'government_admin' },
      { name: '고려동물병원', email: 'vet@test.kr', role: 'veterinarian' },
      { name: '김농장주', email: 'farmer@test.kr', role: 'farmer' },
      { name: '이수정사', email: 'inseminator@test.kr', role: 'inseminator' },
      { name: '최경기행정', email: 'admin@gyeonggi.kr', role: 'government_admin' },
      { name: '정방역관', email: 'quarantine@test.kr', role: 'quarantine_officer' },
      { name: '한사료', email: 'feed@test.kr', role: 'feed_company' },
    ].map((u) => ({ ...u, passwordHash, status: 'active' as const }));

    const insertedUsers = await db.insert(schema.users).values(userValues).returning();

    // 4. 사용자-농장 접근 권한
    const farmAccessValues: Array<{ userId: string; farmId: string; permissionLevel: string }> = [];

    for (const user of insertedUsers) {
      if (user.email === 'ha@d2o.kr' || user.email === 'admin@gyeonggi.kr' || user.email === 'quarantine@test.kr') {
        // Master Admin / 행정 / 방역: 전체 농장 접근
        for (const farmId of allFarmIds) {
          farmAccessValues.push({ userId: user.userId, farmId, permissionLevel: 'admin' });
        }
      } else if (user.email === 'vet@test.kr') {
        // 수의사: 농장 1, 2, 3 접근 (56농장 중 대표 3곳)
        for (const farmId of [farm1.farmId, farm2.farmId, farm3.farmId]) {
          farmAccessValues.push({ userId: user.userId, farmId, permissionLevel: 'write' });
        }
      } else if (user.email === 'farmer@test.kr') {
        // 농장주: 농장 1만
        farmAccessValues.push({ userId: user.userId, farmId: farm1.farmId, permissionLevel: 'admin' });
      } else if (user.email === 'inseminator@test.kr') {
        // 수정사: 농장 1, 2, 5
        for (const farmId of [farm1.farmId, farm2.farmId, farm5.farmId]) {
          farmAccessValues.push({ userId: user.userId, farmId, permissionLevel: 'write' });
        }
      } else if (user.email === 'feed@test.kr') {
        // 사료회사: 농장 1, 3, 4, 5
        for (const farmId of [farm1.farmId, farm3.farmId, farm4.farmId, farm5.farmId]) {
          farmAccessValues.push({ userId: user.userId, farmId, permissionLevel: 'read' });
        }
      }
    }

    await db.insert(schema.userFarmAccess).values(farmAccessValues);

    // 5. 테스트 동물 50두
    const cowNames = [
      '별이', '달이', '구름이', '하늘이', '솔이', '꽃이', '은별', '초롱이', '다솜이', '한별',
      '보라', '나비', '두리', '새별', '미리', '가을', '봄이', '여름', '겨울', '새봄',
      '진이', '세라', '로사', '큰별', '작은별', '아침이', '노을이', '호수', '산들이', '바람이',
      '소나기', '무지개', '들꽃', '햇살이', '달빛', '사랑이', '행복이', '보물이', '은하', '밤별',
      '반짝이', '미소', '다정이', '온유', '지혜', '태양이', '별빛이', '꿈이', '소망이', '기쁨이',
    ];

    const animalValues = cowNames.map((name, i) => {
      const farmIndex = i % 5;
      const targetFarm = farms[farmIndex]!;
      const parity = Math.floor(Math.random() * 5);
      const dim = parity === 0 ? null : Math.floor(Math.random() * 300) + 1;
      const lactStatus = parity === 0 ? 'heifer' : dim && dim > 250 ? 'dry' : 'milking';
      const breed = i % 7 === 0 ? 'jersey' : 'holstein';

      return {
        farmId: targetFarm.farmId,
        earTag: `KR-${String(i + 1).padStart(3, '0')}`,
        name,
        breed,
        sex: 'female' as const,
        parity,
        daysInMilk: dim,
        lactationStatus: lactStatus,
        status: lactStatus === 'dry' ? 'dry' : 'active',
      };
    });

    await db.insert(schema.animals).values(animalValues);

    // 6. AI 모델 레지스트리
    const modelValues = [
      { engineType: 'estrus', modelType: 'rule_based', version: '5.0.0' },
      { engineType: 'disease', modelType: 'rule_based', version: '5.0.0' },
      { engineType: 'pregnancy', modelType: 'rule_based', version: '5.0.0' },
      { engineType: 'nutrition', modelType: 'rule_based', version: '5.0.0' },
      { engineType: 'herd', modelType: 'rule_based', version: '5.0.0' },
      { engineType: 'regional', modelType: 'rule_based', version: '5.0.0' },
    ];

    await db.insert(schema.modelRegistry).values(modelValues);

    console.info('Seed completed:');
    console.info('  - 5 regions');
    console.info(`  - ${String(farms.length)} farms`);
    console.info(`  - ${String(insertedUsers.length)} users (7 roles)`);
    console.info(`  - ${String(animalValues.length)} animals`);
    console.info(`  - ${String(modelValues.length)} AI models`);
    console.info('  - Default password: test1234');
  } catch (error) {
    console.error('Seed failed:', error);
    throw error;
  } finally {
    await sql.end();
  }
}

seed().catch((error) => {
  console.error('Seed process failed:', error);
  process.exit(1);
});
