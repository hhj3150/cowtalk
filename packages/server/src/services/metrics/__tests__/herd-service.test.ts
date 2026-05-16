// herd-service 순수 함수 테스트 — DB 의존성 없음.
// metrics-contract.md §7 (BUG-007) / Decision D5·D7·D8·D9·D11·D13·D14

import { describe, it, expect } from 'vitest';
import {
  computeHerd,
  herdUnavailable,
  aggregateHerdByProvince,
} from '../herd-service.js';

describe('computeHerd (D13: 실측 0두 vs 측정 불가 분리)', () => {
  it('실측 0두 (count=0) → status="ok" + displayValue="0두" (D13)', () => {
    // farm 존재 + animals 0건 (실측). "—"가 아니라 "0두" 표시.
    expect(computeHerd(0)).toEqual({
      total: 0,
      displayValue: '0두',
      status: 'ok',
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

  it('음수 입력 → herdUnavailable (D13 측정 불가)', () => {
    expect(computeHerd(-5)).toEqual({
      total: 0,
      displayValue: '—',
      status: 'data_insufficient',
      source: 'live',
    });
  });

  it('NaN 입력 → herdUnavailable (Number.isFinite 가드)', () => {
    expect(computeHerd(Number.NaN).status).toBe('data_insufficient');
    expect(computeHerd(Number.NaN).displayValue).toBe('—');
  });

  it('Infinity → herdUnavailable', () => {
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

  it('source="registered" 명시 → 보존 (D8 호출처 정책 추적)', () => {
    expect(computeHerd(100, 'registered').source).toBe('registered');
  });

  it('registered + 0두도 실측 → "0두" (D13)', () => {
    expect(computeHerd(0, 'registered')).toEqual({
      total: 0,
      displayValue: '0두',
      status: 'ok',
      source: 'registered',
    });
  });
});

describe('herdUnavailable (D13 측정 불가 헬퍼)', () => {
  it('기본 source=live + 측정 불가 결과', () => {
    expect(herdUnavailable()).toEqual({
      total: 0,
      displayValue: '—',
      status: 'data_insufficient',
      source: 'live',
    });
  });

  it('source="registered" 명시 → source 보존', () => {
    expect(herdUnavailable('registered')).toEqual({
      total: 0,
      displayValue: '—',
      status: 'data_insufficient',
      source: 'registered',
    });
  });
});

describe('D13 실측 0 vs 측정 불가 명시 비교', () => {
  it('실측 0두는 "0두" — UI에 "이 농장 동물 없음"으로 정확히 표시', () => {
    const result = computeHerd(0);
    expect(result.status).toBe('ok');
    expect(result.displayValue).toBe('0두');
    expect(result.displayValue).not.toBe('—');
  });

  it('측정 불가는 "—" — UI에 "데이터 부족"으로 정확히 표시', () => {
    const result = herdUnavailable();
    expect(result.status).toBe('data_insufficient');
    expect(result.displayValue).toBe('—');
    expect(result.displayValue).not.toBe('0두');
  });
});

describe('aggregateHerdByProvince (D14 시도별 집계)', () => {
  // 9 시도 좌표 (province-mapper PROVINCE_CENTERS 기반)
  const GG_LAT = 37.41; const GG_LNG = 127.52;     // 경기도
  const CN_LAT = 36.51; const CN_LNG = 126.80;     // 충청남도
  const JJ_LAT = 33.49; const JJ_LNG = 126.53;     // 제주특별자치도

  it('빈 입력 → 9 시도 모두 "0두" (실측 0)', () => {
    const result = aggregateHerdByProvince([]);
    expect(result.size).toBe(9);
    for (const [, herd] of result) {
      expect(herd.status).toBe('ok');
      expect(herd.displayValue).toBe('0두');
      expect(herd.total).toBe(0);
    }
  });

  it('경기 5두 + 충남 3두 + 제주 1두 → 각 시도 정확히 집계', () => {
    const rows = [
      ...Array.from({ length: 5 }, () => ({ lat: GG_LAT, lng: GG_LNG })),
      ...Array.from({ length: 3 }, () => ({ lat: CN_LAT, lng: CN_LNG })),
      { lat: JJ_LAT, lng: JJ_LNG },
    ];
    const result = aggregateHerdByProvince(rows);
    expect(result.get('경기도')?.total).toBe(5);
    expect(result.get('경기도')?.displayValue).toBe('5두');
    expect(result.get('충청남도')?.total).toBe(3);
    expect(result.get('제주특별자치도')?.total).toBe(1);
    expect(result.get('경상북도')?.total).toBe(0); // 미사용 시도도 0두 'ok'
    expect(result.get('경상북도')?.status).toBe('ok');
  });

  it('해외 / 미분류 좌표는 집계 제외', () => {
    const rows = [
      { lat: GG_LAT, lng: GG_LNG },        // 경기 1두
      { lat: null, lng: null },            // 미분류
      { lat: 0, lng: 0 },                  // 해외 (한국 범위 밖)
      { lat: 40.0, lng: 130.0 },           // 해외
    ];
    const result = aggregateHerdByProvince(rows);
    expect(result.get('경기도')?.total).toBe(1);
    // 해외/미분류는 결과 map에 키로 존재하지 않음
    expect(result.has('해외')).toBe(false);
    expect(result.has('미분류')).toBe(false);
  });

  it('항상 9 시도 모두 포함 (caller가 9개 셀 다 그릴 수 있게)', () => {
    const result = aggregateHerdByProvince([]);
    const expected = ['경기도', '강원특별자치도', '충청북도', '충청남도', '전라북도', '전라남도', '경상북도', '경상남도', '제주특별자치도'];
    for (const p of expected) {
      expect(result.has(p)).toBe(true);
    }
  });

  it('큰 데이터 (10,666두 경기) → 천단위 콤마 포맷', () => {
    const rows = Array.from({ length: 10666 }, () => ({ lat: GG_LAT, lng: GG_LNG }));
    const result = aggregateHerdByProvince(rows);
    expect(result.get('경기도')?.displayValue).toBe('10,666두');
  });
});
