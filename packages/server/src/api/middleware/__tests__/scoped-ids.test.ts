// requireScopedIds — 본문·쿼리로 들어오는 식별자의 스코프 검사
//
// 검증하려는 위협: POST /label-chat/label { animalId: 남의 개체, farmId: 내 목장 } 처럼
// 경로가 아닌 본문으로 id를 받는 경로에서, 내 farmId를 붙여 남의 개체에 기록하는 것.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response, NextFunction } from 'express';

const FARM_A = '11111111-1111-1111-1111-111111111111';
const FARM_B = '22222222-2222-2222-2222-222222222222';
const ANIMAL_IN_A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const ANIMAL_IN_B = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const EVENT_IN_B = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';
const LABEL_IN_A = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
const MISSING = 'cccccccc-cccc-cccc-cccc-cccccccccccc';

/** id → farmId (개체·이벤트·레이블 공용 스텁) */
const OWNER: Readonly<Record<string, string>> = {
  [ANIMAL_IN_A]: FARM_A,
  [ANIMAL_IN_B]: FARM_B,
  [EVENT_IN_B]: FARM_B,
  [LABEL_IN_A]: FARM_A,
};

vi.mock('../../../config/database.js', () => ({
  getDb: () => ({
    select: () => ({
      from: () => ({
        where: (cond: { __id?: string }) => ({
          limit: () => {
            const farmId = OWNER[cond.__id ?? ''];
            return Promise.resolve(farmId ? [{ farmId }] : []);
          },
        }),
      }),
    }),
  }),
}));

vi.mock('drizzle-orm', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('drizzle-orm');
  return { ...actual, eq: (_col: unknown, val: string) => ({ __id: val }) };
});

const { requireScopedIds, __testing } = await import('../animal-access.js');
type Specs = Parameters<typeof requireScopedIds>[0];

const VET_A = { userId: 'v', role: 'veterinarian', farmIds: [FARM_A] };
const ADMIN = { userId: 'g', role: 'government_admin', farmIds: [] };

async function run(
  specs: Specs,
  user: Record<string, unknown> | undefined,
  parts: { body?: unknown; query?: unknown; params?: unknown },
): Promise<{ passed: boolean; error?: Error }> {
  const req = { user, body: parts.body ?? {}, query: parts.query ?? {}, params: parts.params ?? {} } as unknown as Request;
  let error: Error | undefined;
  let passed = false;
  const next: NextFunction = (err?: unknown) => {
    if (err) error = err as Error;
    else passed = true;
  };
  await requireScopedIds(specs)(req, {} as Response, next);
  return { passed, error };
}

const BODY_ANIMAL_FARM: Specs = [
  { source: 'body', field: 'animalId', kind: 'animal' },
  { source: 'body', field: 'farmId', kind: 'farm' },
];

describe('requireScopedIds', () => {
  beforeEach(() => { __testing.clearCache(); });

  it('본문의 개체·목장이 모두 배정 범위면 통과', async () => {
    const r = await run(BODY_ANIMAL_FARM, VET_A, { body: { animalId: ANIMAL_IN_A, farmId: FARM_A } });
    expect(r.passed).toBe(true);
  });

  // 이 테스트가 실제 취약점을 재현한다 — 내 farmId를 붙여 남의 개체에 기록
  it('내 farmId를 붙여도 남의 개체면 차단', async () => {
    const r = await run(BODY_ANIMAL_FARM, VET_A, { body: { animalId: ANIMAL_IN_B, farmId: FARM_A } });
    expect(r.passed).toBe(false);
    expect(r.error?.name).toBe('ForbiddenError');
  });

  it('쿼리의 farmId가 범위 밖이면 차단', async () => {
    const r = await run([{ source: 'query', field: 'farmId', kind: 'farm', required: true }], VET_A, { query: { farmId: FARM_B } });
    expect(r.error?.name).toBe('ForbiddenError');
  });

  it('경로의 이벤트 id는 소속 농장으로 해석해 검사', async () => {
    const r = await run([{ source: 'params', field: 'eventId', kind: 'event', required: true }], VET_A, { params: { eventId: EVENT_IN_B } });
    expect(r.error?.name).toBe('ForbiddenError');
  });

  it('레이블 id도 소속 농장으로 해석', async () => {
    const r = await run([{ source: 'params', field: 'labelId', kind: 'label', required: true }], VET_A, { params: { labelId: LABEL_IN_A } });
    expect(r.passed).toBe(true);
  });

  it('선택 항목이 비어 있으면 건너뛴다', async () => {
    const r = await run(BODY_ANIMAL_FARM, VET_A, { body: { farmId: FARM_A } });
    expect(r.passed).toBe(true);
  });

  it('필수 항목이 비어 있으면 404', async () => {
    const r = await run([{ source: 'body', field: 'animalId', kind: 'animal', required: true }], VET_A, { body: {} });
    expect(r.error?.name).toBe('NotFoundError');
  });

  it('존재하지 않는 개체는 404 (관리역할도)', async () => {
    const r = await run(BODY_ANIMAL_FARM, ADMIN, { body: { animalId: MISSING } });
    expect(r.error?.name).toBe('NotFoundError');
  });

  it('UUID가 아닌 값은 DB 조회 없이 404', async () => {
    const r = await run(BODY_ANIMAL_FARM, VET_A, { body: { animalId: "' OR 1=1--" } });
    expect(r.error?.name).toBe('NotFoundError');
  });

  it('미배정 관리역할은 전체 접근', async () => {
    const r = await run(BODY_ANIMAL_FARM, ADMIN, { body: { animalId: ANIMAL_IN_B, farmId: FARM_B } });
    expect(r.passed).toBe(true);
  });

  it('미배정 농장주는 거부', async () => {
    const r = await run(BODY_ANIMAL_FARM, { userId: 'f', role: 'farmer', farmIds: [] }, { body: { animalId: ANIMAL_IN_A } });
    expect(r.error?.name).toBe('ForbiddenError');
  });

  it('인증 없으면 401', async () => {
    const r = await run(BODY_ANIMAL_FARM, undefined, { body: { animalId: ANIMAL_IN_A } });
    expect(r.error?.name).toBe('UnauthorizedError');
  });
});
