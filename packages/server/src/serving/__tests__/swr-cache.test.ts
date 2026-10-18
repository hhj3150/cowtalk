import { describe, it, expect, vi } from 'vitest';
import { createSwrCache } from '../swr-cache.js';

function setup(maxEntries = 10) {
  let t = 0;
  const cache = createSwrCache<number>({ freshMs: 60_000, staleMs: 300_000, maxEntries, now: () => t });
  return { cache, advance: (ms: number) => { t += ms; } };
}

function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

const noop = (): void => {};

describe('createSwrCache', () => {
  it('fresh 구간에서는 loader를 다시 호출하지 않는다', async () => {
    const { cache, advance } = setup();
    const loader = vi.fn().mockResolvedValue(1);
    expect(await cache.get('k', loader, noop)).toBe(1);
    advance(59_000);
    expect(await cache.get('k', loader, noop)).toBe(1);
    expect(loader).toHaveBeenCalledTimes(1);
  });

  it('동시 요청은 하나의 계산에 합류한다 (single-flight)', async () => {
    const { cache } = setup();
    const d = deferred<number>();
    const loader = vi.fn(() => d.promise);
    const a = cache.get('k', loader, noop);
    const b = cache.get('k', loader, noop);
    const c = cache.get('k', loader, noop);
    d.resolve(7);
    expect(await Promise.all([a, b, c])).toEqual([7, 7, 7]);
    expect(loader).toHaveBeenCalledTimes(1);
  });

  it('stale 구간에서는 이전 값을 즉시 주고 백그라운드로 갱신한다', async () => {
    const { cache, advance } = setup();
    await cache.get('k', () => Promise.resolve(1), noop);
    advance(120_000);
    const d = deferred<number>();
    const loader = vi.fn(() => d.promise);
    expect(await cache.get('k', loader, noop)).toBe(1);
    expect(loader).toHaveBeenCalledTimes(1);
    d.resolve(2);
    await d.promise;
    await Promise.resolve();
    expect(await cache.get('k', loader, noop)).toBe(2);
  });

  it('백그라운드 갱신 실패는 onBackgroundError로 보고되고 이전 값은 유지된다', async () => {
    const { cache, advance } = setup();
    await cache.get('k', () => Promise.resolve(1), noop);
    advance(120_000);
    const onErr = vi.fn();
    const err = new Error('db down');
    expect(await cache.get('k', () => Promise.reject(err), onErr)).toBe(1);
    await new Promise((r) => setTimeout(r, 0));
    expect(onErr).toHaveBeenCalledWith(err);
    expect(await cache.get('k', () => Promise.resolve(9), noop)).toBe(1);
  });

  it('만료된 값은 반환하지 않고 새 계산을 기다린다', async () => {
    const { cache, advance } = setup();
    await cache.get('k', () => Promise.resolve(1), noop);
    advance(300_001);
    expect(await cache.get('k', () => Promise.resolve(2), noop)).toBe(2);
  });

  it('계산 실패는 호출자에게 전파되고 다음 요청은 다시 시도한다', async () => {
    const { cache } = setup();
    await expect(cache.get('k', () => Promise.reject(new Error('x')), noop)).rejects.toThrow('x');
    expect(await cache.get('k', () => Promise.resolve(3), noop)).toBe(3);
  });

  it('키가 다르면 값이 섞이지 않는다 (권한 스코프 분리)', async () => {
    const { cache } = setup();
    await cache.get('farm-a', () => Promise.resolve(1), noop);
    expect(await cache.get('farm-b', () => Promise.resolve(2), noop)).toBe(2);
    expect(await cache.get('farm-a', () => Promise.resolve(99), noop)).toBe(1);
  });

  it('maxEntries를 넘으면 가장 오래된 키부터 제거한다', async () => {
    const { cache } = setup(2);
    await cache.get('a', () => Promise.resolve(1), noop);
    await cache.get('b', () => Promise.resolve(2), noop);
    await cache.get('c', () => Promise.resolve(3), noop);
    expect(cache.size()).toBe(2);
    expect(await cache.get('a', () => Promise.resolve(10), noop)).toBe(10);
  });
});
