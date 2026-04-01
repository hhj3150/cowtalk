import ExcelJS from 'exceljs';
import { REPORT_CONFIG } from '../config.js';

interface SheetDef {
  readonly name?: string;
  readonly headers?: readonly string[];
  readonly rows?: readonly (readonly unknown[])[];
  readonly column_widths?: readonly number[];
  readonly column_formats?: readonly string[];
  readonly summary_row?: { readonly label?: string; readonly formulas?: readonly string[] };
}

interface XlsxContent {
  readonly title?: string;
  readonly sheets?: readonly SheetDef[];
}

const { FONT } = REPORT_CONFIG.DOCUMENT;
const { PRIMARY, TABLE_ALT } = REPORT_CONFIG.DOCUMENT.COLORS;

const GREEN_BG: Partial<ExcelJS.Fill> = {
  type: 'pattern',
  pattern: 'solid',
  fgColor: { argb: `FF${PRIMARY}` },
};

const ALT_ROW_BG: Partial<ExcelJS.Fill> = {
  type: 'pattern',
  pattern: 'solid',
  fgColor: { argb: `FF${TABLE_ALT}` },
};

const THIN_BORDER: Partial<ExcelJS.Borders> = {
  top: { style: 'thin' },
  left: { style: 'thin' },
  bottom: { style: 'thin' },
  right: { style: 'thin' },
};

function sanitizeSheetName(name: string): string {
  return name.replace(/[\\/*?[\]:]/g, '_').slice(0, 31) || 'Sheet';
}

export async function generateXlsx(
  content: Record<string, unknown>,
  outputPath: string,
): Promise<void> {
  const data = content as unknown as XlsxContent;
  const sheets = data.sheets ?? [];

  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'CowTalk';
  workbook.created = new Date();

  if (sheets.length === 0) {
    const ws = workbook.addWorksheet('Sheet1');
    ws.getCell('A1').value = data.title ?? '보고서';
    await workbook.xlsx.writeFile(outputPath);
    return;
  }

  for (const [idx, sheet] of sheets.entries()) {
    const sheetName = sanitizeSheetName(sheet.name ?? `Sheet${idx + 1}`);
    const headers = sheet.headers ?? [];
    const rows = sheet.rows ?? [];
    const colCount = Math.max(headers.length, 1);
    const ws = workbook.addWorksheet(sheetName);

    // Column widths
    for (let c = 0; c < colCount; c++) {
      ws.getColumn(c + 1).width = sheet.column_widths?.[c] ?? 15;
    }

    // Title row
    const titleRow = ws.addRow([data.title ?? '보고서']);
    if (colCount > 1) {
      ws.mergeCells(1, 1, 1, colCount);
    }
    const titleCell = titleRow.getCell(1);
    titleCell.font = { name: FONT, size: 14, bold: true, color: { argb: 'FFFFFFFF' } };
    titleCell.fill = GREEN_BG as ExcelJS.Fill;
    titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
    titleRow.height = 30;

    // Header row
    if (headers.length > 0) {
      const headerRow = ws.addRow([...headers]);
      headerRow.eachCell((cell) => {
        cell.font = { name: FONT, size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
        cell.fill = GREEN_BG as ExcelJS.Fill;
        cell.border = THIN_BORDER as ExcelJS.Borders;
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
      });
      headerRow.height = 24;
      ws.autoFilter = { from: { row: 2, column: 1 }, to: { row: 2, column: colCount } };
    }

    // Data rows
    for (const [rowIdx, rowData] of rows.entries()) {
      const dataRow = ws.addRow([...rowData]);
      const isAlt = rowIdx % 2 === 1;
      dataRow.eachCell((cell, colNumber) => {
        cell.font = { name: FONT, size: 10 };
        cell.border = THIN_BORDER as ExcelJS.Borders;
        if (isAlt) {
          cell.fill = ALT_ROW_BG as ExcelJS.Fill;
        }
        const fmt = sheet.column_formats?.[colNumber - 1];
        if (fmt === 'number' && typeof cell.value === 'number') {
          cell.numFmt = '#,##0';
        }
      });
    }

    // Summary row
    if (sheet.summary_row) {
      const { label, formulas } = sheet.summary_row;
      const summaryValues: unknown[] = [];
      const dataStartRow = 3; // title=1, header=2, data starts at 3
      const dataEndRow = dataStartRow + rows.length - 1;

      for (let c = 0; c < colCount; c++) {
        const formula = formulas?.[c];
        if (c === 0 && !formula) {
          summaryValues.push(label ?? '합계');
        } else if (formula === 'SUM' || formula === 'AVERAGE' || formula === 'COUNT') {
          const colLetter = String.fromCharCode(65 + c);
          summaryValues.push({ formula: `${formula}(${colLetter}${dataStartRow}:${colLetter}${dataEndRow})` });
        } else {
          summaryValues.push(formula ?? '');
        }
      }

      const sumRow = ws.addRow(summaryValues);
      sumRow.eachCell((cell) => {
        cell.font = { name: FONT, size: 10, bold: true };
        cell.fill = ALT_ROW_BG as ExcelJS.Fill;
        cell.border = THIN_BORDER as ExcelJS.Borders;
      });
    }
  }

  await workbook.xlsx.writeFile(outputPath);
}
