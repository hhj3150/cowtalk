// legacy auth 오염 마이그레이션 (FLOW-02 Step2.6)
//
// 배경: PR #41 이전 RoleSwitcher 가 updateUser() 로 user.role 을 직접 mutate 했다.
// 그 흔적이 localStorage(cowtalk-auth persist)에 남아, master 계정인데
// user.role='farmer' 같은 비정상 상태가 영구 저장된 사례가 확인됨.
//
// 이 모듈은 앱 진입 시 1회 실행되어 그 오염을 복구한다.

import { useAuthStore } from '@web/stores/auth.store';

/**
 * legacy 오염 정리 — master 계정의 mutate된 user.role 을 government_admin 으로 복원.
 *
 * 기준: name 에 'Master Admin' 포함 + role 이 government_admin 이 아닌 경우만.
 * 비-master 계정에는 절대 적용되지 않는다 (name 조건 미통과).
 *
 * 마이그레이션 플래그(localStorage 'cowtalk-auth-migrated-v1')로 1회만 실행.
 */
export function migrateLegacyAuthRole(): void {
  const FLAG = 'cowtalk-auth-migrated-v1';
  try {
    if (localStorage.getItem(FLAG) === '1') return;

    const state = useAuthStore.getState();
    const user = state.user;
    if (!user) {
      // 미로그인 상태 — 복구 대상 없음. 플래그만 설정해 재실행 방지.
      localStorage.setItem(FLAG, '1');
      return;
    }

    const isMasterByName = user.name?.includes('Master Admin') ?? false;
    const isRoleClean = user.role === 'government_admin';

    if (isMasterByName && !isRoleClean) {
      state.updateUser({ ...user, role: 'government_admin' });
      console.info('[auth-migration] master role 복원: %s → government_admin', user.role);
    }

    // legacy 키 정리 (Step2.5 이후 미사용)
    localStorage.removeItem('cowtalk-master-role');

    localStorage.setItem(FLAG, '1');
  } catch (e) {
    console.warn('[auth-migration] 실패 (무시):', e);
  }
}
