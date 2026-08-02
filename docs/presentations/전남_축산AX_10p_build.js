const pptxgen = require("pptxgenjs");

const pres = new pptxgen();
pres.layout = "LAYOUT_WIDE"; // 13.333 x 7.5
pres.author = "하현제";
pres.title = "전남 축산 AX 플랫폼 구축 제안";

const W = 13.333, H = 7.5, M = 0.62;

// ── palette ────────────────────────────────────────────────
const INK   = "12261F"; // deep forest-black
const GREEN = "1B4332";
const GOLD  = "C9A227";
const RED   = "B3261E";
const BODY  = "23302B";
const MUTE  = "5F6D66";
const TINT  = "F0F3F0";
const LINE  = "D8DFDA";
const WHITE = "FFFFFF";

const KR = "Malgun Gothic";

const sh = () => ({ type: "outer", color: "12261F", blur: 8, offset: 1, angle: 90, opacity: 0.10 });

// ── shared chrome ──────────────────────────────────────────
function head(s, chip, title) {
  s.addText(chip, {
    x: M, y: 0.40, w: 3.6, h: 0.30, margin: 0,
    fontFace: KR, fontSize: 11, bold: true, color: GOLD, charSpacing: 1.2,
  });
  s.addText(title, {
    x: M, y: 0.74, w: W - M * 2, h: 0.66, margin: 0, valign: "top",
    fontFace: KR, fontSize: 27, bold: true, color: INK,
  });
}

function foot(s, text, color) {
  s.addText(text, {
    x: M, y: 6.78, w: W - M * 2, h: 0.42, margin: 0, valign: "middle", align: "center",
    fontFace: KR, fontSize: 12.5, bold: true, color: color || GREEN,
  });
}

function card(s, o) {
  s.addShape(pres.ShapeType.roundRect, {
    x: o.x, y: o.y, w: o.w, h: o.h, rectRadius: 0.06,
    fill: { color: o.fill || TINT }, line: { color: o.line || LINE, width: 0.75 },
    shadow: o.flat ? undefined : sh(),
  });
}

// big number + label block
function stat(s, o) {
  card(s, { x: o.x, y: o.y, w: o.w, h: o.h, fill: o.fill || WHITE });
  s.addText(o.num, {
    x: o.x, y: o.y + 0.16, w: o.w, h: 0.72, margin: 0, align: "center", valign: "middle",
    fontFace: KR, fontSize: o.numSize || 30, bold: true, color: o.color || INK,
  });
  s.addText(o.label, {
    x: o.x + 0.1, y: o.y + 0.88, w: o.w - 0.2, h: o.h - 0.98, margin: 0, align: "center", valign: "top",
    fontFace: KR, fontSize: 10.5, color: MUTE, lineSpacing: 15,
  });
}

// ═══════════════════════════════════════════════════════════
// 1. 표지
// ═══════════════════════════════════════════════════════════
{
  const s = pres.addSlide();
  s.background = { color: INK };

  s.addText("전라남도 축산업 인공지능 대전환 (AX) 정책 제안", {
    x: 1.05, y: 1.72, w: 11, h: 0.34, margin: 0,
    fontFace: KR, fontSize: 13, bold: true, color: GOLD, charSpacing: 1.5,
  });

  s.addText("전남 축산 AX 플랫폼", {
    x: 1.05, y: 2.26, w: 11.2, h: 0.92, margin: 0, valign: "middle",
    fontFace: KR, fontSize: 50, bold: true, color: WHITE,
  });
  s.addText("CowTalk Jeonnam", {
    x: 1.05, y: 3.16, w: 11.2, h: 0.62, margin: 0, valign: "middle",
    fontFace: "Cambria", fontSize: 34, bold: true, color: GOLD, italic: true,
  });

  s.addText(
    "국가 농업 AX 플랫폼(2,546억원) 위에 축산 전문영역을 탑재하는 방안",
    { x: 1.05, y: 4.02, w: 11.2, h: 0.36, margin: 0,
      fontFace: KR, fontSize: 15.5, color: "C3D2CA" }
  );

  s.addShape(pres.ShapeType.roundRect, {
    x: 1.05, y: 5.06, w: 5.1, h: 1.06, rectRadius: 0.06,
    fill: { color: "1E3A2E" }, line: { color: "2E5344", width: 1 },
  });
  s.addText(
    [
      { text: "고려동물병원 대표 · 수의사  하현제", options: { fontSize: 14.5, bold: true, color: WHITE, breakLine: true } },
      { text: "hhj3150@hanmail.net", options: { fontSize: 11, color: "9CB3A6" } },
    ],
    { x: 1.32, y: 5.16, w: 4.6, h: 0.86, margin: 0, valign: "middle", fontFace: KR }
  );

  s.addText("2026. 8. 3. (월)   ·   전라남도", {
    x: 6.6, y: 5.06, w: 5.7, h: 1.06, margin: 0, valign: "middle", align: "right",
    fontFace: KR, fontSize: 13, color: "9CB3A6",
  });

  s.addNotes(
    "인사. 오늘 25분 안에 세 가지만 말씀드리겠습니다. " +
    "왜 지금이어야 하는가, 무엇을 만들 것인가, 전남이 무엇을 얻는가. " +
    "요청드리는 것은 사업 착수가 아니라 검토 착수입니다."
  );
}

// ═══════════════════════════════════════════════════════════
// 2. 한 장 요약
// ═══════════════════════════════════════════════════════════
{
  const s = pres.addSlide();
  head(s, "제안 요약", "이 제안을 한 장으로 말씀드리면");

  const rows = [
    { k: "기회", c: GREEN,
      t: "전남이 국가 농업 AX 플랫폼 사업지역으로 최종 선정됐습니다",
      d: "2026~2030년 총사업비 2,546억원 · 무안군 해제면 · 연내 SPC 설립 예정" },
    { k: "공백", c: RED,
      t: "그런데 그 사업의 골자에 축산이 명시되어 있지 않습니다",
      d: "기상·토양·생육 데이터와 파종·방제·수확 — 재배업 기반으로 설계가 시작됐습니다" },
    { k: "제안", c: INK,
      t: "국가 플랫폼 위에 「전남 축산 AX 플랫폼」을 축산 전문영역으로 탑재",
      d: "중복 플랫폼이 아니라, 국가 플랫폼의 축산 기능을 완성하는 실행계층입니다" },
    { k: "요청", c: GOLD,
      t: "오늘 필요한 결정은 세 가지입니다",
      d: "① 축산 전문영역 공식 반영   ② 실무협의체 구성   ③ 타당성 조사 용역 추진(6개월·3~5억원 규모 안)" },
  ];

  let y = 1.72;
  rows.forEach((r) => {
    card(s, { x: M, y, w: W - M * 2, h: 1.16, fill: r.k === "요청" ? "FBF6E6" : WHITE });
    s.addShape(pres.ShapeType.roundRect, {
      x: M + 0.24, y: y + 0.34, w: 0.96, h: 0.48, rectRadius: 0.06,
      fill: { color: r.c }, line: { color: r.c, width: 1 },
    });
    s.addText(r.k, {
      x: M + 0.24, y: y + 0.34, w: 0.96, h: 0.48, margin: 0, align: "center", valign: "middle",
      fontFace: KR, fontSize: 13, bold: true, color: r.k === "요청" ? INK : WHITE,
    });
    s.addText(r.t, {
      x: M + 1.42, y: y + 0.19, w: W - M * 2 - 1.72, h: 0.42, margin: 0, valign: "middle",
      fontFace: KR, fontSize: 16, bold: true, color: INK,
    });
    s.addText(r.d, {
      x: M + 1.42, y: y + 0.62, w: W - M * 2 - 1.72, h: 0.38, margin: 0, valign: "top",
      fontFace: KR, fontSize: 12, color: MUTE,
    });
    y += 1.27;
  });

  foot(s, "오늘 결정하실 것은 사업 추진이 아니라, 검토를 시작해도 좋다는 판단입니다");

  s.addNotes(
    "이 한 장이 오늘 발표 전부입니다. 기회는 이미 전남에 왔고, 그 안에 축산이 빠져 있고, " +
    "지금이 넣을 수 있는 마지막 시점이며, 필요한 결정은 세 가지입니다."
  );
}

// ═══════════════════════════════════════════════════════════
// 3. WHY 1 — 골든타임
// ═══════════════════════════════════════════════════════════
{
  const s = pres.addSlide();
  head(s, "Ⅰ 왜 지금인가", "기회는 이미 왔습니다 — 다만 축산이 빠져 있습니다");

  const sw = (W - M * 2 - 0.36) / 3;
  stat(s, { x: M, y: 1.62, w: sw, h: 1.5, num: "2,546억원", numSize: 27, color: GREEN,
    label: "국가 농업 AX 플랫폼 총사업비\n2026 ~ 2030년 · 정부지원 최대 1,400억원" });
  stat(s, { x: M + sw + 0.18, y: 1.62, w: sw, h: 1.5, num: "2026. 7. 27", numSize: 26, color: GREEN,
    label: "민간참여자 최종 선정 · 실시협약 체결\n무안군 해제면 일원" });
  stat(s, { x: M + (sw + 0.18) * 2, y: 1.62, w: sw, h: 1.5, num: "연내", numSize: 30, color: RED,
    label: "특수목적법인(SPC) 설립 예정\n지금은 세부 사업계획을 조율하는 단계" });

  // 발표된 사업 골자
  card(s, { x: M, y: 3.36, w: W - M * 2, h: 1.06, fill: "F6F7F5" });
  s.addText(
    [
      { text: "발표된 사업 내용   ", options: { fontSize: 11, bold: true, color: GOLD } },
      { text: "“농업 현장에서 생산되는 기상·토양·생육 데이터를 AI가 분석해 최적의 재배 방법을 제시하고,", options: { fontSize: 13.5, color: BODY, breakLine: true } },
      { text: "농기계와 로봇으로 파종·방제·수확 등을 지원하는 플랫폼을 구축”", options: { fontSize: 13.5, color: BODY } },
    ],
    { x: M + 0.3, y: 3.46, w: W - M * 2 - 0.6, h: 0.88, margin: 0, valign: "middle", fontFace: KR, lineSpacing: 21 }
  );

  const bw = (W - M * 2 - 0.36) / 3;
  const boxes = [
    { t: "기상 · 토양 · 생육", d: "재배 환경 데이터", ok: true },
    { t: "파종 · 방제 · 수확", d: "농작업 자동화", ok: true },
    { t: "가축 생체 · 번식 · 방역", d: "명시되어 있지 않습니다", ok: false },
  ];
  boxes.forEach((b, i) => {
    const x = M + (bw + 0.18) * i;
    card(s, { x, y: 4.6, w: bw, h: 1.0, fill: b.ok ? WHITE : "FBEDEC", line: b.ok ? LINE : "E8B9B5" });
    s.addText((b.ok ? "포함  " : "제외  ") + b.t, {
      x: x + 0.14, y: 4.72, w: bw - 0.28, h: 0.36, margin: 0, align: "center", valign: "middle",
      fontFace: KR, fontSize: 14.5, bold: true, color: b.ok ? INK : RED,
    });
    s.addText(b.d, {
      x: x + 0.14, y: 5.08, w: bw - 0.28, h: 0.44, margin: 0, align: "center", valign: "top",
      fontFace: KR, fontSize: 11.5, color: MUTE,
    });
  });

  s.addText(
    "누구의 잘못도 아니라 순서의 문제입니다. 국가 플랫폼은 재배업 기반으로 설계가 시작됐고, 지금 SPC 사업계획을 조율하는 단계입니다.",
    { x: M, y: 5.78, w: W - M * 2, h: 0.34, margin: 0, align: "center",
      fontFace: KR, fontSize: 11.5, color: MUTE }
  );
  card(s, { x: M, y: 6.16, w: W - M * 2, h: 0.56, fill: INK, line: INK, flat: true });
  s.addText("SPC 사업계획이 확정되기 전이 축산을 넣을 수 있는 유일한 시점입니다", {
    x: M, y: 6.16, w: W - M * 2, h: 0.56, margin: 0, align: "center", valign: "middle",
    fontFace: KR, fontSize: 14, bold: true, color: WHITE,
  });

  s.addText("출처: 농림축산식품부 보도자료(2026. 7. 27) · 국가 농업AX플랫폼 SPC 설립 공모지침서(2026. 2)", {
    x: M, y: 6.86, w: W - M * 2, h: 0.26, margin: 0, align: "right",
    fontFace: KR, fontSize: 8.5, color: "97A29C",
  });

  s.addNotes(
    "이 장의 메시지는 하나입니다 — 시점. 지금 넣지 않으면 사업 구조가 굳은 뒤에는 바꾸기 어렵습니다. " +
    "축산은 전남 농업의 핵심인데, 우리가 유치한 플랫폼에서 빠지는 결과가 됩니다."
  );
}

// ═══════════════════════════════════════════════════════════
// 4. WHY 2 — 축산의 현실
// ═══════════════════════════════════════════════════════════
{
  const s = pres.addSlide();
  head(s, "Ⅱ 왜 해야 하는가", "지금 한우는 기를수록 손해이고, 무너지는 건 번식 기반입니다");

  const sw = (W - M * 2 - 0.54) / 4;
  const stats = [
    { num: "−86.1만원", label: "한우 번식우\n마리당 순손실", c: RED },
    { num: "−99.9만원", label: "한우 비육우\n마리당 순손실", c: RED },
    { num: "−10만두", label: "가임암소\n2년 새 감소", c: RED },
    { num: "−3,689", label: "한우 사육 농장\n1년 새 감소 (−4.8%)", c: RED },
  ];
  stats.forEach((st, i) => {
    stat(s, { x: M + (sw + 0.18) * i, y: 1.62, w: sw, h: 1.46, num: st.num, numSize: 26, color: st.c, label: st.label });
  });

  // 좌: 이 숫자가 뜻하는 것
  const cw = (W - M * 2 - 0.3) / 2;
  card(s, { x: M, y: 3.24, w: cw, h: 2.94, fill: WHITE });
  s.addText("이 숫자가 뜻하는 것", {
    x: M + 0.28, y: 3.4, w: cw - 0.56, h: 0.32, margin: 0,
    fontFace: KR, fontSize: 14.5, bold: true, color: INK,
  });
  s.addText(
    [
      { text: "생산액은 늘었지만(24.2조원, 농업의 40.9%) 농가에 남는 돈은 없습니다 — 사료비·인건비가 증가분을 흡수했습니다", options: { bullet: true, breakLine: true } },
      { text: "손실 구조에서는 재투자가 일어나지 않습니다. 시설도 후계도 멈춥니다", options: { bullet: true, breakLine: true } },
      { text: "사육두수 감소는 수급 조절로 회복되지만, 가임암소와 번식농가의 소멸은 회복되지 않습니다", options: { bullet: true, breakLine: true } },
      { text: "보조금으로 손실을 메우는 방식은 지속되지 않습니다", options: { bullet: true } },
    ],
    { x: M + 0.28, y: 3.8, w: cw - 0.56, h: 2.24, margin: 0, valign: "top",
      fontFace: KR, fontSize: 11.5, color: BODY, lineSpacing: 16, paraSpaceAfter: 7 }
  );

  // 우: 전남에 무슨 뜻인가
  card(s, { x: M + cw + 0.3, y: 3.24, w: cw, h: 2.94, fill: "F3F6F3" });
  s.addText("전남에게 이것은 무슨 뜻인가", {
    x: M + cw + 0.58, y: 3.4, w: cw - 0.56, h: 0.32, margin: 0,
    fontFace: KR, fontSize: 14.5, bold: true, color: GREEN,
  });
  s.addText("15.4%", {
    x: M + cw + 0.58, y: 3.78, w: cw - 0.56, h: 0.58, margin: 0, valign: "middle",
    fontFace: KR, fontSize: 34, bold: true, color: GREEN,
  });
  s.addText("전남은 전국 한우 출하의 15.4%를 담당하는 2위 산지입니다", {
    x: M + cw + 0.58, y: 4.36, w: cw - 0.56, h: 0.3, margin: 0,
    fontFace: KR, fontSize: 12, bold: true, color: BODY,
  });
  s.addText(
    [
      { text: "번식 기반이 무너지면 전남 비육농가가 먼저 타격을 받습니다 — 도내에서 입식할 송아지를 구하지 못합니다", options: { bullet: true, breakLine: true } },
      { text: "가임암소 감소는 3~4년 뒤 송아지 공급 부족으로 나타납니다. 지금 대응해야 그때가 달라집니다", options: { bullet: true } },
    ],
    { x: M + cw + 0.58, y: 4.74, w: cw - 0.56, h: 1.3, margin: 0, valign: "top",
      fontFace: KR, fontSize: 11.5, color: BODY, lineSpacing: 16, paraSpaceAfter: 7 }
  );

  s.addText("이것은 보조금으로 풀리는 문제가 아닙니다 — 두당 원가와 손실 요인을 데이터로 줄여야 풀립니다", {
    x: M, y: 6.42, w: W - M * 2, h: 0.42, margin: 0, valign: "middle", align: "center",
    fontFace: KR, fontSize: 12.5, bold: true, color: RED,
  });
  s.addText("출처: 통계청 2025년 축산물생산비조사 · 국가데이터처 가축동향(2026. 6. 1 기준)", {
    x: M, y: 6.94, w: W - M * 2, h: 0.24, margin: 0, align: "right",
    fontFace: KR, fontSize: 8.5, color: "97A29C",
  });

  s.addNotes(
    "번식우 86만원, 비육우 100만원 손실입니다. 이 구조에서는 아무도 재투자하지 않습니다. " +
    "그리고 전남은 출하 2위 산지라, 번식 기반 붕괴의 청구서를 가장 먼저 받는 지역입니다."
  );
}

// ═══════════════════════════════════════════════════════════
// 5. WHY 3 — 왜 AI인가
// ═══════════════════════════════════════════════════════════
{
  const s = pres.addSlide();
  head(s, "Ⅲ 왜 AI인가", "노력으로도, 장비 보급으로도 풀리지 않는 문제입니다");

  const cw = (W - M * 2 - 0.3) / 2;

  // 좌 — 한우는 계기판이 없다
  card(s, { x: M, y: 1.62, w: cw, h: 2.66, fill: WHITE });
  s.addText("① 한우는 30개월을 계기판 없이 운행합니다", {
    x: M + 0.28, y: 1.78, w: cw - 0.56, h: 0.32, margin: 0,
    fontFace: KR, fontSize: 14.5, bold: true, color: INK,
  });

  const trows = [
    ["구분", "낙농 (젖소)", "한우"],
    ["일일 접점", "착유 2회 — 유량 자동 기록", "없음 (급이 외 부재)"],
    ["이상 감지", "유량 저하로 즉시 포착", "증상 발현까지 미포착"],
    ["성과 확인", "매일", "도체성적 — 30개월 뒤 1회"],
  ];
  s.addTable(
    trows.map((r, i) =>
      r.map((c, j) => ({
        text: c,
        options: {
          fontFace: KR, fontSize: i === 0 ? 9.5 : 10,
          bold: i === 0 || j === 0,
          color: i === 0 ? WHITE : (j === 2 ? RED : BODY),
          fill: i === 0 ? { color: GREEN } : { color: i % 2 ? "FFFFFF" : "F5F7F5" },
          align: "left", valign: "middle", margin: [2, 5, 2, 5],
        },
      }))
    ),
    { x: M + 0.28, y: 2.18, w: cw - 0.56, colW: [0.95, 2.35, 2.14], rowH: [0.25, 0.32, 0.32, 0.32],
      border: { type: "solid", color: LINE, pt: 0.5 } }
  );
  s.addText("낙농에서 10을 얻는 기술이 한우에서는 30을 얻습니다 — 비교 대상이 ‘아무것도 없음’이기 때문입니다.", {
    x: M + 0.28, y: 3.62, w: cw - 0.56, h: 0.56, margin: 0, valign: "top",
    fontFace: KR, fontSize: 11, italic: true, color: GREEN, lineSpacing: 15,
  });

  // 우 — 장비의 섬
  card(s, { x: M + cw + 0.3, y: 1.62, w: cw, h: 2.66, fill: "F3F6F3" });
  s.addText("② 지금의 스마트축산은 ‘장비의 섬’입니다", {
    x: M + cw + 0.58, y: 1.78, w: cw - 0.56, h: 0.32, margin: 0,
    fontFace: KR, fontSize: 14.5, bold: true, color: INK,
  });
  s.addText(
    [
      { text: "장비마다 별도 프로그램 — 농가는 여러 앱을 따로 확인해야 합니다", options: { bullet: true, breakLine: true } },
      { text: "알람은 많은데 무엇을 먼저 해야 하는지 알려주지 않습니다", options: { bullet: true, breakLine: true } },
      { text: "수의사에게 데이터가 자동으로 전달되지 않습니다", options: { bullet: true, breakLine: true } },
      { text: "지자체는 농장별 위험을 실시간으로 파악할 수 없습니다", options: { bullet: true, breakLine: true } },
      { text: "정책사업의 실제 효과를 객관적으로 측정할 수 없습니다", options: { bullet: true } },
    ],
    { x: M + cw + 0.58, y: 2.2, w: cw - 0.56, h: 1.7, margin: 0, valign: "top",
      fontFace: KR, fontSize: 12, color: BODY, lineSpacing: 17, paraSpaceAfter: 6 }
  );

  // 하단 — 노동의 문제
  card(s, { x: M, y: 4.44, w: W - M * 2, h: 1.86, fill: WHITE });
  s.addText("③ 번식농가가 그만두는 이유는 돈이 아니라 ‘24시간 관찰’입니다", {
    x: M + 0.28, y: 4.58, w: W - M * 2 - 0.56, h: 0.32, margin: 0,
    fontFace: KR, fontSize: 14.5, bold: true, color: INK,
  });
  const losses = [
    { t: "발정 1회 미발견", d: "= 공태 21일 연장" },
    { t: "분만 감시 실패", d: "난산 대응 시점 놓침" },
    { t: "수정 횟수 증가", d: "정액·수정료 누적" },
    { t: "질병 조기발견 실패", d: "증상이 보이면 이미 늦습니다" },
  ];
  const lw = (W - M * 2 - 0.56 - 0.36) / 4;
  losses.forEach((l, i) => {
    const x = M + 0.28 + (lw + 0.12) * i;
    card(s, { x, y: 5.0, w: lw, h: 0.82, fill: "FBEDEC", line: "E8B9B5", flat: true });
    s.addText(l.t, { x: x + 0.08, y: 5.08, w: lw - 0.16, h: 0.3, margin: 0, align: "center", valign: "middle",
      fontFace: KR, fontSize: 12, bold: true, color: RED });
    s.addText(l.d, { x: x + 0.08, y: 5.38, w: lw - 0.16, h: 0.38, margin: 0, align: "center", valign: "top",
      fontFace: KR, fontSize: 10.5, color: MUTE });
  });
  s.addText("고령 농가가 더 노력해서 풀 수 없고, 보조금으로도 풀리지 않습니다. 관찰 자체를 기계가 대신해야 풀립니다.", {
    x: M + 0.28, y: 5.9, w: W - M * 2 - 0.56, h: 0.3, margin: 0,
    fontFace: KR, fontSize: 11.5, color: MUTE,
  });

  card(s, { x: M, y: 6.48, w: W - M * 2, h: 0.6, fill: INK, line: INK, flat: true });
  s.addText("답은 장비를 더 설치하는 것이 아니라, 이미 있는 장비와 데이터를 하나의 의사결정 체계로 묶는 것입니다", {
    x: M, y: 6.48, w: W - M * 2, h: 0.6, margin: 0, align: "center", valign: "middle",
    fontFace: KR, fontSize: 14, bold: true, color: WHITE,
  });

  s.addNotes(
    "여기가 이 사업의 논리적 핵심입니다. 문제는 장비 부족이 아니라 연결 부재입니다. " +
    "2026년 축산 ICT 보급은 전국 81개 농가 수준 — 이 속도로 장비를 깔아서 데이터를 모으려면 수십 년이 걸립니다."
  );
}

// ═══════════════════════════════════════════════════════════
// 6. WHAT 1 — 무엇을 만들 것인가
// ═══════════════════════════════════════════════════════════
{
  const s = pres.addSlide();
  head(s, "Ⅳ 무엇을 만들 것인가", "국가 플랫폼과 경쟁하지 않습니다 — 축산 기능을 완성합니다");

  const cw = (W - M * 2 - 0.42) / 2;

  card(s, { x: M, y: 1.6, w: cw, h: 2.24, fill: "F3F6F3" });
  s.addText("국가 농업 AX 플랫폼", {
    x: M + 0.28, y: 1.74, w: cw - 0.56, h: 0.34, margin: 0,
    fontFace: KR, fontSize: 15, bold: true, color: MUTE });
  s.addText(
    [
      { text: "농업 전반의 공통 데이터 인프라", options: { bullet: true, breakLine: true } },
      { text: "농업 AI 서비스 유통체계 · 농업인 인증", options: { bullet: true, breakLine: true } },
      { text: "공통 클라우드 · 보안 · 데이터 거버넌스", options: { bullet: true, breakLine: true } },
      { text: "농기계 · 시설원예 · 유통 등 범농업 서비스", options: { bullet: true } },
    ],
    { x: M + 0.28, y: 2.16, w: cw - 0.56, h: 1.56, margin: 0, valign: "top",
      fontFace: KR, fontSize: 12.5, color: BODY, lineSpacing: 18, paraSpaceAfter: 7 }
  );

  card(s, { x: M + cw + 0.42, y: 1.6, w: cw, h: 2.24, fill: "FBF6E6", line: "E4D08F" });
  s.addText("전남 축산 AX 플랫폼 (CowTalk Jeonnam)", {
    x: M + cw + 0.7, y: 1.74, w: cw - 0.56, h: 0.34, margin: 0,
    fontFace: KR, fontSize: 15, bold: true, color: INK });
  s.addText(
    [
      { text: "축산 생체 · 수의 · 방역 전문 데이터 처리", options: { bullet: true, breakLine: true } },
      { text: "축종별 AI 알고리즘 · 농가 작업과 수의진료 지원", options: { bullet: true, breakLine: true } },
      { text: "축산재난 · 분뇨 · 탄소 · 동물복지 · 시군 관제", options: { bullet: true, breakLine: true } },
      { text: "국가 플랫폼에 축산 데이터를 공급하는 실행계층", options: { bullet: true } },
    ],
    { x: M + cw + 0.7, y: 2.16, w: cw - 0.56, h: 1.56, margin: 0, valign: "top",
      fontFace: KR, fontSize: 12.5, color: BODY, lineSpacing: 18, paraSpaceAfter: 7 }
  );

  s.addText("4계층 구조", {
    x: M, y: 4.02, w: 3, h: 0.32, margin: 0,
    fontFace: KR, fontSize: 13, bold: true, color: GOLD, charSpacing: 1 });

  const layers = [
    { n: "①", t: "데이터 연결", d: "위내센서 · 귀표 · 카메라 · 착유로봇 · 자동급이기 · 축사 환경 · 이력제 · 혈통 · 기상/방역 공공데이터" },
    { n: "②", t: "데이터 플랫폼", d: "개체 ID 통합 · 표준화 · 실시간 수집 · 품질관리 · 농가별 접근권한 · 익명화 · AI 학습데이터 구축" },
    { n: "③", t: "AI 분석", d: "질병 조기위험 · 발정/수정 적기 · 분만시점 · 열 스트레스 · 사료효율 · 출하 예측 · 지역 질병위험" },
    { n: "④", t: "행동과 실행", d: "농가 오늘의 작업목록 · 수의사 진료 우선순위 · 시군 축산 상황판 · 도 정책 대시보드 · 장비 자동연계" },
  ];
  let ly = 4.34;
  layers.forEach((l) => {
    card(s, { x: M, y: ly, w: W - M * 2, h: 0.54, fill: WHITE, flat: true });
    s.addText(l.n, { x: M + 0.16, y: ly, w: 0.42, h: 0.54, margin: 0, align: "center", valign: "middle",
      fontFace: KR, fontSize: 15, bold: true, color: GOLD });
    s.addText(l.t, { x: M + 0.62, y: ly, w: 1.6, h: 0.54, margin: 0, valign: "middle",
      fontFace: KR, fontSize: 13, bold: true, color: INK });
    s.addText(l.d, { x: M + 2.3, y: ly, w: W - M * 2 - 2.5, h: 0.54, margin: 0, valign: "middle",
      fontFace: KR, fontSize: 11, color: MUTE });
    ly += 0.6;
  });

  s.addText("카우톡은 국가 플랫폼 위에 탑재되는 축산 전문 버티컬 AX 플랫폼입니다 — 중복이 아니라 보완입니다", {
    x: M, y: 6.88, w: W - M * 2, h: 0.4, margin: 0, valign: "middle", align: "center",
    fontFace: KR, fontSize: 12.5, bold: true, color: GREEN,
  });

  s.addNotes(
    "'중복 아니냐'는 질문이 반드시 나옵니다. 답은 역할 분담입니다. " +
    "국가 플랫폼은 범농업 공통 기반, 카우톡은 축산 생체·수의·방역을 처리하는 실행계층입니다."
  );
}

// ═══════════════════════════════════════════════════════════
// 7. WHAT 2 — 현장에서 어떻게 보이는가
// ═══════════════════════════════════════════════════════════
{
  const s = pres.addSlide();
  head(s, "Ⅳ 무엇을 만들 것인가", "농가에게는 그래프가 아니라 ‘오늘 할 일’을 드립니다");

  const lw = 6.0;
  card(s, { x: M, y: 1.6, w: lw, h: 3.5, fill: INK, line: INK });
  s.addText("오늘의 작업목록 — 실제 알림 예시", {
    x: M + 0.3, y: 1.76, w: lw - 0.6, h: 0.32, margin: 0,
    fontFace: KR, fontSize: 13, bold: true, color: GOLD });
  s.addText(
    [
      { text: "127번 소 — 체온 상승과 반추 감소가 동시 발생. 오전 중 임상검진 필요", options: { bullet: true, breakLine: true } },
      { text: "84번 소 — 발정 가능성 높음. 금일 오후 수정 권고", options: { bullet: true, breakLine: true } },
      { text: "35번 소 — 12시간 이내 분만 가능성. 분만사 이동 필요", options: { bullet: true, breakLine: true } },
      { text: "2번 우군 — 열 스트레스 위험 상승. 환기·급수 점검", options: { bullet: true, breakLine: true } },
      { text: "최근 7일 사료효율 하락 — TMR 수분과 조사료 품질 점검", options: { bullet: true } },
    ],
    { x: M + 0.3, y: 2.2, w: lw - 0.6, h: 1.9, margin: 0, valign: "top",
      fontFace: KR, fontSize: 12.5, color: "E4EBE6", lineSpacing: 18, paraSpaceAfter: 8 }
  );
  s.addText("이상 알림에서 끝나지 않고, 무엇을·언제·어떤 순서로 할지 제시합니다.\n앱을 전제하지 않습니다 — 문자·음성 안내와 수의사 연결도 함께 설계합니다.", {
    x: M + 0.3, y: 4.3, w: lw - 0.6, h: 0.66, margin: 0, valign: "top",
    fontFace: KR, fontSize: 10.5, color: "9CB3A6", lineSpacing: 15 });

  // 우 — 역할별
  const rx = M + lw + 0.3;
  const rw = W - M - rx;
  s.addText("같은 데이터, 네 개의 다른 화면", {
    x: rx, y: 1.6, w: rw, h: 0.3, margin: 0,
    fontFace: KR, fontSize: 13, bold: true, color: GOLD });

  const roles = [
    { r: "농 가", d: "오늘의 작업목록 · 위험 개체 우선순위 · 경제효과 표시" },
    { r: "수의사", d: "이상개체 선별 · 방문 전 데이터 확인 · 치료 전후 생체변화 · 항생제 관리" },
    { r: "시 · 군", d: "질병 이상징후 · 폭염/한파 취약농가 지도 · 스마트축산 사업 성과" },
    { r: "전남도", d: "생산량 전망 · 질병 조기경보 · 저탄소 MRV · 정책사업 효과분석" },
  ];
  let ry = 1.98;
  roles.forEach((r) => {
    card(s, { x: rx, y: ry, w: rw, h: 0.74, fill: WHITE, flat: true });
    s.addText(r.r, { x: rx + 0.14, y: ry, w: 1.0, h: 0.74, margin: 0, align: "center", valign: "middle",
      fontFace: KR, fontSize: 12.5, bold: true, color: GREEN });
    s.addText(r.d, { x: rx + 1.2, y: ry + 0.06, w: rw - 1.36, h: 0.62, margin: 0, valign: "middle",
      fontFace: KR, fontSize: 11, color: BODY, lineSpacing: 15 });
    ry += 0.8;
  });

  // 하단 원칙
  const pw = (W - M * 2 - 0.3) / 2;
  card(s, { x: M, y: 5.3, w: pw, h: 1.14, fill: "F3F6F3" });
  s.addText("데이터 권한 — 신뢰의 전제", {
    x: M + 0.26, y: 5.42, w: pw - 0.52, h: 0.28, margin: 0,
    fontFace: KR, fontSize: 12.5, bold: true, color: INK });
  s.addText("데이터 소유권은 원칙적으로 농가에 둡니다. 행정에는 농가 동의 아래 익명화된 위험등급과 정책지표만 제공합니다.", {
    x: M + 0.26, y: 5.72, w: pw - 0.52, h: 0.6, margin: 0, valign: "top",
    fontFace: KR, fontSize: 11, color: BODY, lineSpacing: 15 });

  card(s, { x: M + pw + 0.3, y: 5.3, w: pw, h: 1.14, fill: "F3F6F3" });
  s.addText("수의사 승인 게이트 (HITL)", {
    x: M + pw + 0.56, y: 5.42, w: pw - 0.52, h: 0.28, margin: 0,
    fontFace: KR, fontSize: 12.5, bold: true, color: INK });
  s.addText("AI는 진단하지 않습니다. AI는 볼 것을 골라주고, 최종 진단과 처방은 수의사가 합니다 — 판단근거·정확도·한계를 함께 표시합니다.", {
    x: M + pw + 0.56, y: 5.72, w: pw - 0.52, h: 0.6, margin: 0, valign: "top",
    fontFace: KR, fontSize: 11, color: BODY, lineSpacing: 15 });

  foot(s, "기술이 아니라 농가의 실제 업무 흐름을 중심으로 설계합니다");

  s.addNotes(
    "실무자가 가장 걱정하는 두 가지를 여기서 먼저 답합니다 — 농가 데이터가 행정에 노출되지 않는가, " +
    "AI 오진 책임은 누가 지는가. 소유권은 농가, 판단 책임은 수의사입니다."
  );
}

// ═══════════════════════════════════════════════════════════
// 8. WHAT 3 — 이미 작동하고 있습니다
// ═══════════════════════════════════════════════════════════
{
  const s = pres.addSlide();
  head(s, "Ⅴ 검증과 자기평가", "구상이 아닙니다 — 이미 작동하고 있고, 한계도 분명합니다");

  const sw = (W - M * 2 - 0.54) / 4;
  const nums = [
    { n: "201", l: "연동 농가" },
    { n: "11,170", l: "관리 두수" },
    { n: "11,127", l: "가동 센서" },
    { n: "757,062", l: "누적 AI 판단 이벤트" },
  ];
  nums.forEach((v, i) => {
    stat(s, { x: M + (sw + 0.18) * i, y: 1.6, w: sw, h: 1.24, num: v.n, numSize: 30, color: GREEN, label: v.l });
  });
  s.addText("2026년 7월 운영 대시보드 실측치 · 6개 AI 엔진 24/7 실시간 가동", {
    x: M, y: 2.9, w: W - M * 2, h: 0.26, margin: 0, align: "right",
    fontFace: KR, fontSize: 9.5, color: "97A29C" });

  const vw = (W - M * 2 - 0.36) / 3;
  const verif = [
    { y: "2013", t: "국내 최초 반추위 센서 도입", d: "13년간의 현장 데이터 축적" },
    { y: "2026. 05", t: "한–우즈베키스탄 양자 합의", d: "정부 실증 시연 · 해외 현장 검증" },
    { y: "2026. 06", t: "한국소임상수의사회(KABP) 발표", d: "국내 임상 학술 검증" },
  ];
  verif.forEach((v, i) => {
    const x = M + (vw + 0.18) * i;
    card(s, { x, y: 3.24, w: vw, h: 1.02, fill: WHITE, flat: true });
    s.addText(v.y, { x: x + 0.2, y: 3.34, w: vw - 0.4, h: 0.26, margin: 0,
      fontFace: KR, fontSize: 11, bold: true, color: GOLD });
    s.addText(v.t, { x: x + 0.2, y: 3.6, w: vw - 0.4, h: 0.3, margin: 0,
      fontFace: KR, fontSize: 12.5, bold: true, color: INK });
    s.addText(v.d, { x: x + 0.2, y: 3.9, w: vw - 0.4, h: 0.26, margin: 0,
      fontFace: KR, fontSize: 10.5, color: MUTE });
  });

  // 냉정한 자기평가
  const cw = (W - M * 2 - 0.3) / 2;
  card(s, { x: M, y: 4.48, w: cw, h: 1.86, fill: "F3F6F3" });
  s.addText("우리가 앞선 것", {
    x: M + 0.26, y: 4.6, w: cw - 0.52, h: 0.28, margin: 0,
    fontFace: KR, fontSize: 13, bold: true, color: GREEN });
  s.addText(
    [
      { text: "한우 특화 — 글로벌 사업자는 대부분 낙농 중심입니다", options: { bullet: true, breakLine: true } },
      { text: "반추위(체내) 센서 — 목걸이형과 달리 체내 지표를 직접 측정", options: { bullet: true, breakLine: true } },
      { text: "수의 임상 결합 — 센서 회사가 아니라 수의사가 운영하는 구조", options: { bullet: true } },
    ],
    { x: M + 0.26, y: 4.92, w: cw - 0.52, h: 1.3, margin: 0, valign: "top",
      fontFace: KR, fontSize: 11.5, color: BODY, lineSpacing: 16, paraSpaceAfter: 6 }
  );

  card(s, { x: M + cw + 0.3, y: 4.48, w: cw, h: 1.86, fill: "FBEDEC", line: "E8B9B5" });
  s.addText("우리가 뒤진 것 — 숨기지 않겠습니다", {
    x: M + cw + 0.56, y: 4.6, w: cw - 0.52, h: 0.28, margin: 0,
    fontFace: KR, fontSize: 13, bold: true, color: RED });
  s.addText(
    [
      { text: "데이터 규모 — 아일랜드 ICBF는 700만 두, 우리는 1만 두 수준입니다", options: { bullet: true, breakLine: true } },
      { text: "자본 규모 — Halter(뉴질랜드)는 단일 라운드 1억 달러를 조달했습니다", options: { bullet: true, breakLine: true } },
      { text: "국제 표준 — 상호운용 표준 참여 실적이 아직 없습니다", options: { bullet: true } },
    ],
    { x: M + cw + 0.56, y: 4.92, w: cw - 0.52, h: 1.3, margin: 0, valign: "top",
      fontFace: KR, fontSize: 11.5, color: BODY, lineSpacing: 16, paraSpaceAfter: 6 }
  );

  card(s, { x: M, y: 6.5, w: W - M * 2, h: 0.62, fill: INK, line: INK, flat: true });
  s.addText("1만 두로는 정확도에 한계가 있습니다 — 광역 실증으로 데이터를 늘리는 것 외에 방법이 없습니다. 그것이 이 제안의 실질적 이유입니다.", {
    x: M, y: 6.5, w: W - M * 2, h: 0.62, margin: 0, align: "center", valign: "middle",
    fontFace: KR, fontSize: 13, bold: true, color: WHITE });

  s.addNotes(
    "여기서 신뢰를 얻습니다. 잘하는 것만 말하지 않습니다. " +
    "1만 두 데이터의 한계를 먼저 말하고, 그래서 광역 실증이 필요하다는 논리로 연결합니다. " +
    "수치는 발표 당일 /api/public/stats로 최신값 확인 후 갱신할 것."
  );
}

// ═══════════════════════════════════════════════════════════
// 9. GAIN — 전남이 얻는 것
// ═══════════════════════════════════════════════════════════
{
  const s = pres.addSlide();
  head(s, "Ⅵ 무엇을 얻는가", "전남이 얻는 것 — 네 개 군으로 측정하고 공개합니다");

  const kw = (W - M * 2 - 0.54) / 4;
  const kpis = [
    { t: "농가 성과", c: GREEN, i: ["질병 조기발견 시간", "폐사율 · 치료비 감소", "공태일수 · 수정횟수 감소", "사료효율 · 두당 생산성", "노동시간 · 농가소득"] },
    { t: "행정 성과", c: GREEN, i: ["재난 취약농가 사전발굴률", "질병 이상징후 대응시간", "정책사업 중복 감소", "보조사업 성과측정률", "데이터 기반 정책 비율"] },
    { t: "환경 성과", c: GREEN, i: ["축산물 단위당 온실가스", "분뇨처리 이력관리율", "악취 민원 감소", "사료효율 자원절감", "저탄소 인증농가 증가"] },
    { t: "산업 성과", c: GREEN, i: ["축산 AI 기업 수", "신규 고용 · 청년 창업", "전남 축산 데이터셋", "AI 모델 · 특허", "타 시도 공급 · 수출액"] },
  ];
  kpis.forEach((k, i) => {
    const x = M + (kw + 0.18) * i;
    card(s, { x, y: 1.6, w: kw, h: 2.26, fill: WHITE });
    s.addShape(pres.ShapeType.roundRect, {
      x: x + 0.16, y: 1.74, w: kw - 0.32, h: 0.36, rectRadius: 0.05,
      fill: { color: GREEN }, line: { color: GREEN, width: 1 },
    });
    s.addText(k.t, { x: x + 0.16, y: 1.74, w: kw - 0.32, h: 0.36, margin: 0, align: "center", valign: "middle",
      fontFace: KR, fontSize: 12.5, bold: true, color: WHITE });
    s.addText(
      k.i.map((t, j) => ({ text: t, options: { bullet: true, breakLine: j < k.i.length - 1 } })),
      { x: x + 0.2, y: 2.2, w: kw - 0.4, h: 1.5, margin: 0, valign: "top",
        fontFace: KR, fontSize: 10.5, color: BODY, lineSpacing: 15, paraSpaceAfter: 4 }
    );
  });

  s.addText("측정 원칙 — ① 사업 전 기초선을 먼저 확보  ② 참여·비참여 농가를 함께 측정  ③ 실패 항목까지 포함해 공개  ④ 산출물은 보고서가 아니라 다음 사업의 설계 근거", {
    x: M, y: 3.96, w: W - M * 2, h: 0.3, margin: 0, align: "center",
    fontFace: KR, fontSize: 11, color: MUTE });

  const gw = (W - M * 2 - 0.3) / 2;
  card(s, { x: M, y: 4.4, w: gw, h: 2.0, fill: "FBF6E6", line: "E4D08F" });
  s.addText("전남이 갖게 되는 지위", {
    x: M + 0.26, y: 4.52, w: gw - 0.52, h: 0.3, margin: 0,
    fontFace: KR, fontSize: 13.5, bold: true, color: INK });
  s.addText(
    [
      { text: "대한민국 축산 AX 표준모델 선도지역 — 낙농 표준은 이미 경기도가 만들고 있고, 축산 AX 표준은 비어 있습니다", options: { bullet: true, breakLine: true } },
      { text: "국가 축산 AI 학습데이터 실증지역 — 축종과 농가 기반이 가장 적합합니다", options: { bullet: true, breakLine: true } },
      { text: "K-축산 AX 해외수출 거점 — 국가 레퍼런스를 가진 지역이 수출 모델의 원본이 됩니다", options: { bullet: true } },
    ],
    { x: M + 0.26, y: 4.86, w: gw - 0.52, h: 1.42, margin: 0, valign: "top",
      fontFace: KR, fontSize: 11, color: BODY, lineSpacing: 15, paraSpaceAfter: 6 }
  );

  card(s, { x: M + gw + 0.3, y: 4.4, w: gw, h: 2.0, fill: "FBEDEC", line: "E8B9B5" });
  s.addText("하지 않았을 때의 비용", {
    x: M + gw + 0.56, y: 4.52, w: gw - 0.52, h: 0.3, margin: 0,
    fontFace: KR, fontSize: 13.5, bold: true, color: RED });
  s.addText(
    [
      { text: "데이터 공백은 소급되지 않습니다 — 올해 놓친 개체 데이터는 내년에 만들 수 없습니다", options: { bullet: true, breakLine: true } },
      { text: "기초선이 없으면 어떤 정책 효과도 증명할 수 없습니다", options: { bullet: true, breakLine: true } },
      { text: "저탄소 인증도 수출 이력 증명도 개체 단위 데이터가 전제입니다 — 없으면 자격 자체가 없습니다", options: { bullet: true } },
    ],
    { x: M + gw + 0.56, y: 4.86, w: gw - 0.52, h: 1.42, margin: 0, valign: "top",
      fontFace: KR, fontSize: 11, color: BODY, lineSpacing: 15, paraSpaceAfter: 6 }
  );

  s.addText("타당성 조사 비용은 3~5억원이지만, 하지 않는 비용은 청구되지 않을 뿐 더 큽니다", {
    x: M, y: 6.62, w: W - M * 2, h: 0.42, margin: 0, valign: "middle", align: "center",
    fontFace: KR, fontSize: 12.5, bold: true, color: RED });

  s.addNotes(
    "경제성은 플랫폼 매출이 아니라 회피되는 손실의 총합으로 평가해야 합니다. " +
    "두당 회수액을 지금 단정하지 않는 것은 정직함 때문입니다 — 그 확정이 실증사업의 산출물입니다."
  );
}

// ═══════════════════════════════════════════════════════════
// 10. ASK
// ═══════════════════════════════════════════════════════════
{
  const s = pres.addSlide();
  s.background = { color: INK };

  s.addText("Ⅶ 요청사항", {
    x: M, y: 0.44, w: 4, h: 0.3, margin: 0,
    fontFace: KR, fontSize: 11, bold: true, color: GOLD, charSpacing: 1.2 });
  s.addText("오늘 결정을 요청드리는 것은 세 가지입니다", {
    x: M, y: 0.78, w: W - M * 2, h: 0.62, margin: 0, valign: "top",
    fontFace: KR, fontSize: 27, bold: true, color: WHITE });

  const asks = [
    { n: "1", t: "국가 농업 AX 플랫폼 SPC 사업계획에 ‘축산 AX 전문영역’을 공식 반영", d: "SPC 사업계획 확정 전이 유일한 반영 시점입니다" },
    { n: "2", t: "축산정책과 · 농업정책과 · SPC 준비조직 · 카우톡이 참여하는 실무협의회 구성", d: "새 조직을 만들지 않습니다 — 기존 부서의 협의 테이블입니다" },
    { n: "3", t: "「전남 축산 AX 플랫폼 기본계획 및 타당성 조사」 용역 추진", d: "6개월 · 3~5억원 규모(안) — 나머지 단계의 판단 근거를 만듭니다" },
  ];
  let ay = 1.66;
  asks.forEach((a) => {
    s.addShape(pres.ShapeType.roundRect, {
      x: M, y: ay, w: W - M * 2, h: 0.92, rectRadius: 0.06,
      fill: { color: "1B3529" }, line: { color: "2E5344", width: 1 },
    });
    s.addShape(pres.ShapeType.roundRect, {
      x: M + 0.26, y: ay + 0.21, w: 0.5, h: 0.5, rectRadius: 0.05,
      fill: { color: GOLD }, line: { color: GOLD, width: 1 },
    });
    s.addText(a.n, { x: M + 0.26, y: ay + 0.21, w: 0.5, h: 0.5, margin: 0, align: "center", valign: "middle",
      fontFace: KR, fontSize: 16, bold: true, color: INK });
    s.addText(a.t, { x: M + 0.98, y: ay + 0.14, w: W - M * 2 - 1.28, h: 0.38, margin: 0, valign: "middle",
      fontFace: KR, fontSize: 15.5, bold: true, color: WHITE });
    s.addText(a.d, { x: M + 0.98, y: ay + 0.52, w: W - M * 2 - 1.28, h: 0.3, margin: 0, valign: "middle",
      fontFace: KR, fontSize: 11.5, color: "9CB3A6" });
    ay += 1.02;
  });

  // 추진 4단계
  s.addText("이후 추진 경로", {
    x: M, y: 4.86, w: 3, h: 0.28, margin: 0,
    fontFace: KR, fontSize: 11.5, bold: true, color: GOLD });
  const stages = [
    { s: "1단계", t: "정책설계 · 타당성 조사", d: "6개월" },
    { s: "2단계", t: "축우 중심 실증", d: "2년 · 3~5개 시군 · 30~50농가" },
    { s: "3단계", t: "다축종 · 시군 확산", d: "한우·젖소·돼지·가금·염소" },
    { s: "4단계", t: "국가 · 해외 확산", d: "국가 표준모델 · 수출" },
  ];
  const stw = (W - M * 2 - 0.36) / 4;
  stages.forEach((st, i) => {
    const x = M + (stw + 0.12) * i;
    s.addShape(pres.ShapeType.roundRect, {
      x, y: 5.2, w: stw, h: 0.96, rectRadius: 0.05,
      fill: { color: i === 0 ? "2E5344" : "17301F" }, line: { color: i === 0 ? GOLD : "2A483A", width: 1 },
    });
    s.addText(st.s, { x: x + 0.12, y: 5.28, w: stw - 0.24, h: 0.24, margin: 0, align: "center",
      fontFace: KR, fontSize: 10, bold: true, color: i === 0 ? GOLD : "7E9488" });
    s.addText(st.t, { x: x + 0.12, y: 5.52, w: stw - 0.24, h: 0.28, margin: 0, align: "center",
      fontFace: KR, fontSize: 12.5, bold: true, color: WHITE });
    s.addText(st.d, { x: x + 0.12, y: 5.8, w: stw - 0.24, h: 0.28, margin: 0, align: "center",
      fontFace: KR, fontSize: 10, color: "9CB3A6" });
  });
  s.addText("오늘 결정이 필요한 것은 1단계뿐입니다", {
    x: M, y: 6.22, w: stw, h: 0.26, margin: 0, align: "center",
    fontFace: KR, fontSize: 9.5, italic: true, color: GOLD });

  s.addText("전남이 지금 축산 AX를 선점하면 대한민국의 표준이 되고, 그 다음은 K-축산 플랫폼 수출입니다.", {
    x: M, y: 6.6, w: W - M * 2, h: 0.4, margin: 0, valign: "middle", align: "center",
    fontFace: KR, fontSize: 14, bold: true, color: GOLD });
  s.addText("감사합니다.  질의응답", {
    x: M, y: 7.0, w: W - M * 2, h: 0.3, margin: 0, align: "center", valign: "middle",
    fontFace: KR, fontSize: 11, color: "7E9488" });

  s.addNotes(
    "마무리. 오늘 결정하실 것은 사업 추진이 아니라 검토를 시작해도 좋다는 판단입니다. " +
    "1~3번만 결정되면 나머지는 순차로 진행됩니다. 질의응답."
  );
}

pres.writeFile({ fileName: "전남_축산AX_플랫폼_제안_10p.pptx" }).then((f) => console.log("wrote", f));
