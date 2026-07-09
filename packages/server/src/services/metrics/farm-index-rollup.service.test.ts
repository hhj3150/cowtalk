// 지수 롤업 순수 함수 테스트 — 시도별 평균·모수·변화, 스냅샷 없는 시도 null

import { describe, it, expect } from 'vitest';
import { rollupByProvince } from './farm-index-rollup.service.js';

const TOTALS = new Map([['경기', 3], ['충남', 2], ['제주', 1]]);

describe('rollupByProvince', () => {
  it('시도별 평균과 모수(스냅샷 농장 수)를 집계한다', () => {
    const { provinces, nationalAvg, snappedFarms } = rollupByProvince([
      { farmId: 'a', province: '경기', overall: 80, prevOverall: null },
      { farmId: 'b', province: '경기', overall: 90, prevOverall: null },
      { farmId: 'c', province: '충남', overall: 70, prevOverall: null },
    ], TOTALS);
    const gg = provinces.find((p) => p.province === '경기')!;
    expect(gg.avgOverall).toBe(85);
    expect(gg.snappedFarms).toBe(2);
    expect(gg.totalFarms).toBe(3);
    expect(nationalAvg).toBe(80); // (80+90+70)/3
    expect(snappedFarms).toBe(3);
  });

  it('스냅샷 없는 시도는 avgOverall null — 합성값 금지', () => {
    const { provinces } = rollupByProvince([
      { farmId: 'a', province: '경기', overall: 80, prevOverall: null },
    ], TOTALS);
    const jeju = provinces.find((p) => p.province === '제주')!;
    expect(jeju.avgOverall).toBeNull();
    expect(jeju.snappedFarms).toBe(0);
    expect(jeju.totalFarms).toBe(1);
  });

  it('7일 전 스냅샷이 있는 농장만으로 delta를 계산하고, 없으면 null', () => {
    const { provinces } = rollupByProvince([
      { farmId: 'a', province: '경기', overall: 80, prevOverall: 70 },  // +10
      { farmId: 'b', province: '경기', overall: 90, prevOverall: null }, // delta 제외
      { farmId: 'c', province: '충남', overall: 70, prevOverall: null },
    ], TOTALS);
    expect(provinces.find((p) => p.province === '경기')!.delta7d).toBe(10);
    expect(provinces.find((p) => p.province === '충남')!.delta7d).toBeNull();
  });

  it('평균 내림차순 정렬 (null은 마지막)', () => {
    const { provinces } = rollupByProvince([
      { farmId: 'a', province: '경기', overall: 60, prevOverall: null },
      { farmId: 'c', province: '충남', overall: 90, prevOverall: null },
    ], TOTALS);
    expect(provinces[0]!.province).toBe('충남');
    expect(provinces[provinces.length - 1]!.avgOverall).toBeNull(); // 제주
  });

  it('전부 스냅샷 없으면 전국 평균 null', () => {
    const { nationalAvg } = rollupByProvince([], TOTALS);
    expect(nationalAvg).toBeNull();
  });
});
