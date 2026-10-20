// 신규 발견(감사 외) 회귀 — 원시 sql 템플릿에 Date 객체를 넘기면 drizzle(postgres-js)가 직렬화하지 못해
// 쿼리가 실패한다. 수태율 통계·정액 성과·반복번식우 체크는 오류를 삼키고 빈 결과를 냈고,
// 엔진 성능 조회는 예외를 던졌다. 실제 DB 에서만 드러나므로 DB 통합 테스트로 지킨다 (CI db-tests).

import { describe, it, expect, vi, afterAll, beforeAll } from 'vitest';
import { getDb, closeDb } from '@server/config/database.js';
import { regions, farms } from '@server/db/schema.js';
import { eq } from 'drizzle-orm';
import { logger } from '@server/lib/logger.js';
import { getFarmSemenPerformance, computeConceptionStats } from '@server/services/breeding/breeding-feedback.service.js';
import { checkRepeatBreeders } from '@server/services/breeding/breeding-reminder.service.js';
import { getEnginePerformance } from '@server/db/repositories/feedback.repo.js';
import { findHeatEventId } from '@server/intelligence-loop/prediction-bridge.service.js';

let regionId: string;
let farmId: string;

beforeAll(async () => {
  const db = getDb();
  const [region] = await db.insert(regions).values({
    province: '테스트도', district: '날짜군', code: `D${String(Date.now()).slice(-8)}`,
  }).returning();
  regionId = region!.regionId;
  const [farm] = await db.insert(farms).values({ regionId, name: '날짜테스트목장', address: '주소', lat: 37, lng: 127 }).returning();
  farmId = farm!.farmId;
});

afterAll(async () => {
  const db = getDb();
  await db.delete(farms).where(eq(farms.farmId, farmId));
  await db.delete(regions).where(eq(regions.regionId, regionId));
  await closeDb();
});

describe('원시 sql 의 날짜 파라미터', () => {
  it('수태율·정액 성과·반복번식우 조회가 오류 없이 실행된다 (예전: 오류를 삼키고 빈 결과)', async () => {
    const errorSpy = vi.spyOn(logger, 'error');
    await getFarmSemenPerformance(farmId);
    await computeConceptionStats(farmId);
    await checkRepeatBreeders();
    expect(errorSpy).not.toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it('엔진 성능 조회가 예외를 던지지 않는다', async () => {
    await expect(getEnginePerformance('sovereign_v1', new Date(Date.now() - 30 * 86_400_000))).resolves.toBeDefined();
  });

  it('번식 권고의 근거 발정 이벤트 조회가 실행된다', async () => {
    await expect(findHeatEventId('00000000-0000-4000-8000-000000000000', new Date().toISOString())).resolves.toBeNull();
  });
});
