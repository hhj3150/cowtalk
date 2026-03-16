// Seed 데이터 — 6역할 사용자 + 테스트 농장 + 테스트 동물

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

    // 1. 지역
    const [gyeonggiRegion] = await db.insert(schema.regions).values([
      { province: '경기도', district: '화성시', code: '41590' },
      { province: '경기도', district: '이천시', code: '41500' },
      { province: '충청남도', district: '홍성군', code: '44800' },
      { province: '전라남도', district: '영광군', code: '46870' },
      { province: '경상북도', district: '의성군', code: '47730' },
    ]).returning();

    if (!gyeonggiRegion) {
      throw new Error('Failed to seed regions');
    }

    // 2. 테스트 농장
    const [testFarm] = await db.insert(schema.farms).values([
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
    ]).returning();

    if (!testFarm) {
      throw new Error('Failed to seed farms');
    }

    // 3. 6역할 사용자
    const passwordHash = await bcrypt.hash('password123', 10);

    const userValues = [
      { name: '김농장주', email: 'farmer@cowtalk.kr', role: 'farmer' },
      { name: '박수의사', email: 'vet@cowtalk.kr', role: 'veterinarian' },
      { name: '이수정사', email: 'inseminator@cowtalk.kr', role: 'inseminator' },
      { name: '최관리자', email: 'admin@cowtalk.kr', role: 'government_admin' },
      { name: '정방역관', email: 'quarantine@cowtalk.kr', role: 'quarantine_officer' },
      { name: '한사료', email: 'feed@cowtalk.kr', role: 'feed_company' },
    ].map((u) => ({ ...u, passwordHash, status: 'active' as const }));

    const insertedUsers = await db.insert(schema.users).values(userValues).returning();

    // 4. 사용자-농장 접근 권한
    const farmAccessValues = insertedUsers.map((user) => ({
      userId: user.userId,
      farmId: testFarm.farmId,
      permissionLevel: user.role === 'government_admin' ? 'admin' : 'read',
    }));

    await db.insert(schema.userFarmAccess).values(farmAccessValues);

    // 5. 테스트 동물 5두
    const animalValues = [
      { farmId: testFarm.farmId, earTag: 'KR-001', name: '별이', breed: 'holstein', sex: 'female', parity: 2, daysInMilk: 120, lactationStatus: 'milking', status: 'active' },
      { farmId: testFarm.farmId, earTag: 'KR-002', name: '달이', breed: 'holstein', sex: 'female', parity: 3, daysInMilk: 45, lactationStatus: 'milking', status: 'active' },
      { farmId: testFarm.farmId, earTag: 'KR-003', name: '구름이', breed: 'holstein', sex: 'female', parity: 1, daysInMilk: 200, lactationStatus: 'milking', status: 'active' },
      { farmId: testFarm.farmId, earTag: 'KR-004', name: '하늘이', breed: 'jersey', sex: 'female', parity: 0, daysInMilk: null, lactationStatus: 'heifer', status: 'active' },
      { farmId: testFarm.farmId, earTag: 'KR-005', name: '솔이', breed: 'holstein', sex: 'female', parity: 4, daysInMilk: 280, lactationStatus: 'dry', status: 'dry' },
    ] as const;

    await db.insert(schema.animals).values(animalValues.map((a) => ({ ...a })));

    // 6. AI 모델 레지스트리
    const modelValues = [
      { engineType: 'estrus', modelType: 'rule_based', version: '5.0.0' },
      { engineType: 'disease', modelType: 'rule_based', version: '5.0.0' },
      { engineType: 'pregnancy', modelType: 'rule_based', version: '5.0.0' },
      { engineType: 'herd', modelType: 'rule_based', version: '5.0.0' },
      { engineType: 'regional', modelType: 'rule_based', version: '5.0.0' },
    ];

    await db.insert(schema.modelRegistry).values(modelValues);

    console.info('Seed completed:');
    console.info(`  - 5 regions`);
    console.info(`  - 2 farms`);
    console.info(`  - 6 users (all roles)`);
    console.info(`  - 5 animals`);
    console.info(`  - 5 AI models`);
    console.info('  - Default password: password123');
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
