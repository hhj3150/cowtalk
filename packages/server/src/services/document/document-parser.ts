// 첨부 문서 파서 — Excel/CSV 를 LLM 친화적 텍스트(마크다운 테이블)로 변환.
// PDF는 Claude API가 네이티브 지원하므로 별도 파싱 안 함.

import ExcelJS from 'exceljs';
import { logger } from '../../lib/logger.js';

const MAX_ROWS_PER_SHEET = 200;
const MAX_COLS_PER_ROW = 30;
const MAX_CELL_LEN = 200;

export interface DocumentInput {
  readonly data: string; // base64
  readonly mimeType: string;
  readonly filename?: string;
}

export interface ParsedDocument {
  readonly filename: string;
  readonly mimeType: string;
  /** PDF면 base64 그대로 (Claude API에 document block으로 전달용) */
  readonly pdfBase64?: string;
  /** Excel/CSV면 파싱된 마크다운 텍스트 (system context로 주입) */
  readonly textContent?: string;
  readonly note?: string;
}

function truncateCell(value: unknown): string {
  if (value == null) return '';
  let s = String(value).replace(/\s+/g, ' ').trim();
  if (s.length > MAX_CELL_LEN) s = `${s.slice(0, MAX_CELL_LEN)}…`;
  return s;
}

async function parseXlsx(buffer: Buffer, filename: string): Promise<string> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer as unknown as ArrayBuffer);

  const sheetTexts: string[] = [`# 파일: ${filename}\n`];
  wb.eachSheet((sheet, sheetIdx) => {
    const lines: string[] = [`\n## 시트 ${sheetIdx}: ${sheet.name}`];
    let rowCount = 0;
    let headerWritten = false;
    sheet.eachRow({ includeEmpty: false }, (row, rowIdx) => {
      if (rowCount >= MAX_ROWS_PER_SHEET) return;
      const cells: string[] = [];
      const maxCol = Math.min(row.cellCount, MAX_COLS_PER_ROW);
      for (let i = 1; i <= maxCol; i++) {
        cells.push(truncateCell(row.getCell(i).value));
      }
      // 빈 행 스킵
      if (cells.every((c) => c === '')) return;
      lines.push(`| ${cells.join(' | ')} |`);
      if (!headerWritten && rowIdx === 1) {
        lines.push(`| ${cells.map(() => '---').join(' | ')} |`);
        headerWritten = true;
      }
      rowCount++;
    });
    if (rowCount >= MAX_ROWS_PER_SHEET) {
      lines.push(`\n(... 처음 ${String(MAX_ROWS_PER_SHEET)}행만 표시. 전체 데이터는 원본 참조)`);
    }
    sheetTexts.push(lines.join('\n'));
  });
  return sheetTexts.join('\n');
}

function parseCsv(buffer: Buffer, filename: string): string {
  // 간단한 CSV 파서 — 큰따옴표·쉼표 escape 처리. 90% 케이스는 처리됨.
  const text = buffer.toString('utf8').replace(/^﻿/, ''); // BOM 제거
  const rows: string[][] = [];
  let cur: string[] = [];
  let cell = '';
  let inQuote = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuote) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; continue; }
      if (c === '"') { inQuote = false; continue; }
      cell += c;
    } else {
      if (c === '"') { inQuote = true; continue; }
      if (c === ',') { cur.push(cell); cell = ''; continue; }
      if (c === '\n' || c === '\r') {
        if (cell !== '' || cur.length > 0) { cur.push(cell); rows.push(cur); cur = []; cell = ''; }
        if (c === '\r' && text[i + 1] === '\n') i++;
        continue;
      }
      cell += c;
    }
  }
  if (cell !== '' || cur.length > 0) { cur.push(cell); rows.push(cur); }

  const lines: string[] = [`# 파일: ${filename}\n`];
  if (rows.length === 0) {
    lines.push('(빈 CSV)');
    return lines.join('\n');
  }
  const truncatedRows = rows.slice(0, MAX_ROWS_PER_SHEET);
  for (let r = 0; r < truncatedRows.length; r++) {
    const cells = (truncatedRows[r] ?? []).slice(0, MAX_COLS_PER_ROW).map(truncateCell);
    lines.push(`| ${cells.join(' | ')} |`);
    if (r === 0) lines.push(`| ${cells.map(() => '---').join(' | ')} |`);
  }
  if (rows.length > MAX_ROWS_PER_SHEET) {
    lines.push(`\n(... 처음 ${String(MAX_ROWS_PER_SHEET)}행만 표시)`);
  }
  return lines.join('\n');
}

export async function parseDocument(doc: DocumentInput): Promise<ParsedDocument> {
  const filename = doc.filename ?? 'document';
  const buffer = Buffer.from(doc.data, 'base64');

  if (doc.mimeType === 'application/pdf') {
    // PDF: Claude 네이티브. base64 그대로 전달.
    return {
      filename,
      mimeType: doc.mimeType,
      pdfBase64: doc.data,
    };
  }

  if (doc.mimeType === 'text/csv') {
    try {
      const textContent = parseCsv(buffer, filename);
      return { filename, mimeType: doc.mimeType, textContent };
    } catch (err) {
      logger.warn({ err, filename }, '[document-parser] CSV 파싱 실패');
      return { filename, mimeType: doc.mimeType, note: 'CSV 파싱 실패' };
    }
  }

  if (
    doc.mimeType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
    doc.mimeType === 'application/vnd.ms-excel'
  ) {
    try {
      const textContent = await parseXlsx(buffer, filename);
      return { filename, mimeType: doc.mimeType, textContent };
    } catch (err) {
      logger.warn({ err, filename }, '[document-parser] XLSX 파싱 실패');
      return { filename, mimeType: doc.mimeType, note: 'XLSX 파싱 실패' };
    }
  }

  return { filename, mimeType: doc.mimeType, note: '지원하지 않는 형식' };
}
