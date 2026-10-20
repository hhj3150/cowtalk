// OPS-16 회귀 — 연결 중 승인이 해제돼도 토큰 만료까지 실시간 알람을 계속 받던 문제
import { describe, it, expect, vi } from 'vitest';

vi.mock('../../lib/logger.js', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));
vi.mock('../../services/auth/approval.service.js', () => ({ isUserApproved: vi.fn(async () => true) }));
const { revalidateSockets } = await import('../socket-server.js');

function sock(userId: string) { return { data: { userId }, disconnect: vi.fn() }; }

describe('OPS-16 revalidateSockets', () => {
  it('승인 해제된 사용자만 끊는다', async () => {
    const a = sock('ok'); const b = sock('revoked');
    const n = await revalidateSockets({ fetchSockets: async () => [a, b] }, async (u) => u === 'ok');
    expect(n).toBe(1);
    expect(b.disconnect).toHaveBeenCalledWith(true);
    expect(a.disconnect).not.toHaveBeenCalled();
  });
  it('승인 조회 실패는 끊지 않는다', async () => {
    const a = sock('x');
    expect(await revalidateSockets({ fetchSockets: async () => [a] }, async () => { throw new Error('db'); })).toBe(0);
  });
});
