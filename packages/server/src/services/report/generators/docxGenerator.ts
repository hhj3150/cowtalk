// CowTalk 보고서 — Word(docx) 문서 생성기
import {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  HeadingLevel, AlignmentType, WidthType, BorderStyle, ShadingType,
  LevelFormat, convertInchesToTwip,
} from 'docx';
import fs from 'fs';
import { REPORT_CONFIG } from '../config.js';

// ── Constants ──────────────────────────────────────────────────────
const FONT = REPORT_CONFIG.DOCUMENT.FONT;
const C = REPORT_CONFIG.DOCUMENT.COLORS;
const PAGE_WIDTH_DXA = 9638; // ~6.69 in

const BULLET_REF = 'cowtalk-bullets';
const NUMBERED_REF = 'cowtalk-numbered';

// ── Types ──────────────────────────────────────────────────────────
interface ContentBlock {
  readonly type: string;
  readonly text?: string;
  readonly items?: readonly string[];
  readonly headers?: readonly string[];
  readonly rows?: readonly (readonly string[])[];
  readonly pairs?: readonly { readonly key: string; readonly value: string }[];
}

interface Section {
  readonly heading: string;
  readonly level?: number;
  readonly content: readonly ContentBlock[];
}

interface ReportContent {
  readonly title?: string;
  readonly subtitle?: string;
  readonly date?: string;
  readonly author?: string;
  readonly sections?: readonly Section[];
  readonly summary?: string;
}

// ── Numbering config (bullets + ordered) ───────────────────────────
function createNumberingConfig() {
  return {
    config: [
      {
        reference: BULLET_REF,
        levels: [
          {
            level: 0,
            format: LevelFormat.BULLET,
            text: '\u2022',
            alignment: AlignmentType.LEFT,
            style: { paragraph: { indent: { left: convertInchesToTwip(0.5), hanging: convertInchesToTwip(0.25) } } },
          },
        ],
      },
      {
        reference: NUMBERED_REF,
        levels: [
          {
            level: 0,
            format: LevelFormat.DECIMAL,
            text: '%1.',
            alignment: AlignmentType.LEFT,
            style: { paragraph: { indent: { left: convertInchesToTwip(0.5), hanging: convertInchesToTwip(0.25) } } },
          },
        ],
      },
    ],
  };
}

// ── Helper: thin border style ──────────────────────────────────────
const THIN_BORDER = { style: BorderStyle.SINGLE, size: 1, color: 'BDBDBD' } as const;
const TABLE_BORDERS = {
  top: THIN_BORDER, bottom: THIN_BORDER,
  left: THIN_BORDER, right: THIN_BORDER,
  insideHorizontal: THIN_BORDER, insideVertical: THIN_BORDER,
};

// ── Helper: text run ───────────────────────────────────────────────
function txt(text: string, opts: { bold?: boolean; color?: string; size?: number; font?: string } = {}): TextRun {
  return new TextRun({
    text,
    font: opts.font ?? FONT,
    bold: opts.bold,
    color: opts.color ?? C.TEXT,
    size: opts.size ?? 22, // 11pt
  });
}

// ── Title page paragraphs ──────────────────────────────────────────
function buildTitleBlock(content: ReportContent): Paragraph[] {
  const parts: Paragraph[] = [];

  parts.push(new Paragraph({ spacing: { before: 2400 } }));

  if (content.title) {
    parts.push(new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 200 },
      children: [txt(content.title, { bold: true, color: C.PRIMARY, size: 48 })],
    }));
  }
  if (content.subtitle) {
    parts.push(new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 400 },
      children: [txt(content.subtitle, { color: C.LIGHT_TEXT, size: 28 })],
    }));
  }

  const meta = [content.date, content.author].filter(Boolean).join('  |  ');
  if (meta) {
    parts.push(new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 200 },
      children: [txt(meta, { color: C.LIGHT_TEXT, size: 22 })],
    }));
  }

  // Divider line
  parts.push(new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: 400, after: 600 },
    border: { bottom: { style: BorderStyle.SINGLE, size: 2, color: C.PRIMARY } },
    children: [],
  }));

  return parts;
}

// ── Content block renderers ────────────────────────────────────────
function renderParagraph(block: ContentBlock): Paragraph[] {
  return [new Paragraph({
    spacing: { after: 160 },
    children: [txt(block.text ?? '')],
  })];
}

function renderBulletList(block: ContentBlock): Paragraph[] {
  return (block.items ?? []).map((item) => new Paragraph({
    numbering: { reference: BULLET_REF, level: 0 },
    spacing: { after: 80 },
    children: [txt(item)],
  }));
}

function renderNumberedList(block: ContentBlock): Paragraph[] {
  return (block.items ?? []).map((item) => new Paragraph({
    numbering: { reference: NUMBERED_REF, level: 0 },
    spacing: { after: 80 },
    children: [txt(item)],
  }));
}

function renderTable(block: ContentBlock): Paragraph[] {
  const headers = block.headers ?? [];
  const rows = block.rows ?? [];
  const colCount = headers.length || (rows[0]?.length ?? 1);
  const colWidth = Math.floor(PAGE_WIDTH_DXA / colCount);
  const columnWidths = Array.from({ length: colCount }, () => colWidth);

  const headerRow = new TableRow({
    tableHeader: true,
    children: headers.map((h) => new TableCell({
      width: { size: colWidth, type: WidthType.DXA },
      shading: { type: ShadingType.CLEAR, fill: C.TABLE_HEADER },
      children: [new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [txt(h, { bold: true, color: 'FFFFFF', size: 20 })],
      })],
    })),
  });

  const dataRows = rows.map((row, idx) => new TableRow({
    children: Array.from({ length: colCount }, (_, ci) => new TableCell({
      width: { size: colWidth, type: WidthType.DXA },
      shading: idx % 2 === 1 ? { type: ShadingType.CLEAR, fill: C.TABLE_ALT } : undefined,
      children: [new Paragraph({
        spacing: { before: 40, after: 40 },
        children: [txt(row[ci] ?? '', { size: 20 })],
      })],
    })),
  }));

  const table = new Table({
    width: { size: PAGE_WIDTH_DXA, type: WidthType.DXA },
    columnWidths,
    borders: TABLE_BORDERS,
    rows: [headerRow, ...dataRows],
  });

  return [new Paragraph({ spacing: { before: 120 } }), table as unknown as Paragraph, new Paragraph({ spacing: { after: 200 } })];
}

function renderKeyValue(block: ContentBlock): Paragraph[] {
  const pairs = block.pairs ?? [];
  const keyColWidth = Math.floor(PAGE_WIDTH_DXA * 0.35);
  const valColWidth = PAGE_WIDTH_DXA - keyColWidth;
  const colWidths = [keyColWidth, valColWidth];

  const rows = pairs.map((p, idx) => new TableRow({
    children: [
      new TableCell({
        width: { size: keyColWidth, type: WidthType.DXA },
        shading: { type: ShadingType.CLEAR, fill: C.HEADER_BG },
        children: [new Paragraph({
          spacing: { before: 40, after: 40 },
          children: [txt(p.key, { bold: true, size: 20 })],
        })],
      }),
      new TableCell({
        width: { size: valColWidth, type: WidthType.DXA },
        shading: idx % 2 === 1 ? { type: ShadingType.CLEAR, fill: C.TABLE_ALT } : undefined,
        children: [new Paragraph({
          spacing: { before: 40, after: 40 },
          children: [txt(p.value, { size: 20 })],
        })],
      }),
    ],
  }));

  const table = new Table({
    width: { size: PAGE_WIDTH_DXA, type: WidthType.DXA },
    columnWidths: colWidths,
    borders: TABLE_BORDERS,
    rows,
  });

  return [new Paragraph({ spacing: { before: 120 } }), table as unknown as Paragraph, new Paragraph({ spacing: { after: 200 } })];
}

function renderBlock(block: ContentBlock): Paragraph[] {
  switch (block.type) {
    case 'paragraph': return renderParagraph(block);
    case 'bullet_list': return renderBulletList(block);
    case 'numbered_list': return renderNumberedList(block);
    case 'table': return renderTable(block);
    case 'key_value': return renderKeyValue(block);
    default: return block.text ? renderParagraph(block) : [];
  }
}

// ── Section renderer ───────────────────────────────────────────────
function renderSection(section: Section): Paragraph[] {
  const level = section.level === 2 ? HeadingLevel.HEADING_2 : HeadingLevel.HEADING_1;
  const heading = new Paragraph({
    heading: level,
    spacing: { before: 360, after: 160 },
    children: [txt(section.heading, { bold: true, color: C.PRIMARY, size: level === HeadingLevel.HEADING_1 ? 32 : 26 })],
  });
  const blocks = section.content.flatMap(renderBlock);
  return [heading, ...blocks];
}

// ── Summary block ──────────────────────────────────────────────────
function buildSummary(summary: string): Paragraph[] {
  return [
    new Paragraph({
      spacing: { before: 400 },
      border: { top: { style: BorderStyle.SINGLE, size: 2, color: C.PRIMARY } },
      children: [],
    }),
    new Paragraph({
      spacing: { before: 200, after: 100 },
      children: [txt('총평', { bold: true, color: C.PRIMARY, size: 28 })],
    }),
    new Paragraph({
      spacing: { after: 200 },
      shading: { type: ShadingType.CLEAR, fill: C.HEADER_BG },
      children: [txt(summary)],
    }),
  ];
}

// ── Main generator ─────────────────────────────────────────────────
export async function generateDocx(
  content: Record<string, unknown>,
  outputPath: string,
): Promise<void> {
  const report = content as unknown as ReportContent;

  const children: Paragraph[] = [
    ...buildTitleBlock(report),
    ...(report.sections ?? []).flatMap(renderSection),
    ...(report.summary ? buildSummary(report.summary) : []),
  ];

  const doc = new Document({
    numbering: createNumberingConfig(),
    styles: {
      default: {
        document: {
          run: { font: FONT, size: 22, color: C.TEXT },
        },
      },
    },
    sections: [{ properties: {}, children }],
  });

  const buffer = await Packer.toBuffer(doc);
  const dir = outputPath.substring(0, outputPath.lastIndexOf('/'));
  if (dir) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(outputPath, buffer);
}
