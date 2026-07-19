// 유량 CSV 파서 테스트 — 헤더 감지·구분자·범위·유성분(검정성적 호환) 검증

import { describe, it, expect } from 'vitest';
import { parseMilkCsv, parseDelimited, detectMilkColumns, extractMilkRows } from '../utils/milk-csv.js';

describe('parseMilkCsv', () => {
  it('기본 "귀번호,유량" 형식을 파싱한다', () => {
    const { rows, errors } = parseMilkCsv('423,31.5\n517,28\n88,22.4');
    expect(rows.get('423')?.yieldL).toBe(31.5);
    expect(rows.get('517')?.yieldL).toBe(28);
    expect(rows.size).toBe(3);
    expect(errors).toHaveLength(0);
  });

  it('검정성적 5열(귀번호,유량,유지방,유단백,체세포)을 파싱한다', () => {
    const { rows, errors } = parseMilkCsv('귀번호,유량,유지방,유단백,체세포\n423,31.5,3.9,3.2,180');
    const r = rows.get('423')!;
    expect(r.yieldL).toBe(31.5);
    expect(r.fat).toBe(3.9);
    expect(r.protein).toBe(3.2);
    expect(r.scc).toBe(180);
    expect(errors).toHaveLength(0);
  });

  it('유성분 일부만 있어도 반영한다 (빈 칸 생략)', () => {
    const { rows } = parseMilkCsv('423,31.5,3.9\n517,28,,3.1');
    expect(rows.get('423')).toEqual({ yieldL: 31.5, fat: 3.9 });
    expect(rows.get('517')).toEqual({ yieldL: 28, protein: 3.1 });
  });

  it('첫 행이 헤더면 자동으로 건너뛴다', () => {
    const { rows, errors } = parseMilkCsv('귀번호,유량\n423,31.5');
    expect(rows.get('423')?.yieldL).toBe(31.5);
    expect(rows.size).toBe(1);
    expect(errors).toHaveLength(0);
  });

  it('탭·세미콜론 구분자와 빈 줄을 허용한다', () => {
    const { rows } = parseMilkCsv('423\t31.5\n\n517;28\n');
    expect(rows.get('423')?.yieldL).toBe(31.5);
    expect(rows.get('517')?.yieldL).toBe(28);
  });

  it('범위 밖(0~100L)·숫자 아님·열 부족은 오류로 수집한다', () => {
    const { rows, errors } = parseMilkCsv('423,150\n517,abc\n단독열\n88,25');
    expect(rows.size).toBe(1);
    expect(rows.get('88')?.yieldL).toBe(25);
    expect(errors.length).toBe(3);
  });

  it('유성분 범위 이상은 오류로 알리되 유량은 저장한다', () => {
    const { rows, errors } = parseMilkCsv('423,30,99');
    expect(rows.get('423')?.yieldL).toBe(30);
    expect(rows.get('423')?.fat).toBeUndefined();
    expect(errors.length).toBe(1);
  });

  it('같은 귀번호가 반복되면 마지막 값을 쓴다', () => {
    const { rows } = parseMilkCsv('423,30\n423,32');
    expect(rows.get('423')?.yieldL).toBe(32);
  });
});

describe('parseDelimited + detectMilkColumns (Lely T4C 등 임의 열 배치)', () => {
  it('T4C식 임의 열 배치를 헤더 이름으로 자동 감지한다', () => {
    const table = parseDelimited('동물 번호;이름;일 유량;유지방 %;방문 횟수\n423;순둥이;31.5;3.9;3\n517;복순이;28.0;4.1;2');
    expect(table.hasHeader).toBe(true);
    const mapping = detectMilkColumns(table.headers)!;
    expect(mapping.earTag).toBe(0);
    expect(mapping.yieldL).toBe(2);
    expect(mapping.fat).toBe(3);
    const { rows, errors } = extractMilkRows(table, mapping);
    expect(rows.get('423')).toEqual({ yieldL: 31.5, fat: 3.9 });
    expect(rows.get('517')?.yieldL).toBe(28);
    expect(errors).toHaveLength(0);
  });

  it('영문 헤더(Animal No, Milk yield)도 감지한다', () => {
    const mapping = detectMilkColumns(['Animal No', 'Name', 'Milk yield', 'Fat', 'SCC'])!;
    expect(mapping.earTag).toBe(0);
    expect(mapping.yieldL).toBe(2);
    expect(mapping.scc).toBe(4);
  });

  it('귀번호·유량 열을 못 찾으면 null (수동 매핑 폴백)', () => {
    expect(detectMilkColumns(['가', '나', '다'])).toBeNull();
  });

  it('헤더 없는 숫자 표는 hasHeader=false, 열 이름은 "N열"', () => {
    const table = parseDelimited('423,31.5\n517,28');
    expect(table.hasHeader).toBe(false);
    expect(table.headers[0]).toBe('1열');
    expect(table.dataRows).toHaveLength(2);
  });

  it('수동 매핑으로 임의 열에서 추출할 수 있다', () => {
    const table = parseDelimited('a,b,c\nX423,foo,31.5');
    const { rows } = extractMilkRows(table, { earTag: 0, yieldL: 2 });
    expect(rows.get('X423')?.yieldL).toBe(31.5);
  });
});
