// SEC-14 회귀 — 소켓 방 배정과 만료
import { describe, it, expect, vi } from 'vitest';
import jwt from 'jsonwebtoken';

vi.mock('../../config/database.js', () => ({ getDb: () => ({}) }));
const { socketRoomsFor, msUntilExpiry } = await import('../socket-server.js');

describe('SEC-14 socketRoomsFor', () => {
  it('배정이 걸린 행정관은 전체 알람 방에 들어가지 않는다 (예전: alarms:all)', () => {
    expect(socketRoomsFor({ role: 'government_admin', farmIds: ['f1'] })).toEqual(['farm:f1']);
  });
  it('배정 없는 행정·방역관과 마스터는 전체', () => {
    expect(socketRoomsFor({ role: 'quarantine_officer', farmIds: [] })).toEqual(['alarms:all']);
    expect(socketRoomsFor({ role: 'farmer', farmIds: [], isMaster: true })).toEqual(['alarms:all']);
  });
  it('미배정 농장주는 어떤 방에도 들어가지 않는다', () => {
    expect(socketRoomsFor({ role: 'farmer', farmIds: [] })).toEqual([]);
  });
  it('토큰 만료까지 남은 시간', () => {
    const now = 1_700_000_000_000;
    const token = jwt.sign({ userId: 'u', exp: Math.floor(now / 1000) + 60 }, 'k');
    expect(msUntilExpiry(token, now)).toBe(60_000);
    expect(msUntilExpiry('garbage', now)).toBeNull();
  });
});
