// 직접 호출(대화 스트림·음성) 토큰 신선도 — 2시간 넘게 띄운 화면에서 음성이 조용히 401 로 죽지 않게
import { describe, it, expect, afterEach } from 'vitest';
import type { AxiosAdapter } from 'axios';
import { ensureFreshAccessToken, jwtExpiresAtMs } from './client';
import axios from 'axios';
import { useAuthStore } from '@web/stores/auth.store';

function jwt(expSec: number): string {
  const b64 = (o: unknown): string => btoa(JSON.stringify(o)).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
  return `${b64({ alg: 'HS256' })}.${b64({ sub: 'u', exp: expSec })}.sig`;
}

const originalAdapter = axios.defaults.adapter;
afterEach(() => { axios.defaults.adapter = originalAdapter; });

describe('ensureFreshAccessToken', () => {
  it('exp 를 읽는다, 형식이 아니면 null', () => {
    expect(jwtExpiresAtMs(jwt(1_000))).toBe(1_000_000);
    expect(jwtExpiresAtMs('not-a-jwt')).toBeNull();
  });

  it('여유가 있으면 그대로, 만료 5분 전이면 갱신해 새 토큰을 쓴다', async () => {
    const now = 1_700_000_000_000;
    const fresh = jwt(now / 1000 + 3600);
    useAuthStore.setState({ accessToken: fresh, refreshToken: 'r1' });
    expect(await ensureFreshAccessToken(now)).toBe(fresh);

    const expiring = jwt(now / 1000 + 60);
    useAuthStore.setState({ accessToken: expiring, refreshToken: 'r1' });
    let calls = 0;
    const adapter: AxiosAdapter = async (config) => {
      calls++;
      return { status: 200, statusText: 'OK', headers: {}, config, data: { accessToken: 'new-access', refreshToken: 'r2' } };
    };
    axios.defaults.adapter = adapter;
    const [a, b] = await Promise.all([ensureFreshAccessToken(now), ensureFreshAccessToken(now)]);
    expect(a).toBe('new-access');
    expect(b).toBe('new-access');
    expect(calls).toBe(1); // 동시 호출은 한 번의 갱신에 합류
    expect(useAuthStore.getState().refreshToken).toBe('r2');
  });

  it('갱신 실패면 기존 토큰으로 시도 (화면을 깨지 않는다)', async () => {
    const now = 1_700_000_000_000;
    const expiring = jwt(now / 1000 + 60);
    useAuthStore.setState({ accessToken: expiring, refreshToken: 'r1' });
    axios.defaults.adapter = async () => { throw new Error('network'); };
    expect(await ensureFreshAccessToken(now)).toBe(expiring);
  });
});
