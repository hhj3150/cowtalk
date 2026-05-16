// herd-service 순수 함수 테스트 — DB 의존성 없음.
// metrics-contract.md (BUG-007) / Decision D5·D7·D8·D9

import { describe, it, expect } from 'vitest';
import { computeHerd } from '../herd-service.js';

describe('computeHerd', () => {
  it('카운트 0 → status="data_insufficient" + displayValue="—" (D5 빈 농장)', () => {
    expect(computeHerd(0)).toEqual({
      total: 0,
      displayValue: '—',
      status: 'data_insufficient',
      source: 'live',
    });
  });

  it('10,666두 (Definition B 라이브) → "10,666두" 로케일 포맷', () => {
    expect(computeHerd(10666)).toEqual({
      total: 10666,
      displayValue: '10,666두',
      status: 'ok',
      source: 'live',
    });
  });

  it('11,376두 (Definition A 등록) → "11,376두" + source="registered"', () => {
    expect(computeHerd(11376, 'registered')).toEqual({
      total: 11376,
      displayValue: '11,376두',
      status: 'ok',
      source: 'registered',
    });
  });

  it('단일 케이스 (1두) → "1두"', () => {
    expect(computeHerd(1)).toEqual({
      total: 1,
      displayValue: '1두',
      status: 'ok',
      source: 'live',
    });
  });

  it('큰 숫자 (197,000두) → 천단위 콤마', () => {
    const result = computeHerd(197000);
    expect(result.displayValue).toBe('197,000두');
    expect(result.status).toBe('ok');
  });

  it('음수 입력 → "—" (D5 가드)', () => {
    expect(computeHerd(-5)).toEqual({
      total: 0,
      displayValue: '—',
      status: 'data_insufficient',
      source: 'live',
    });
  });

  it('NaN 입력 → "—" (Number.isFinite 가드)', () => {
    expect(computeHerd(Number.NaN).status).toBe('data_insufficient');
    expect(computeHerd(Number.NaN).displayValue).toBe('—');
  });

  it('Infinity → "—"', () => {
    expect(computeHerd(Number.POSITIVE_INFINITY).status).toBe('data_insufficient');
  });

  it('소수점 → Math.floor (10.7두는 불가능)', () => {
    const result = computeHerd(10.7);
    expect(result.total).toBe(10);
    expect(result.displayValue).toBe('10두');
  });

  it('source 기본값 = "live" (D9 default)', () => {
    expect(computeHerd(100).source).toBe('live');
  });

  it('source="registered" 명시 → "registered" 보존 (D8 호출처 디버깅)', () => {
    expect(computeHerd(100, 'registered').source).toBe('registered');
  });
});

describe('D5/D7/D8/D9 의미 검증', () => {
  it('rate=0 (실값) vs rate=null (빈 농장) 구별 — D5 핵심', () => {
    // fertility-service와 달리 herd는 "총 0두 = 실값" vs "데이터 없음"이 모호.
    // 농장 자체가 없으면 빈 농장. 농장은 있는데 동물 0두면 실값 0... 하지만 그것도 의미적으로 빈 농장.
    // 따라서 동물 카운트 0 = data_insufficient로 통일 (현재 구현).
    expect(computeHerd(0).status).toBe('data_insufficient');
    expect(computeHerd(0).displayValue).toBe('—');
  });

  it('Definition A (registered) vs Definition B (live) 동시 호출 — source 필드로 구별', () => {
    const live = computeHerd(10666, 'live');
    const registered = computeHerd(11376, 'registered');
    // 두 결과가 같은 페이지에 노출되어도 source 필드로 구별 가능.
    expect(live.source).not.toBe(registered.source);
    expect(live.total).not.toBe(registered.total);
    // D9: 사용자 노출은 live만 — 호출처 정책으로 강제. 본 테스트는 호출 자체는 가능함을 검증.
  });
});
