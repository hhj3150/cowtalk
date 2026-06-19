// 인증 훅

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '@web/stores/auth.store';
import * as authApi from '@web/api/auth.api';
import { useCallback } from 'react';

export function useAuth() {
  const { user, isAuthenticated, login: storeLogin, logout: storeLogout } = useAuthStore();
  const queryClient = useQueryClient();

  // 계정 전환 시 이전 사용자의 캐시(농장 스코프 등)가 다음 사용자에게 새어나가지 않도록
  // 인증 상태가 바뀌는 모든 지점에서 React Query 캐시를 비운다.
  const enterSession = useCallback(
    (data: Awaited<ReturnType<typeof authApi.login>>) => {
      queryClient.clear();
      storeLogin(data.user, data.accessToken, data.refreshToken);
    },
    [queryClient, storeLogin],
  );

  const loginMutation = useMutation({
    mutationFn: authApi.login,
    onSuccess: enterSession,
  });

  const registerMutation = useMutation({
    mutationFn: authApi.register,
    onSuccess: enterSession,
  });

  const quickLoginMutation = useMutation({
    mutationFn: authApi.quickLogin,
    onSuccess: enterSession,
  });

  const logout = useCallback(() => {
    storeLogout();
    queryClient.clear();
  }, [storeLogout, queryClient]);

  return {
    user,
    isAuthenticated,
    login: loginMutation.mutateAsync,
    quickLogin: quickLoginMutation.mutateAsync,
    register: registerMutation.mutateAsync,
    logout,
    isLoggingIn: loginMutation.isPending || quickLoginMutation.isPending,
    loginError: loginMutation.error ?? quickLoginMutation.error,
    isRegistering: registerMutation.isPending,
    registerError: registerMutation.error,
  };
}

export function useCurrentUser() {
  const { isAuthenticated } = useAuthStore();

  return useQuery({
    queryKey: ['auth', 'me'],
    queryFn: authApi.getMe,
    enabled: isAuthenticated,
    staleTime: 5 * 60 * 1000,
  });
}
