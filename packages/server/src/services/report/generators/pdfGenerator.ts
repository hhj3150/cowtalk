import PDFDocument from 'pdfkit';
import fs from 'fs';
import { REPORT_CONFIG } from '../config.js';

const { COLORS: CFG_COLORS } = REPORT_CONFIG.DOCUMENT;

const COLORS = {
  PRIMARY: `#${CFG_COLORS.PRIMARY}`,
  ACCENT: `#${CFG_COLORS.ACCENT}`,
  TEXT: `#${CFG_COLORS.TEXT}`,
  LIGHT_TEXT: `#${CFG_COLORS.LIGHT_TEXT}`,
  TABLE_HEADER_BG: `#${CFG_COLORS.TABLE_HEADER}`,
  TABLE_ALT_BG: `#${CFG_COLORS.TABLE_ALT}`,
} as const;

const MARGIN = 50;
const PAGE_WIDTH = 595.28;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;

interface Section {
  readonly heading?: string;
  readonly level?: number;
  readonly content?: ReadonlyArray<ContentBlock>;
}

interface ContentBlock {
  readonly type: string;
  readonly text?: string;
  readonly items?: ReadonlyArray<string>;
  readonly headers?: ReadonlyArray<string>;
  readonly rows?: ReadonlyArray<ReadonlyArray<string>>;
  readonly pairs?: ReadonlyArray<{ readonly key: string; readonly value: string }>;
}

function registerKoreanFont(doc: PDFKit.PDFDocument): string {
  const fontPath = '/usr/share/fonts/truetype/nanum/NanumGothic.ttf';
  try {
    if (fs.existsSync(fontPath)) {
      doc.registerFont('Korean', fontPath);
      return 'Korean';
    }
  } catch {
    // Fall through to default
  }
  return 'Helvetica';
}

function addPageNumbers(doc: PDFKit.PDFDocument): void {
  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i);
    doc.fontSize(8).fillColor(COLORS.LIGHT_TEXT);
    doc.text(
      `${i + 1} / ${range.count}`,
      0,
      doc.page.height - 30,
      { align: 'center', width: PAGE_WIDTH },
    );
  }
}

function ensureSpace(doc: PDFKit.PDFDocument, needed: number): void {
  if (doc.y + needed > doc.page.height - 60) {
    doc.addPage();
  }
}

function renderTitlePage(doc: PDFKit.PDFDocument, font: string, content: Record<string, unknown>): void {
  doc.moveDown(8);
  doc.fontSize(28).font(font).fillColor(COLORS.PRIMARY);
  doc.text(String(content.title ?? 'CowTalk Report'), MARGIN, doc.y, { align: 'center', width: CONTENT_WIDTH });
  if (content.subtitle) {
    doc.moveDown(0.5).fontSize(16).fillColor(COLORS.ACCENT);
    doc.text(String(content.subtitle), { align: 'center', width: CONTENT_WIDTH });
  }
  doc.moveDown(2).fontSize(12).fillColor(COLORS.LIGHT_TEXT);
  const meta = [content.date, content.author].filter(Boolean).join('  |  ');
  if (meta) doc.text(meta, { align: 'center', width: CONTENT_WIDTH });
}

function renderTable(
  doc: PDFKit.PDFDocument,
  font: string,
  headers: ReadonlyArray<string>,
  rows: ReadonlyArray<ReadonlyArray<string>>,
): void {
  const colCount = headers.length;
  const colWidth = CONTENT_WIDTH / colCount;
  const rowHeight = 22;

  ensureSpace(doc, rowHeight * 2);

  // Header row
  const headerY = doc.y;
  doc.rect(MARGIN, headerY, CONTENT_WIDTH, rowHeight).fill(COLORS.TABLE_HEADER_BG);
  doc.fontSize(9).font(font).fillColor('#FFFFFF');
  headers.forEach((h, i) => {
    doc.text(String(h), MARGIN + i * colWidth + 4, headerY + 5, {
      width: colWidth - 8,
      height: rowHeight,
      lineBreak: false,
    });
  });
  doc.y = headerY + rowHeight;

  // Data rows
  rows.forEach((row, rowIdx) => {
    ensureSpace(doc, rowHeight);
    const rowY = doc.y;

    if (rowIdx % 2 === 1) {
      doc.rect(MARGIN, rowY, CONTENT_WIDTH, rowHeight).fill(COLORS.TABLE_ALT_BG);
    }

    doc.fontSize(9).font(font).fillColor(COLORS.TEXT);
    row.forEach((cell, i) => {
      doc.text(String(cell ?? ''), MARGIN + i * colWidth + 4, rowY + 5, {
        width: colWidth - 8,
        height: rowHeight,
        lineBreak: false,
      });
    });
    doc.y = rowY + rowHeight;
  });

  doc.moveDown(0.5);
}

function renderBlock(
  doc: PDFKit.PDFDocument,
  font: string,
  block: ContentBlock,
): void {
  switch (block.type) {
    case 'paragraph': {
      ensureSpace(doc, 30);
      doc.fontSize(10).font(font).fillColor(COLORS.TEXT);
      doc.text(String(block.text ?? ''), MARGIN, doc.y, { width: CONTENT_WIDTH });
      doc.moveDown(0.5);
      break;
    }
    case 'bullet_list': {
      (block.items ?? []).forEach((item) => {
        ensureSpace(doc, 20);
        doc.fontSize(10).font(font).fillColor(COLORS.TEXT);
        doc.text(`  \u2022  ${item}`, MARGIN + 10, doc.y, { width: CONTENT_WIDTH - 10 });
      });
      doc.moveDown(0.3);
      break;
    }
    case 'numbered_list': {
      (block.items ?? []).forEach((item, idx) => {
        ensureSpace(doc, 20);
        doc.fontSize(10).font(font).fillColor(COLORS.TEXT);
        doc.text(`  ${idx + 1}.  ${item}`, MARGIN + 10, doc.y, { width: CONTENT_WIDTH - 10 });
      });
      doc.moveDown(0.3);
      break;
    }
    case 'table': {
      renderTable(doc, font, block.headers ?? [], block.rows ?? []);
      break;
    }
    case 'key_value': {
      (block.pairs ?? []).forEach((pair) => {
        ensureSpace(doc, 20);
        doc.fontSize(10).font(font).fillColor(COLORS.ACCENT);
        doc.text(`${pair.key}: `, MARGIN + 10, doc.y, { continued: true });
        doc.fillColor(COLORS.TEXT).text(String(pair.value));
      });
      doc.moveDown(0.3);
      break;
    }
    default:
      break;
  }
}

function renderSections(doc: PDFKit.PDFDocument, font: string, sections: ReadonlyArray<Section>): void {
  for (const section of sections) {
    const isH1 = (section.level ?? 1) === 1;
    ensureSpace(doc, 50);
    doc.moveDown(isH1 ? 1.2 : 0.8);
    doc.fontSize(isH1 ? 16 : 13).font(font).fillColor(COLORS.PRIMARY);
    doc.text(String(section.heading ?? ''), MARGIN, doc.y, { width: CONTENT_WIDTH });
    doc.moveDown(0.4);
    if (section.content) {
      for (const block of section.content) renderBlock(doc, font, block);
    }
  }
}

export async function generatePdf(
  content: Record<string, unknown>,
  outputPath: string,
): Promise<void> {
  const doc = new PDFDocument({
    size: 'A4',
    margins: { top: MARGIN, bottom: MARGIN, left: MARGIN, right: MARGIN },
    bufferPages: true,
    info: {
      Title: String(content.title ?? 'CowTalk Report'),
      Author: String(content.author ?? 'CowTalk AI'),
    },
  });

  const font = registerKoreanFont(doc);

  const stream = fs.createWriteStream(outputPath);
  doc.pipe(stream);

  renderTitlePage(doc, font, content);

  const sections = Array.isArray(content.sections) ? content.sections as ReadonlyArray<Section> : [];
  if (sections.length > 0) {
    doc.addPage();
    renderSections(doc, font, sections);
  }

  if (content.summary) {
    ensureSpace(doc, 80);
    doc.moveDown(1.5);
    doc.fontSize(14).font(font).fillColor(COLORS.PRIMARY);
    doc.text('--- Summary ---', MARGIN, doc.y, {
      align: 'center',
      width: CONTENT_WIDTH,
    });
    doc.moveDown(0.5);
    doc.fontSize(11).fillColor(COLORS.TEXT);
    doc.text(String(content.summary), MARGIN, doc.y, { width: CONTENT_WIDTH });
  }

  addPageNumbers(doc);
  doc.end();

  return new Promise((resolve, reject) => {
    stream.on('finish', resolve);
    stream.on('error', reject);
  });
}
