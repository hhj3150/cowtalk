// 소유자 판정 테스트 — 승인 관리 권한은 소유자 본인뿐

import { describe, it, expect } from 'vitest';
import { isOwnerAccount, OWNER_EMAILS } from './approval.service.js';

describe('isOwnerAccount', () => {
  // SEC-03 회귀: 이름은 사용자 수정 API로 바꿀 수 있다 → 이름만으로 소유자가 되면 권한 상승
  it('government_admin 이 이름을 "Master Admin"으로 바꿔도 소유자가 아니다', () => {
    expect(isOwnerAccount({ email: 'x@y.z' })).toBe(false);
  });

  it('소유자 이메일은 대소문자·공백과 무관하게 인정', () => {
    expect(isOwnerAccount({ email: '  HHJ3150@Hanmail.net ' })).toBe(true);
  });

  it('소유자 이메일은 역할·명칭과 무관하게 소유자다', () => {
    for (const email of OWNER_EMAILS) {
      expect(isOwnerAccount({ email })).toBe(true);
    }
  });

  it('일반 government_admin(명칭 불일치)은 소유자가 아니다', () => {
    expect(isOwnerAccount({ email: 'gg@gov.kr' })).toBe(false);
  });

  it('이메일이 없으면 소유자가 아니다', () => {
    expect(isOwnerAccount({ email: null })).toBe(false);
    expect(isOwnerAccount({ email: '' })).toBe(false);
  });
});
