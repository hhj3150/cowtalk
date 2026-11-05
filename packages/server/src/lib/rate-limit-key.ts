// 전역 요청 한도의 기준 — 로그인 사용자는 계정별, 비로그인은 IP별
//
// IP 기준만 쓰면 강연장·행사장처럼 청중이 한 인터넷 출구(NAT)를 공유할 때
// 발표자가 청중과 같은 바구니에 묶여 시연 중 429(요청 한도)가 날 수 있다.
// 유효한 토큰이면 계정으로 센다. 위조·만료 토큰은 IP로 떨어진다.

import type { Request } from 'express';
import { verifyAccessToken } from './auth.js';

export const ANON_LIMIT_PER_30MIN = 1000;
export const USER_LIMIT_PER_30MIN = 3000;

export function rateLimitIdentity(req: Pick<Request, 'headers' | 'ip'>, verify: (t: string) => { userId: string } = verifyAccessToken): { readonly key: string; readonly authenticated: boolean } {
  const header = req.headers.authorization;
  if (typeof header === 'string' && header.startsWith('Bearer ')) {
    try {
      return { key: `user:${verify(header.slice(7)).userId}`, authenticated: true };
    } catch {
      // 만료·위조 토큰 → IP 기준
    }
  }
  return { key: `ip:${req.ip ?? 'unknown'}`, authenticated: false };
}
