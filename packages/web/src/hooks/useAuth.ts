// 인증 훅

import { useMutation, useQuery } from '@tanstack/react-query';
import { useAuthStore } from '@web/stores/auth.store';
import * as authApi from '@web/api/auth.api';
import { useCallback } from 'react';

export function useAuth() {
  const { user, isAuthenticated, login: storeLogin, logout: storeLogout } = useAuthStore();

  const loginMutation = useMutation({
    mutationFn: authApi.login,
    onSuccess: (data) => {
      storeLogin(data.user, data.accessToken, data.refreshToken);
    },
  });

  const registerMutation = useMutation({
    mutationFn: authApi.register,
    onSuccess: (data) => {
      storeLogin(data.user, data.accessToken, data.refreshToken);
    },
  });

  const quickLoginMutation = useMutation({
    mutationFn: authApi.quickLogin,
    onSuccess: (data) => {
      storeLogin(data.user, data.accessToken, data.refreshToken);
    },
  });

  const logout = useCallback(() => {
    storeLogout();
  }, [storeLogout]);

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
