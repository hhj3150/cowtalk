const d = require('docx');
const {
  Paragraph, TextRun, Table, TableRow, TableCell, WidthType, ShadingType, BorderStyle,
  AlignmentType, TabStopType, LeaderType, HeadingLevel, LevelFormat, PageBreak, Footer, PageNumber,
} = d;

const FONT = '맑은 고딕';
const CONTENT_W = 9026; // A4 - 1" margins
const border = { style: BorderStyle.SINGLE, size: 4, color: '999999' };
const cellBorders = { top: border, bottom: border, left: border, right: border };

const run = (text, o = {}) => new TextRun({ text, font: FONT, size: o.size ?? 20, bold: o.bold, color: o.color, italics: o.italics });

// "**굵게**" 마크업을 TextRun 배열로
function rich(text, o = {}) {
  return String(text).split(/(\*\*[^*]+\*\*|【[^】]+】)/).filter(Boolean).map((seg) => {
    if (seg.startsWith('**')) return run(seg.slice(2, -2), { ...o, bold: true });
    if (seg.startsWith('【')) return run(seg, { ...o, bold: true, color: 'C00000' });
    return run(seg, o);
  });
}

const p = (text, o = {}) => new Paragraph({
  children: rich(text, o), spacing: { after: o.after ?? 120, line: 300 }, alignment: o.align, indent: o.indent,
});
const h1 = (text) => new Paragraph({ heading: HeadingLevel.HEADING_1, children: [run(text, { size: 28, bold: true, color: '1F3864' })], spacing: { before: 360, after: 160 }, border: { bottom: { style: BorderStyle.SINGLE, size: 8, color: '1F3864', space: 4 } } });
const h2 = (text) => new Paragraph({ heading: HeadingLevel.HEADING_2, children: [run(text, { size: 23, bold: true, color: '2E5597' })], spacing: { before: 240, after: 100 } });
const bullet = (text, level = 0) => new Paragraph({ numbering: { reference: 'bul', level }, children: rich(text), spacing: { after: 60, line: 290 } });
const num = (text, ref = 'num') => new Paragraph({ numbering: { reference: ref, level: 0 }, children: rich(text), spacing: { after: 60, line: 290 } });
const pageBreak = () => new Paragraph({ children: [new PageBreak()] });

function note(text, color = 'FFF4E5', edge = 'E69138') {
  return new Paragraph({
    children: rich(text, { size: 19 }),
    shading: { type: ShadingType.CLEAR, color: 'auto', fill: color },
    border: { left: { style: BorderStyle.SINGLE, size: 24, color: edge, space: 6 } },
    spacing: { before: 80, after: 160, line: 290 }, indent: { left: 120, right: 120 },
  });
}

function table(rows, widths, o = {}) {
  const total = widths.reduce((a, b) => a + b, 0);
  return new Table({
    width: { size: total, type: WidthType.DXA },
    columnWidths: widths,
    rows: rows.map((r, ri) => new TableRow({
      tableHeader: ri === 0 && o.header !== false,
      children: r.map((c, ci) => {
        const isHead = (ri === 0 && o.header !== false) || (o.firstColHead && ci === 0);
        const lines = String(c).split('\n');
        return new TableCell({
          width: { size: widths[ci], type: WidthType.DXA },
          borders: cellBorders,
          shading: isHead ? { type: ShadingType.CLEAR, color: 'auto', fill: ri === 0 && o.header !== false ? 'D9E2F3' : 'F2F2F2' } : undefined,
          margins: { top: 60, bottom: 60, left: 100, right: 100 },
          children: lines.map((l) => new Paragraph({ children: rich(l, { size: 18, bold: isHead || undefined }), spacing: { after: 20, line: 270 } })),
        });
      }),
    })),
  });
}

// 수동 목차: Paragraph + 오른쪽 Tab Stop(점선 리더)
function tocLine(title, page, level = 0) {
  return new Paragraph({
    tabStops: [{ type: TabStopType.RIGHT, position: CONTENT_W, leader: LeaderType.DOT }],
    indent: { left: level * 360 },
    spacing: { after: 80 },
    children: [run(title, { size: 20, bold: level === 0 }), run(`\t${page ?? ''}`, { size: 20 })],
  });
}

const numbering = {
  config: [
    { reference: 'bul', levels: [
      { level: 0, format: LevelFormat.BULLET, text: '•', alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 440, hanging: 260 } } } },
      { level: 1, format: LevelFormat.BULLET, text: '–', alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 880, hanging: 260 } } } },
    ] },
    ...['num', 'num2', 'num3', 'num4', 'num5', 'num6', 'num7', 'num8', 'num9', 'num10', 'num11', 'num12', 'num13', 'num14', 'num15', 'num16', 'num17', 'num18'].map((reference) => ({
      reference, levels: [{ level: 0, format: LevelFormat.DECIMAL, text: '%1.', alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 440, hanging: 300 } } } }],
    })),
  ],
};

function footer(label) {
  return { default: new Footer({ children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [
    run(`${label}  |  `, { size: 16, color: '808080' }),
    new TextRun({ children: [PageNumber.CURRENT], font: FONT, size: 16, color: '808080' }),
  ] })] }) };
}

function doc(children, label) {
  return new d.Document({
    styles: { default: { document: { run: { font: FONT, size: 20 } } } },
    numbering,
    sections: [{ properties: { page: { size: { width: 11906, height: 16838 }, margin: { top: 1300, bottom: 1300, left: 1440, right: 1440 } } }, footers: footer(label), children }],
  });
}

module.exports = { d, run, rich, p, h1, h2, bullet, num, note, table, tocLine, pageBreak, doc, CONTENT_W };
