// 계측기 테스트 — 측정이 틀리면 최적화 방향 전체가 틀린다.

import { describe, it, expect } from 'vitest';
import { TurnTimer } from '../latency.js';

describe('TurnTimer', () => {
  it('찍은 시점만 기록한다', () => {
    const t = new TurnTimer({ turnId: 'x' });
    t.mark('sttDoneMs');
    const out = t.timings();
    expect(out.receivedMs).toBe(0);
    expect(out.sttDoneMs).toBeGreaterThanOrEqual(0);
    expect(out.ttftMs).toBeUndefined();
  });

  it('같은 시점을 두 번 찍어도 첫 번째만 남긴다 (첫 토큰 계측)', async () => {
    const t = new TurnTimer({ turnId: 'x' });
    t.mark('ttftMs');
    const first = t.timings().ttftMs;
    await new Promise((r) => setTimeout(r, 12));
    t.mark('ttftMs');
    expect(t.timings().ttftMs).toBe(first);
  });

  it('end 는 totalMs 를 채우고 실패한 턴도 기록한다', () => {
    const t = new TurnTimer({ turnId: 'x' });
    const out = t.end('error', new Error('boom'));
    expect(out.totalMs).toBeGreaterThanOrEqual(0);
  });

  it('메타는 턴 도중에 갱신된다 (라우팅 결과는 나중에 안다)', () => {
    const t = new TurnTimer({ turnId: 'x' });
    t.setMeta({ model: 'claude-haiku-4-5', tools: ['get_animal_status'] });
    expect(() => t.end('ok')).not.toThrow();
  });
});
