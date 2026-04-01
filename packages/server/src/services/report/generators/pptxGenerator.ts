import PptxGenJS from 'pptxgenjs';
import { REPORT_CONFIG } from '../config.js';

const { FONT } = REPORT_CONFIG.DOCUMENT;
const { PRIMARY, ACCENT, TEXT } = REPORT_CONFIG.DOCUMENT.COLORS;
const WHITE = 'FFFFFF';
const FOOTER_TEXT = 'CowTalk AI Report';

interface SlideBase {
  readonly layout: string;
  readonly title?: string;
  readonly notes?: string;
}

interface TitleSlide extends SlideBase {
  readonly layout: 'title';
  readonly subtitle?: string;
}

interface ContentSlide extends SlideBase {
  readonly layout: 'content';
  readonly bullets?: readonly string[];
}

interface TableSlide extends SlideBase {
  readonly layout: 'table';
  readonly table?: { readonly headers?: readonly string[]; readonly rows?: readonly (readonly string[])[] };
}

interface TwoColumnSlide extends SlideBase {
  readonly layout: 'two_column';
  readonly left?: { readonly heading?: string; readonly bullets?: readonly string[] };
  readonly right?: { readonly heading?: string; readonly bullets?: readonly string[] };
}

type SlideContent = TitleSlide | ContentSlide | TableSlide | TwoColumnSlide;

interface PptxContent {
  readonly title?: string;
  readonly subtitle?: string;
  readonly slides?: readonly SlideContent[];
}

function addFooter(slide: PptxGenJS.Slide): void {
  slide.addText(FOOTER_TEXT, {
    x: 0.5, y: '92%', w: '80%', h: 0.3,
    fontSize: 8, color: TEXT, fontFace: FONT, align: 'left',
  });
}

function addTitleSlide(pptx: PptxGenJS, slide: TitleSlide, fallbackTitle?: string): void {
  const s = pptx.addSlide();
  s.background = { color: PRIMARY };
  s.addText(slide.title ?? fallbackTitle ?? '', {
    x: 0.8, y: '30%', w: '85%', h: 1.2,
    fontSize: 36, bold: true, color: WHITE, fontFace: FONT, align: 'center',
  });
  if (slide.subtitle) {
    s.addText(slide.subtitle, {
      x: 0.8, y: '55%', w: '85%', h: 0.6,
      fontSize: 18, color: WHITE, fontFace: FONT, align: 'center',
    });
  }
  if (slide.notes) s.addNotes(slide.notes);
}

function addContentSlide(pptx: PptxGenJS, slide: ContentSlide): void {
  const s = pptx.addSlide();
  s.addText(slide.title ?? '', {
    x: 0.5, y: 0.3, w: '90%', h: 0.6,
    fontSize: 24, bold: true, color: PRIMARY, fontFace: FONT,
  });
  const bullets = (slide.bullets ?? []).map((text) => ({
    text,
    options: { fontSize: 14, color: TEXT, fontFace: FONT, bullet: { code: '2022' } },
  }));
  if (bullets.length > 0) {
    s.addText(bullets, { x: 0.8, y: 1.2, w: '82%', h: 3.5, valign: 'top', lineSpacingMultiple: 1.4 });
  }
  if (slide.notes) s.addNotes(slide.notes);
  addFooter(s);
}

function addTableSlide(pptx: PptxGenJS, slide: TableSlide): void {
  const s = pptx.addSlide();
  s.addText(slide.title ?? '', {
    x: 0.5, y: 0.3, w: '90%', h: 0.6,
    fontSize: 24, bold: true, color: PRIMARY, fontFace: FONT,
  });
  const headers = slide.table?.headers ?? [];
  const rows = slide.table?.rows ?? [];
  if (headers.length > 0) {
    const headerRow = headers.map((h) => ({
      text: h, options: { bold: true, color: WHITE, fill: { color: PRIMARY }, fontSize: 11, fontFace: FONT },
    }));
    const dataRows = rows.map((row) =>
      row.map((cell) => ({ text: String(cell), options: { fontSize: 10, color: TEXT, fontFace: FONT } })),
    );
    s.addTable([headerRow, ...dataRows], {
      x: 0.5, y: 1.2, w: 9.0,
      border: { type: 'solid', pt: 0.5, color: 'CCCCCC' },
      colW: Array(headers.length).fill(9.0 / headers.length),
      autoPage: true,
    });
  }
  if (slide.notes) s.addNotes(slide.notes);
  addFooter(s);
}

function addTwoColumnSlide(pptx: PptxGenJS, slide: TwoColumnSlide): void {
  const s = pptx.addSlide();
  s.addText(slide.title ?? '', {
    x: 0.5, y: 0.3, w: '90%', h: 0.6,
    fontSize: 24, bold: true, color: PRIMARY, fontFace: FONT,
  });
  const buildColumn = (col?: { readonly heading?: string; readonly bullets?: readonly string[] }) => {
    const parts: PptxGenJS.TextProps[] = [];
    if (col?.heading) {
      parts.push({ text: col.heading, options: { fontSize: 16, bold: true, color: ACCENT, fontFace: FONT, breakLine: true } });
    }
    for (const item of col?.bullets ?? []) {
      parts.push({ text: item, options: { fontSize: 12, color: TEXT, fontFace: FONT, bullet: { code: '2022' }, breakLine: true } });
    }
    return parts;
  };
  s.addText(buildColumn(slide.left), { x: 0.5, y: 1.2, w: 4.2, h: 3.5, valign: 'top', lineSpacingMultiple: 1.3 });
  s.addText(buildColumn(slide.right), { x: 5.0, y: 1.2, w: 4.2, h: 3.5, valign: 'top', lineSpacingMultiple: 1.3 });
  if (slide.notes) s.addNotes(slide.notes);
  addFooter(s);
}

type SlideBuilder = (pptx: PptxGenJS, slide: SlideContent, fallbackTitle?: string) => void;

const SLIDE_BUILDERS: Record<string, SlideBuilder> = {
  title: (pptx, slide, ft) => addTitleSlide(pptx, slide as TitleSlide, ft),
  content: (pptx, slide) => addContentSlide(pptx, slide as ContentSlide),
  table: (pptx, slide) => addTableSlide(pptx, slide as TableSlide),
  two_column: (pptx, slide) => addTwoColumnSlide(pptx, slide as TwoColumnSlide),
};

export async function generatePptx(
  content: Record<string, unknown>,
  outputPath: string,
): Promise<void> {
  const data = content as unknown as PptxContent;
  const pptx = new PptxGenJS();
  pptx.layout = 'LAYOUT_WIDE';
  pptx.author = 'CowTalk';
  pptx.title = data.title ?? '보고서';

  const slides = data.slides ?? [];

  if (slides.length === 0) {
    addTitleSlide(pptx, { layout: 'title', title: data.title, subtitle: data.subtitle });
  }

  for (const slide of slides) {
    const defaultBuilder: SlideBuilder = (p, s) => addContentSlide(p, s as ContentSlide);
    const build = SLIDE_BUILDERS[slide.layout] ?? defaultBuilder;
    build(pptx, slide, data.title);
  }

  await pptx.writeFile({ fileName: outputPath });
}
