// OPS-12 회귀 — Socket.IO 어댑터가 없어 다중 레플리카에서 알람이 일부 사용자에게만 가던 문제
import { describe, it, expect, vi } from 'vitest';

vi.mock('../../lib/logger.js', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));
const createAdapter = vi.fn(() => 'redis-adapter');
vi.mock('@socket.io/redis-adapter', () => ({ createAdapter }));
const { attachRedisAdapter } = await import('../socket-redis-adapter.js');

function fakeClient(connect: () => Promise<void>) {
  const c = { connect: vi.fn(connect), disconnect: vi.fn(), on: vi.fn(), duplicate: () => c };
  return c;
}
function fakeIo() { return { adapter: vi.fn() }; }

describe('OPS-12 attachRedisAdapter', () => {
  it('비활성이면 붙이지 않는다', async () => {
    const io = fakeIo();
    expect(await attachRedisAdapter(io as never, { enabled: false, createClient: () => { throw new Error('no'); } })).toBe(false);
    expect(io.adapter).not.toHaveBeenCalled();
  });
  it('Redis 연결 성공 시 어댑터 장착', async () => {
    const io = fakeIo();
    const c = fakeClient(async () => undefined);
    expect(await attachRedisAdapter(io as never, { enabled: true, createClient: () => c as never })).toBe(true);
    expect(io.adapter).toHaveBeenCalledWith('redis-adapter');
  });
  it('연결 실패 시 인메모리 유지 + 재연결 중단', async () => {
    const io = fakeIo();
    const c = fakeClient(async () => { throw new Error('ECONNREFUSED'); });
    expect(await attachRedisAdapter(io as never, { enabled: true, createClient: () => c as never })).toBe(false);
    expect(io.adapter).not.toHaveBeenCalled();
    expect(c.disconnect).toHaveBeenCalled();
  });
});
