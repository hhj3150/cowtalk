// OPS-11 회귀 — Anthropic SDK 기본값(10분 + 재시도 2회)으로 요청·잡이 오래 멈추던 문제
import { describe, it, expect } from 'vitest';
import { anthropicClientOptions } from '../anthropic-client-options.js';

describe('OPS-11 anthropicClientOptions', () => {
  it('타임아웃·재시도를 SDK 기본값보다 짧게 고정', () => {
    const o = anthropicClientOptions();
    expect(o.timeout).toBe(180_000);
    expect(o.maxRetries).toBe(1);
  });
});
