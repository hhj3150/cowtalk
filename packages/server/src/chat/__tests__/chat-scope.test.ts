import { describe, it, expect } from 'vitest';
import { sanitizeChatScope } from '../chat-scope.js';
import { NO_FARM_SENTINEL } from '../../api/middleware/rbac.js';

const FARM_A = '11111111-1111-1111-1111-111111111111';
const FARM_B = '22222222-2222-2222-2222-222222222222';
const FARM_C = '33333333-3333-3333-3333-333333333333';
const COW_A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const COW_B = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

const owner = (id: string): Promise<string | null> =>
  Promise.resolve(id === COW_A ? FARM_A : id === COW_B ? FARM_B : null);

describe('sanitizeChatScope', () => {
  it('무제한 스코프(마스터·미배정 관리역할)는 요청 그대로', async () => {
    const r = await sanitizeChatScope({ farmId: FARM_B, animalId: COW_B }, null, owner);
    expect(r).toEqual({ farmId: FARM_B, animalId: COW_B, narrowed: false });
  });

  // 실제 취약점 재현 — 농장주가 body.farmId에 남의 목장을 넣으면 그 목장 프로필이 프롬프트에 실렸다
  it('범위 밖 farmId는 버리고 단일 배정 목장으로 대체', async () => {
    const r = await sanitizeChatScope({ farmId: FARM_B, animalId: null }, [FARM_A], owner);
    expect(r.farmId).toBe(FARM_A);
    expect(r.narrowed).toBe(true);
  });

  it('범위 밖 animalId는 버린다', async () => {
    const r = await sanitizeChatScope({ farmId: FARM_A, animalId: COW_B }, [FARM_A], owner);
    expect(r.animalId).toBeNull();
    expect(r.narrowed).toBe(true);
  });

  it('범위 안 개체·목장은 유지', async () => {
    const r = await sanitizeChatScope({ farmId: FARM_A, animalId: COW_A }, [FARM_A, FARM_C], owner);
    expect(r).toMatchObject({ farmId: FARM_A, animalId: COW_A, narrowed: false });
  });

  it('여러 목장 담당 수의사가 farmId를 안 보내면 null (임의 선택 금지)', async () => {
    const r = await sanitizeChatScope({ farmId: null, animalId: null }, [FARM_A, FARM_C], owner);
    expect(r.farmId).toBeNull();
    expect(r.narrowed).toBe(false);
  });

  it('지역 그룹 farmIds는 범위 안의 것만 남긴다', async () => {
    const r = await sanitizeChatScope({ farmId: null, farmIds: [FARM_A, FARM_B], animalId: null }, [FARM_A, FARM_C], owner);
    expect(r.farmIds).toEqual([FARM_A]);
    expect(r.narrowed).toBe(true);
  });

  it('farmIds가 모두 범위 밖이면 undefined', async () => {
    const r = await sanitizeChatScope({ farmId: null, farmIds: [FARM_B], animalId: null }, [FARM_A, FARM_C], owner);
    expect(r.farmIds).toBeUndefined();
  });

  it('미배정 농장주(센티널)는 아무 목장·개체도 남지 않는다', async () => {
    const r = await sanitizeChatScope({ farmId: FARM_A, animalId: COW_A }, [NO_FARM_SENTINEL], owner);
    expect(r.farmId).toBeNull();
    expect(r.animalId).toBeNull();
  });

  it('존재하지 않는 개체는 버린다', async () => {
    const r = await sanitizeChatScope({ farmId: FARM_A, animalId: 'cccccccc-cccc-cccc-cccc-cccccccccccc' }, [FARM_A], owner);
    expect(r.animalId).toBeNull();
  });
});
