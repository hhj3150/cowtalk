// 일시 장애 자동 재시도 — "목장에 처음 들어가면 오류, 다시 누르면 됨" 재발 방지
import { describe, it, expect, afterEach } from 'vitest';
import { AxiosError, AxiosHeaders } from 'axios';
import type { AxiosAdapter, AxiosResponse, InternalAxiosRequestConfig } from 'axios';
import { apiClient, apiGet, apiPost, autoRetryBudget } from './client';

type Outcome = { readonly status?: number; readonly code?: string };

function failure(config: InternalAxiosRequestConfig, o: Outcome): AxiosError {
  const response = o.status
    ? ({ status: o.status, statusText: '', headers: {}, config, data: { success: false } } as AxiosResponse)
    : undefined;
  return new AxiosError('fail', o.code ?? (o.status ? 'ERR_BAD_RESPONSE' : 'ECONNABORTED'), config, null, response);
}

/** 순서대로 실패한 뒤 성공하는 가짜 어댑터 — 호출 기록(타임아웃 포함) */
function scriptedAdapter(failures: readonly Outcome[]): { adapter: AxiosAdapter; calls: InternalAxiosRequestConfig[] } {
  const calls: InternalAxiosRequestConfig[] = [];
  const adapter: AxiosAdapter = async (config) => {
    calls.push({ ...config });
    const o = failures[calls.length - 1];
    if (o) throw failure(config, o);
    return { status: 200, statusText: 'OK', headers: {}, config, data: { success: true, data: 'ok' } };
  };
  return { adapter, calls };
}

const originalAdapter = apiClient.defaults.adapter;
afterEach(() => { apiClient.defaults.adapter = originalAdapter; });

describe('autoRetryBudget', () => {
  const cfg = (method: string): InternalAxiosRequestConfig => ({ method, headers: new AxiosHeaders() });

  it('GET 타임아웃·502/503/504 는 2회, 500 은 1회', () => {
    expect(autoRetryBudget(failure(cfg('get'), { code: 'ECONNABORTED' }))).toBe(2);
    expect(autoRetryBudget(failure(cfg('get'), { status: 503 }))).toBe(2);
    expect(autoRetryBudget(failure(cfg('get'), { status: 500 }))).toBe(1);
  });

  it('4xx·POST·취소는 재시도하지 않는다', () => {
    expect(autoRetryBudget(failure(cfg('get'), { status: 403 }))).toBe(0);
    expect(autoRetryBudget(failure(cfg('get'), { status: 404 }))).toBe(0);
    expect(autoRetryBudget(failure(cfg('post'), { status: 503 }))).toBe(0);
    expect(autoRetryBudget(failure(cfg('get'), { code: 'ERR_CANCELED' }))).toBe(0);
  });
});

describe('인터셉터 자동 재시도', () => {
  it('첫 요청 타임아웃 → 더 긴 타임아웃으로 다시 물어 성공 (사용자는 오류를 보지 않는다)', async () => {
    const { adapter, calls } = scriptedAdapter([{ code: 'ECONNABORTED' }]);
    apiClient.defaults.adapter = adapter;
    await expect(apiGet<string>('/farms/x/profile')).resolves.toBe('ok');
    expect(calls).toHaveLength(2);
    expect(calls[1]!.timeout).toBe(30_000);
  });

  it('500 은 한 번만 다시 묻는다', async () => {
    const { adapter, calls } = scriptedAdapter([{ status: 500 }, { status: 500 }]);
    apiClient.defaults.adapter = adapter;
    await expect(apiGet('/x')).rejects.toBeInstanceOf(AxiosError);
    expect(calls).toHaveLength(2);
  });

  it('403 은 즉시 실패 (권한 오류를 숨기지 않는다)', async () => {
    const { adapter, calls } = scriptedAdapter([{ status: 403 }]);
    apiClient.defaults.adapter = adapter;
    await expect(apiGet('/x')).rejects.toBeInstanceOf(AxiosError);
    expect(calls).toHaveLength(1);
  });

  it('POST 는 재시도하지 않는다 (기록 중복 방지)', async () => {
    const { adapter, calls } = scriptedAdapter([{ status: 503 }]);
    apiClient.defaults.adapter = adapter;
    await expect(apiPost('/x', {})).rejects.toBeInstanceOf(AxiosError);
    expect(calls).toHaveLength(1);
  });

  it('noAutoRetry 호출(apiGetWithRetry 내부용)은 인터셉터가 손대지 않는다', async () => {
    const { adapter, calls } = scriptedAdapter([{ status: 503 }]);
    apiClient.defaults.adapter = adapter;
    await expect(apiGet('/x', undefined, { noAutoRetry: true })).rejects.toBeInstanceOf(AxiosError);
    expect(calls).toHaveLength(1);
  });
});
