// 내보내기 직렬화 순수 함수 테스트 — CSV 이스케이프/BOM, 포맷 정규화, 대상 검증

import { describe, it, expect } from 'vitest';
import { toCsv, toXlsxBuffer, parseExportFormat, isExportTarget, type ExportSheet } from './export.service.js';

const SHEET: ExportSheet = {
  name: '개체',
  headers: ['농장', '귀표번호'],
  rows: [
    ['해돋이목장', '423'],
    ['쉼표,농장', null],
    ['따옴표"목장', '줄\n바꿈'],
  ],
  truncated: false,
};

describe('toCsv', () => {
  it('UTF-8 BOM으로 시작한다 (Excel 한글 호환)', () => {
    expect(toCsv(SHEET).startsWith('\uFEFF')).toBe(true);
  });

  it('헤더 + 행을 CRLF로 직렬화하고 null은 빈 칸', () => {
    const lines = toCsv(SHEET).slice(1).split('\r\n');
    expect(lines[0]).toBe('농장,귀표번호');
    expect(lines[1]).toBe('해돋이목장,423');
    expect(lines[2]).toBe('"쉼표,농장",');
  });

  it('따옴표는 이중화, 줄바꿈 포함 셀은 따옴표로 감싼다', () => {
    const csv = toCsv(SHEET);
    expect(csv).toContain('"따옴표""목장"');
    expect(csv).toContain('"줄\n바꿈"');
  });
});

describe('toXlsxBuffer', () => {
  it('유효한 XLSX(ZIP) 버퍼를 만든다', async () => {
    const buf = await toXlsxBuffer(SHEET);
    // XLSX는 ZIP 컨테이너 — PK 시그니처로 검증
    expect(buf.subarray(0, 2).toString('ascii')).toBe('PK');
    expect(buf.length).toBeGreaterThan(500);
  });

  it('truncated 시트는 이름에 "(일부)"를 붙인다 — 조용한 잘림 금지', async () => {
    const buf = await toXlsxBuffer({ ...SHEET, truncated: true });
    // ZIP 압축이라 바이트 검색 불가 — 다시 읽어서 시트명 확인
    const { default: ExcelJS } = await import('exceljs');
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf as unknown as ArrayBuffer);
    expect(wb.worksheets[0]?.name).toBe('개체(일부)');
  });
});

describe('parseExportFormat', () => {
  it("웹의 'excel'과 스키마의 'xlsx' 모두 xlsx로 정규화", () => {
    expect(parseExportFormat('excel')).toBe('xlsx');
    expect(parseExportFormat('xlsx')).toBe('xlsx');
  });

  it('그 외 값은 csv 기본', () => {
    expect(parseExportFormat('csv')).toBe('csv');
    expect(parseExportFormat(undefined)).toBe('csv');
    expect(parseExportFormat('pdf')).toBe('csv');
  });
});

describe('isExportTarget', () => {
  it('6개 대상만 허용', () => {
    for (const t of ['animals', 'alerts', 'sensors', 'predictions', 'farms', 'regional']) {
      expect(isExportTarget(t)).toBe(true);
    }
    expect(isExportTarget('users')).toBe(false);
    expect(isExportTarget('')).toBe(false);
  });
});
