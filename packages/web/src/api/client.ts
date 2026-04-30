// Axios HTTP 클라이언트 — JWT 인터셉터, 에러 처리

import axios from 'axios';
import type { AxiosError, InternalAxiosRequestConfig } from 'axios';
import { useAuthStore } from '@web/stores/auth.store';

const BASE_URL = '/api';

export const apiClient = axios.create({
  baseURL: BASE_URL,
  timeout: 15_000,
  headers: { 'Content-Type': 'application/json' },
});

// 요청 인터셉터 — JWT 토큰 첨부
apiClient.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const token = useAuthStore.getState().accessToken;
  if (token && config.headers) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// 응답 인터셉터 — 401 → 토큰 갱신 시도
let isRefreshing = false;
let pendingRequests: Array<(token: string) => void> = [];

function onRefreshed(token: string): void {
  for (const cb of pendingRequests) {
    cb(token);
  }
  pendingRequests = [];
}

apiClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config;
    if (!originalRequest || error.response?.status !== 401) {
      return Promise.reject(error);
    }

    // 리프레시 토큰 없으면 로그아웃
    const { refreshToken, logout, updateTokens } = useAuthStore.getState();
    if (!refreshToken) {
      logout();
      return Promise.reject(error);
    }

    // 이미 갱신 중이면 큐잉
    if (isRefreshing) {
      return new Promise((resolve) => {
        pendingRequests.push((token: string) => {
          if (originalRequest.headers) {
            originalRequest.headers.Authorization = `Bearer ${token}`;
          }
          resolve(apiClient(originalRequest));
        });
      });
    }

    isRefreshing = true;

    try {
      const res = await axios.post<{ accessToken: string; refreshToken: string }>(
        `${BASE_URL}/auth/refresh`,
        { refreshToken },
      );
      const newAccess = res.data.accessToken;
      const newRefresh = res.data.refreshToken;
      updateTokens(newAccess, newRefresh);

      if (originalRequest.headers) {
        originalRequest.headers.Authorization = `Bearer ${newAccess}`;
      }
      onRefreshed(newAccess);
      return apiClient(originalRequest);
    } catch {
      logout();
      return Promise.reject(error);
    } finally {
      isRefreshing = false;
    }
  },
);

// API 응답 래퍼
export interface ApiResponse<T> {
  readonly success: boolean;
  readonly data: T;
  readonly error?: string;
}

export interface ApiCallOptions {
  readonly timeout?: number;
}

export async function apiGet<T>(
  url: string,
  params?: Record<string, unknown>,
  options?: ApiCallOptions,
): Promise<T> {
  const res = await apiClient.get<ApiResponse<T>>(url, {
    params,
    ...(options?.timeout !== undefined ? { timeout: options.timeout } : {}),
  });
  return res.data.data;
}

// ── 콜드패스 재시도 헬퍼 (drilldown / stats 등 대용량·콜드 시작 엔드포인트용) ──
//
// 첫 호출 8s → 503/타임아웃이면 0.5s 대기 후 15s → 다시 실패하면 1.5s 대기 후 30s.
// 401/403/404 등 4xx는 재시도하지 않고 즉시 throw.
// 콜드 스타트로 첫 응답이 늦더라도 사용자에게는 1회 안에 데이터가 표시되는 것이 목표.

export interface RetryAttemptInfo {
  readonly attempt: number;       // 0 = 최초, 1·2 = 재시도
  readonly totalAttempts: number; // 3
}

export interface ApiRetryOptions {
  readonly onAttempt?: (info: RetryAttemptInfo) => void;
}

const COLD_PATH_RETRY_SCHEDULE = [
  { timeout: 8_000, delayBefore: 0 },
  { timeout: 15_000, delayBefore: 500 },
  { timeout: 30_000, delayBefore: 1500 },
] as const;

function isRetriableError(err: unknown): boolean {
  const e = err as { code?: string; response?: { status?: number } };
  // 인프라 일시 장애(콜드 스타트, 게이트웨이 timeout 등)
  const status = e.response?.status;
  if (status === 502 || status === 503 || status === 504) return true;
  // 네트워크 오류(no response): ECONNREFUSED, ECONNRESET, ETIMEDOUT
  // 타임아웃: ECONNABORTED
  // Vite dev proxy는 upstream down 시 status=500 + code=ERR_BAD_RESPONSE → 이것도 콜드패스로 본다
  if (e.code === 'ECONNABORTED' || e.code === 'ERR_BAD_RESPONSE') return true;
  if (!e.response && typeof e.code === 'string') return true;
  return false;
}

export async function apiGetWithRetry<T>(
  url: string,
  params?: Record<string, unknown>,
  options?: ApiRetryOptions,
): Promise<T> {
  let lastError: unknown;
  for (let i = 0; i < COLD_PATH_RETRY_SCHEDULE.length; i++) {
    const step = COLD_PATH_RETRY_SCHEDULE[i]!;
    if (step.delayBefore > 0) {
      await new Promise<void>((resolve) => { setTimeout(resolve, step.delayBefore); });
    }
    options?.onAttempt?.({ attempt: i, totalAttempts: COLD_PATH_RETRY_SCHEDULE.length });
    try {
      return await apiGet<T>(url, params, { timeout: step.timeout });
    } catch (err) {
      lastError = err;
      if (!isRetriableError(err)) throw err;
    }
  }
  throw lastError;
}

/** 콜드패스 에러 → 사용자용 한국어 메시지 */
export function describeColdPathError(err: unknown): string {
  const e = err as { code?: string; response?: { status?: number; data?: { error?: string } }; message?: string };
  if (e.response?.status === 503) return '서버가 잠시 응답할 수 없습니다. 다시 시도해 주세요.';
  if (e.code === 'ECONNABORTED' || (e.message ?? '').toLowerCase().includes('timeout')) {
    return '서버 응답이 늦습니다. 다시 시도해 주세요.';
  }
  if (!e.response) return '네트워크 연결이 불안정합니다. 잠시 후 다시 시도해 주세요.';
  if (e.response.status === 401) return '로그인이 만료되었습니다. 다시 로그인해 주세요.';
  if (e.response.status === 404) return '요청한 데이터를 찾을 수 없습니다.';
  return e.response.data?.error ?? '데이터를 불러오지 못했습니다.';
}

export async function apiPost<T>(url: string, data?: unknown): Promise<T> {
  const res = await apiClient.post<ApiResponse<T>>(url, data);
  return res.data.data;
}

export async function apiPatch<T>(url: string, data?: unknown): Promise<T> {
  const res = await apiClient.patch<ApiResponse<T>>(url, data);
  return res.data.data;
}

export async function apiDelete<T>(url: string): Promise<T> {
  const res = await apiClient.delete<ApiResponse<T>>(url);
  return res.data.data;
}
