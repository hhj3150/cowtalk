import { describe, it, expect, vi } from 'vitest';

vi.mock('../../../config/database.js', () => ({ getDb: () => ({}) }));
const flags = { OPEN_DATA_SCOPE: false };
vi.mock('../../../config/index.js', async () => {
  const actual = await vi.importActual<{ config: Record<string, unknown> }>('../../../config/index.js');
  return { config: new Proxy(actual.config, { get: (t, k) => (k === 'OPEN_DATA_SCOPE' ? flags.OPEN_DATA_SCOPE : t[k as string]) }) };
});

const { tokenScopeFor, isOwnerEmail } = await import('../approval.service.js');
const { scopedFarmIds } = await import('../../../api/middleware/rbac.js');
const { resolveAllowedFarms } = await import('../../../ai-brain/tools/tool-scope.js');

const SONGYEONGSIN = '11111111-1111-1111-1111-111111111111';

describe('소유자 계정 — 배정과 무관하게 전체 목장', () => {
  // 실제 사고: 소유자 계정에 파일럿 목장이 배정돼 있으면 "배정 우선" 규칙으로 그 목장 알람만 보였다
  it('목장이 배정된 소유자도 토큰은 전체(마스터)로 발급', () => {
    expect(tokenScopeFor('hhj3150@hanmail.net', [SONGYEONGSIN])).toEqual({ farmIds: [], isMaster: true });
    expect(tokenScopeFor('ha@d2o.kr', [])).toEqual({ farmIds: [], isMaster: true });
  });

  it('대소문자·공백이 달라도 소유자로 인식', () => {
    expect(isOwnerEmail(' HHJ3150@Hanmail.net ')).toBe(true);
  });

  it('일반 계정은 배정 목장 그대로', () => {
    expect(tokenScopeFor('vet@test.kr', [SONGYEONGSIN])).toEqual({ farmIds: [SONGYEONGSIN] });
    expect(tokenScopeFor(undefined, [])).toEqual({ farmIds: [] });
  });

  it('발급된 소유자 토큰은 REST 스코프·도구 스코프 모두 무제한', () => {
    const scope = tokenScopeFor('hhj3150@hanmail.net', [SONGYEONGSIN]);
    // 소유자 역할이 목장주로 저장돼 있어도
    const req = { user: { userId: 'owner', role: 'farmer', ...scope } } as unknown as Parameters<typeof scopedFarmIds>[0];
    expect(scopedFarmIds(req)).toBeNull();
    expect(resolveAllowedFarms({ role: 'farmer', assignedFarmIds: scope.farmIds, isMaster: scope.isMaster })).toBeNull();
  });
});

describe('OPEN_DATA_SCOPE — 소유자 단독 운영 단계 전체 공개 스위치', () => {
  it('켜면 일반 계정도 전체 목장', () => {
    flags.OPEN_DATA_SCOPE = true;
    expect(tokenScopeFor('vet@test.kr', [SONGYEONGSIN])).toEqual({ farmIds: [], isMaster: true });
    flags.OPEN_DATA_SCOPE = false;
  });
  it('끄면(기본) 일반 계정은 배정 목장으로 복귀', () => {
    flags.OPEN_DATA_SCOPE = false;
    expect(tokenScopeFor('vet@test.kr', [SONGYEONGSIN])).toEqual({ farmIds: [SONGYEONGSIN] });
  });
});
