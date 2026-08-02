// 도구 스코프 검증 — AI가 접근 제어의 뒷문이 되지 않는지
//
// 실제로 뚫려 있던 두 경로를 재현하고 막혔는지 확인한다:
//   1) 채팅 요청의 farmId를 클라이언트가 지정 → 남의 농장 데이터
//   2) query_animal이 농장 필터 없이 traceId로 조회 → 귀표에 인쇄된 번호만 알면 열림

import { describe, it, expect, vi, beforeEach } from 'vitest';

const FARM_A = '11111111-1111-1111-1111-111111111111';
const FARM_B = '22222222-2222-2222-2222-222222222222';
const ANIMAL_IN_A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const ANIMAL_IN_B = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

const ANIMAL_FARM: Readonly<Record<string, string>> = {
  [ANIMAL_IN_A]: FARM_A,
  [ANIMAL_IN_B]: FARM_B,
};
const FARMS = new Set([FARM_A, FARM_B]);

vi.mock('../../../config/database.js', () => ({
  getDb: () => ({
    select: (cols: Record<string, unknown>) => ({
      from: () => ({
        where: (cond: { __id?: string }) => ({
          limit: () => {
            const id = cond.__id ?? '';
            // animals 조회인지 farms 조회인지는 select 컬럼으로 구분
            const isAnimalLookup = 'farmId' in cols && ANIMAL_FARM[id] !== undefined;
            if (isAnimalLookup) return Promise.resolve([{ farmId: ANIMAL_FARM[id] }]);
            if (FARMS.has(id)) return Promise.resolve([{ farmId: id }]);
            return Promise.resolve([]);
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

const {
  resolveAllowedFarms,
  findScopeViolations,
  intersectRequestedFarms,
  isFarmAllowed,
  NO_FARM_SENTINEL,
} = await import('../tool-scope.js');

describe('resolveAllowedFarms — 권한의 근거는 JWT뿐', () => {
  it('배정이 있으면 역할 불문 그 농장으로 제한', () => {
    expect(resolveAllowedFarms({ role: 'veterinarian', assignedFarmIds: [FARM_A] })).toEqual([FARM_A]);
    expect(resolveAllowedFarms({ role: 'government_admin', assignedFarmIds: [FARM_A] })).toEqual([FARM_A]);
  });

  it('마스터는 무제한', () => {
    expect(resolveAllowedFarms({ role: 'farmer', isMaster: true })).toBeNull();
  });

  it('미배정 관리역할은 무제한 — 전국 방역 업무', () => {
    expect(resolveAllowedFarms({ role: 'quarantine_officer' })).toBeNull();
  });

  it('미배정 농장주·수의사는 아무것도 못 본다', () => {
    expect(resolveAllowedFarms({ role: 'farmer' })).toEqual([NO_FARM_SENTINEL]);
    expect(resolveAllowedFarms({ role: 'veterinarian' })).toEqual([NO_FARM_SENTINEL]);
  });

  it('알 수 없는 역할은 보수적으로 차단', () => {
    expect(resolveAllowedFarms({ role: 'something_new' })).toEqual([NO_FARM_SENTINEL]);
  });
});

describe('intersectRequestedFarms — 클라이언트 요청은 권한을 넓히지 못한다', () => {
  it('스코프 밖 농장을 요청하면 배정 농장으로 되돌린다', () => {
    expect(intersectRequestedFarms([FARM_B], [FARM_A])).toEqual([FARM_A]);
  });

  it('요청이 없으면 배정 농장 전체', () => {
    expect(intersectRequestedFarms([], [FARM_A])).toEqual([FARM_A]);
  });

  it('무제한이면 요청 그대로', () => {
    expect(intersectRequestedFarms([FARM_B], null)).toEqual([FARM_B]);
  });
});

describe('findScopeViolations — 도구 파라미터 검사', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('무제한 사용자는 검사하지 않는다', async () => {
    expect(await findScopeViolations({ farmId: FARM_B }, null)).toEqual([]);
  });

  it('배정 농장의 개체는 통과', async () => {
    expect(await findScopeViolations({ animalId: ANIMAL_IN_A }, [FARM_A])).toEqual([]);
  });

  // 실제 취약점 재현 — 수정 전에는 그대로 실행됐다
  it('남의 목장 개체를 지정하면 위반으로 잡는다', async () => {
    const v = await findScopeViolations({ animalId: ANIMAL_IN_B }, [FARM_A]);
    expect(v).toHaveLength(1);
    expect(v[0]?.reason).toBe('out-of-scope');
  });

  it('남의 목장 farmId를 지정하면 위반으로 잡는다', async () => {
    const v = await findScopeViolations({ farmId: FARM_B }, [FARM_A]);
    expect(v).toHaveLength(1);
    expect(v[0]?.key).toBe('farmId');
  });

  it('온톨로지 그래프의 anchorId도 검사한다 (농장 앵커)', async () => {
    const v = await findScopeViolations({ anchorId: FARM_B, anchorType: 'farm' }, [FARM_A]);
    expect(v).toHaveLength(1);
  });

  it('온톨로지 그래프의 anchorId도 검사한다 (개체 앵커)', async () => {
    const v = await findScopeViolations({ anchorId: ANIMAL_IN_B, anchorType: 'animal' }, [FARM_A]);
    expect(v).toHaveLength(1);
  });

  it('farmIds 배열도 원소별로 검사한다', async () => {
    const v = await findScopeViolations({ farmIds: [FARM_A, FARM_B] }, [FARM_A]);
    expect(v).toHaveLength(1);
    expect(v[0]?.value).toBe(FARM_B);
  });

  it('미배정 농장주는 어떤 개체도 통과하지 못한다', async () => {
    const v = await findScopeViolations({ animalId: ANIMAL_IN_A }, [NO_FARM_SENTINEL]);
    expect(v).toHaveLength(1);
  });

  it('UUID가 아닌 값은 도구가 처리하도록 넘긴다', async () => {
    expect(await findScopeViolations({ animalId: '423' }, [FARM_A])).toEqual([]);
  });

  it('식별자가 없는 입력은 통과 (earTag/traceId는 실행부가 필터링)', async () => {
    expect(await findScopeViolations({ traceId: '002132665191' }, [FARM_A])).toEqual([]);
  });
});

describe('isFarmAllowed', () => {
  it('무제한은 항상 허용', () => {
    expect(isFarmAllowed(FARM_B, null)).toBe(true);
  });
  it('목록에 없으면 거부', () => {
    expect(isFarmAllowed(FARM_B, [FARM_A])).toBe(false);
  });
});
