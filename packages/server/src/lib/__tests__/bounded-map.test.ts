// OPS-16 회귀 — 개체·사용자 단위 캐시 Map 이 제거 정책 없이 계속 자라던 문제
import { describe, it, expect } from 'vitest';
import { setBounded } from '../bounded-map.js';

describe('OPS-16 setBounded', () => {
  it('상한을 넘으면 가장 오래된 것부터 버린다', () => {
    const m = new Map<string, number>();
    for (let i = 0; i < 10; i++) setBounded(m, `k${String(i)}`, i, 3);
    expect([...m.keys()]).toEqual(['k7', 'k8', 'k9']);
  });
  it('같은 키를 다시 넣으면 최근으로 옮겨 살아남는다', () => {
    const m = new Map<string, number>();
    setBounded(m, 'a', 1, 2); setBounded(m, 'b', 2, 2); setBounded(m, 'a', 3, 2); setBounded(m, 'c', 4, 2);
    expect([...m.entries()]).toEqual([['a', 3], ['c', 4]]);
  });
});
