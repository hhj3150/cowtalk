// 인증 스토어 — 사용자, 역할, 토큰, tenant

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Role } from '@cowtalk/shared';

export interface AuthUser {
  readonly userId: string;
  readonly name: string;
  readonly email: string;
  readonly role: Role;
  readonly farmIds: readonly string[];
  readonly tenantId: string | null;
  readonly tenantName: string | null;
}

interface AuthState {
  readonly user: AuthUser | null;
  readonly accessToken: string | null;
  readonly refreshToken: string | null;
  readonly isAuthenticated: boolean;
}

interface AuthActions {
  readonly login: (user: AuthUser, accessToken: string, refreshToken: string) => void;
  readonly logout: () => void;
  readonly updateTokens: (accessToken: string, refreshToken: string) => void;
  readonly updateUser: (user: AuthUser) => void;
}

const initialState: AuthState = {
  user: null,
  accessToken: null,
  refreshToken: null,
  isAuthenticated: false,
};

export const useAuthStore = create<AuthState & AuthActions>()(
  persist(
    (set) => ({
      ...initialState,

      login: (user, accessToken, refreshToken) =>
        set({
          user,
          accessToken,
          refreshToken,
          isAuthenticated: true,
        }),

      logout: () => set(initialState),

      updateTokens: (accessToken, refreshToken) =>
        set({ accessToken, refreshToken }),

      updateUser: (user) => set({ user }),
    }),
    {
      name: 'cowtalk-auth',
      partialize: (state) => ({
        user: state.user,
        accessToken: state.accessToken,
        refreshToken: state.refreshToken,
        isAuthenticated: state.isAuthenticated,
      }),
    },
  ),
);
