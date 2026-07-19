// 소유자 판정 테스트 — 승인 관리 권한은 소유자 본인뿐

import { describe, it, expect } from 'vitest';
import { isOwnerAccount, OWNER_EMAILS } from './approval.service.js';

describe('isOwnerAccount', () => {
  it('government_admin + Master Admin 명칭은 소유자다', () => {
    expect(isOwnerAccount({ role: 'government_admin', name: '하현제 (Master Admin)', email: 'x@y.z' })).toBe(true);
  });

  it('소유자 이메일은 역할·명칭과 무관하게 소유자다', () => {
    for (const email of OWNER_EMAILS) {
      expect(isOwnerAccount({ role: 'farmer', name: '아무개', email })).toBe(true);
    }
  });

  it('일반 government_admin(명칭 불일치)은 소유자가 아니다', () => {
    expect(isOwnerAccount({ role: 'government_admin', name: '최경기행정', email: 'gg@gov.kr' })).toBe(false);
  });

  it('Master Admin 명칭이라도 government_admin이 아니면 소유자가 아니다', () => {
    expect(isOwnerAccount({ role: 'farmer', name: '가짜 Master Admin', email: 'fake@x.y' })).toBe(false);
  });
});
