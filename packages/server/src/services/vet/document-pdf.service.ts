// 수의사 진료센터 — 4단계 공식 문서 PDF 렌더러
// 문서 모델(document-builder) → A4 공식 양식 PDF. 제공된 writable 스트림으로 출력(HTTP 다운로드).
// 기존 report pdfGenerator의 한글 폰트/레이아웃 패턴을 재사용한다.

import PDFDocument from 'pdfkit';
import fs from 'node:fs';
import type { Writable } from 'node:stream';
import type { VetDocModel, DocSection } from './document-builder.service.js';

const MARGIN = 50;
const PAGE_WIDTH = 595.28;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;
const KEY_COL = 120;

const COLORS = {
  PRIMARY: '#1B5E20',
  ACCENT: '#0277BD',
  TEXT: '#212121',
  LIGHT: '#757575',
  LINE: '#BDBDBD',
  BOX_BG: '#F1F8E9',
} as const;

function registerKoreanFont(doc: PDFKit.PDFDocument): string {
  const fontPath = '/usr/share/fonts/truetype/nanum/NanumGothic.ttf';
  try {
    if (fs.existsSync(fontPath)) {
      doc.registerFont('Korean', fontPath);
      return 'Korean';
    }
  } catch {
    // fall through
  }
  return 'Helvetica';
}

function ensureSpace(doc: PDFKit.PDFDocument, needed: number): void {
  if (doc.y + needed > doc.page.height - 70) {
    doc.addPage();
  }
}

// 키-값 행 (좌측 키 컬럼 + 우측 값, 자동 줄바꿈)
function renderPair(doc: PDFKit.PDFDocument, font: string, key: string, value: string): void {
  const valWidth = CONTENT_WIDTH - KEY_COL;
  const valHeight = doc.heightOfString(value || '—', { width: valWidth });
  const rowHeight = Math.max(18, valHeight + 6);
  ensureSpace(doc, rowHeight);
  const y = doc.y;
  doc.fontSize(10).font(font).fillColor(COLORS.ACCENT);
  doc.text(key, MARGIN, y + 2, { width: KEY_COL - 6 });
  doc.fillColor(COLORS.TEXT);
  doc.text(value || '—', MARGIN + KEY_COL, y + 2, { width: valWidth });
  doc.y = y + rowHeight;
}

function renderSection(doc: PDFKit.PDFDocument, font: string, section: DocSection): void {
  ensureSpace(doc, 40);
  doc.moveDown(0.6);
  doc.fontSize(12).font(font).fillColor(COLORS.PRIMARY);
  doc.text(section.heading, MARGIN, doc.y, { width: CONTENT_WIDTH });
  // 밑줄
  const lineY = doc.y + 2;
  doc.moveTo(MARGIN, lineY).lineTo(MARGIN + CONTENT_WIDTH, lineY).strokeColor(COLORS.LINE).lineWidth(0.5).stroke();
  doc.moveDown(0.5);

  for (const p of section.pairs ?? []) {
    renderPair(doc, font, p.key, p.value);
  }
  for (const para of section.paragraphs ?? []) {
    ensureSpace(doc, 24);
    doc.fontSize(10).font(font).fillColor(COLORS.TEXT);
    doc.text(para || '—', MARGIN, doc.y, { width: CONTENT_WIDTH });
    doc.moveDown(0.3);
  }
}

// 개체·농장 식별 박스 (상단)
function renderHeaderBox(doc: PDFKit.PDFDocument, font: string, model: VetDocModel): void {
  const pairs = model.header_pairs;
  const rowH = 18;
  const rows = Math.ceil(pairs.length / 2);
  const boxH = rows * rowH + 10;
  ensureSpace(doc, boxH + 10);
  const top = doc.y;
  doc.rect(MARGIN, top, CONTENT_WIDTH, boxH).fillAndStroke(COLORS.BOX_BG, COLORS.LINE);

  const colW = CONTENT_WIDTH / 2;
  pairs.forEach((p, i) => {
    const col = i % 2;
    const row = Math.floor(i / 2);
    const x = MARGIN + col * colW + 6;
    const y = top + 6 + row * rowH;
    doc.fontSize(9).font(font).fillColor(COLORS.ACCENT);
    doc.text(`${p.key}: `, x, y, { width: colW - 12, continued: true });
    doc.fillColor(COLORS.TEXT).text(p.value, { width: colW - 12 });
  });
  doc.y = top + boxH;
  doc.moveDown(0.5);
}

// 발행자/서명 블록 (하단)
function renderSignatureBlock(doc: PDFKit.PDFDocument, font: string, model: VetDocModel): void {
  ensureSpace(doc, 110);
  doc.moveDown(1.2);
  const y = doc.y;
  doc.moveTo(MARGIN, y).lineTo(MARGIN + CONTENT_WIDTH, y).strokeColor(COLORS.LINE).lineWidth(0.5).stroke();
  doc.moveDown(0.6);

  doc.fontSize(10).font(font).fillColor(COLORS.TEXT);
  doc.text(`발행일: ${model.issue_date}`, MARGIN, doc.y, { width: CONTENT_WIDTH });
  doc.moveDown(0.6);

  const license = model.issuer.licenseNumber && model.issuer.licenseNumber.trim().length > 0
    ? model.issuer.licenseNumber
    : '(            )';
  const clinic = model.issuer.clinicName && model.issuer.clinicName.trim().length > 0
    ? model.issuer.clinicName
    : '(            )';

  doc.text(`동물병원/소속: ${clinic}`, MARGIN, doc.y, { width: CONTENT_WIDTH });
  doc.moveDown(0.4);
  doc.text(`수의사 면허번호: ${license}`, MARGIN, doc.y, { width: CONTENT_WIDTH });
  doc.moveDown(0.4);
  doc.text(`수의사 성명: ${model.issuer.name}          (서명 또는 인)`, MARGIN, doc.y, { width: CONTENT_WIDTH });
}

function renderFooter(doc: PDFKit.PDFDocument, font: string, model: VetDocModel): void {
  doc.moveDown(1);
  doc.fontSize(7.5).font(font).fillColor(COLORS.LIGHT);
  for (const note of model.footer_notes) {
    doc.text(note, MARGIN, doc.y, { width: CONTENT_WIDTH });
  }
}

// 문서 모델을 PDF로 렌더 → 제공된 writable 스트림으로 출력. 완료 시 resolve.
export function renderVetDocumentPdf(model: VetDocModel, out: Writable): Promise<void> {
  const doc = new PDFDocument({
    size: 'A4',
    margins: { top: MARGIN, bottom: MARGIN, left: MARGIN, right: MARGIN },
    bufferPages: true,
    info: { Title: model.doc_title, Author: 'CowTalk' },
  });
  const font = registerKoreanFont(doc);
  doc.pipe(out);

  // 제목
  doc.moveDown(0.5);
  doc.fontSize(22).font(font).fillColor(COLORS.PRIMARY);
  doc.text(model.doc_title, MARGIN, doc.y, { align: 'center', width: CONTENT_WIDTH });
  doc.moveDown(0.2);
  doc.fontSize(9).fillColor(COLORS.LIGHT);
  doc.text('CowTalk 진료센터', MARGIN, doc.y, { align: 'center', width: CONTENT_WIDTH });
  doc.moveDown(0.8);

  renderHeaderBox(doc, font, model);
  for (const section of model.sections) {
    renderSection(doc, font, section);
  }
  renderSignatureBlock(doc, font, model);
  renderFooter(doc, font, model);

  doc.end();

  return new Promise((resolve, reject) => {
    out.on('finish', () => resolve());
    out.on('error', reject);
    doc.on('error', reject);
  });
}
