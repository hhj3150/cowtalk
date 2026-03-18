// 인증 API

import { apiPost, apiGet } from './client';
import type { AuthUser } from '@web/stores/auth.store';

export interface LoginRequest {
  readonly email: string;
  readonly password: string;
}

export interface LoginResponse {
  readonly user: AuthUser;
  readonly accessToken: string;
  readonly refreshToken: string;
}

export interface RegisterRequest {
  readonly name: string;
  readonly email: string;
  readonly password: string;
  readonly role: string;
}

export function login(data: LoginRequest): Promise<LoginResponse> {
  return apiPost<LoginResponse>('/auth/login', data);
}

export function register(data: RegisterRequest): Promise<LoginResponse> {
  return apiPost<LoginResponse>('/auth/register', data);
}

export interface QuickLoginRequest {
  readonly email: string;
}

export function quickLogin(data: QuickLoginRequest): Promise<LoginResponse> {
  return apiPost<LoginResponse>('/auth/quick-login', data);
}

export function getMe(): Promise<AuthUser> {
  return apiGet<AuthUser>('/auth/me');
}
