// 유량 CSV 파서 테스트 — 헤더 감지·구분자·범위 검증

import { describe, it, expect } from 'vitest';
import { parseMilkCsv } from '../utils/milk-csv.js';

describe('parseMilkCsv', () => {
  it('기본 "귀번호,유량" 형식을 파싱한다', () => {
    const { rows, errors } = parseMilkCsv('423,31.5\n517,28\n88,22.4');
    expect(rows.get('423')).toBe(31.5);
    expect(rows.get('517')).toBe(28);
    expect(rows.size).toBe(3);
    expect(errors).toHaveLength(0);
  });

  it('첫 행이 헤더면 자동으로 건너뛴다', () => {
    const { rows, errors } = parseMilkCsv('귀번호,유량\n423,31.5');
    expect(rows.get('423')).toBe(31.5);
    expect(rows.size).toBe(1);
    expect(errors).toHaveLength(0);
  });

  it('탭·세미콜론 구분자와 빈 줄을 허용한다', () => {
    const { rows } = parseMilkCsv('423\t31.5\n\n517;28\n');
    expect(rows.get('423')).toBe(31.5);
    expect(rows.get('517')).toBe(28);
  });

  it('범위 밖(0~100L)·숫자 아님·열 부족은 오류로 수집한다', () => {
    const { rows, errors } = parseMilkCsv('423,150\n517,abc\n단독열\n88,25');
    expect(rows.size).toBe(1);
    expect(rows.get('88')).toBe(25);
    expect(errors.length).toBe(3);
  });

  it('같은 귀번호가 반복되면 마지막 값을 쓴다', () => {
    const { rows } = parseMilkCsv('423,30\n423,32');
    expect(rows.get('423')).toBe(32);
  });
});
