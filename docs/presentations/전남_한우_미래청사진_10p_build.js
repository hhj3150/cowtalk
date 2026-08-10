const pptxgen = require("pptxgenjs");

const pres = new pptxgen();
pres.layout = "LAYOUT_WIDE"; // 13.333 x 7.5
pres.author = "하현제";
pres.title = "전남 한우 미래 청사진 — 카우톡 AI 축산 디지털 플랫폼";

const W = 13.333, H = 7.5, M = 0.62;

// ── palette : blueprint navy + amber ───────────────────────
const INK   = "0E2233";
const DEEP  = "14344F";
const AMBER = "D9932F";
const TEAL  = "1F7A6B";
const RED   = "BE3A2B";
const TINT  = "EEF2F5";
const LINE  = "D3DCE3";
const BODY  = "1F2E38";
const MUTE  = "5C6F7C";
const WHITE = "FFFFFF";

const KR = "Malgun Gothic";

const sh = () => ({ type: "outer", color: "0E2233", blur: 9, offset: 1, angle: 90, opacity: 0.10 });

function head(s, chip, title) {
  s.addText(chip, {
    x: M, y: 0.40, w: 5.0, h: 0.30, margin: 0,
    fontFace: KR, fontSize: 11, bold: true, color: AMBER, charSpacing: 1.2,
  });
  s.addText(title, {
    x: M, y: 0.74, w: W - M * 2, h: 0.66, margin: 0, valign: "top",
    fontFace: KR, fontSize: 27, bold: true, color: INK,
  });
}

function band(s, y, text, fill) {
  s.addShape(pres.ShapeType.roundRect, {
    x: M, y, w: W - M * 2, h: 0.6, rectRadius: 0.06,
    fill: { color: fill || INK }, line: { color: fill || INK, width: 1 },
  });
  s.addText(text, {
    x: M + 0.2, y, w: W - M * 2 - 0.4, h: 0.6, margin: 0, align: "center", valign: "middle",
    fontFace: KR, fontSize: 14, bold: true, color: WHITE,
  });
}

function card(s, o) {
  s.addShape(pres.ShapeType.roundRect, {
    x: o.x, y: o.y, w: o.w, h: o.h, rectRadius: 0.06,
    fill: { color: o.fill || TINT }, line: { color: o.line || LINE, width: 0.75 },
    shadow: o.flat ? undefined : sh(),
  });
}

function stat(s, o) {
  card(s, { x: o.x, y: o.y, w: o.w, h: o.h, fill: o.fill || WHITE });
  s.addText(o.num, {
    x: o.x, y: o.y + 0.14, w: o.w, h: 0.68, margin: 0, align: "center", valign: "middle",
    fontFace: KR, fontSize: o.numSize || 29, bold: true, color: o.color || INK,
  });
  s.addText(o.label, {
    x: o.x + 0.1, y: o.y + 0.84, w: o.w - 0.2, h: o.h - 0.94, margin: 0, align: "center", valign: "top",
    fontFace: KR, fontSize: 10.5, color: MUTE, lineSpacing: 15,
  });
}

function src(s, text, y) {
  s.addText(text, {
    x: M, y: y || 6.96, w: W - M * 2, h: 0.26, margin: 0, align: "right",
    fontFace: KR, fontSize: 8.5, color: "93A3AE",
  });
}

// ═══════════════════════════════════════════════════════════
// 1. 표지
// ═══════════════════════════════════════════════════════════
{
  const s = pres.addSlide();
  s.background = { color: INK };

  s.addText("지속가능한 한우 산업을 위한 미래 청사진", {
    x: 1.05, y: 1.68, w: 11, h: 0.34, margin: 0,
    fontFace: KR, fontSize: 13.5, bold: true, color: AMBER, charSpacing: 1.5,
  });

  s.addText("전남 축산 디지털 플랫폼", {
    x: 1.05, y: 2.2, w: 11.2, h: 0.9, margin: 0, valign: "middle",
    fontFace: KR, fontSize: 46, bold: true, color: WHITE,
  });
  s.addText("구축사업 제안", {
    x: 1.05, y: 3.06, w: 11.2, h: 0.64, margin: 0, valign: "middle",
    fontFace: KR, fontSize: 34, bold: true, color: "8FA9BB",
  });

  s.addShape(pres.ShapeType.roundRect, {
    x: 1.05, y: 3.98, w: 6.9, h: 0.62, rectRadius: 0.06,
    fill: { color: "16354D" }, line: { color: "27506E", width: 1 },
  });
  s.addText("CowTalk — 위내센서 · 공공데이터 · AI 해석 · 역할별 액션플랜", {
    x: 1.05, y: 3.98, w: 6.9, h: 0.62, margin: 0, align: "center", valign: "middle",
    fontFace: KR, fontSize: 13.5, bold: true, color: AMBER,
  });

  s.addText(
    [
      { text: "고려동물병원 대표 · 수의사  하현제", options: { fontSize: 14, bold: true, color: WHITE, breakLine: true } },
      { text: "hhj3150@hanmail.net", options: { fontSize: 11, color: "7E96A6" } },
    ],
    { x: 1.05, y: 5.28, w: 5.2, h: 0.8, margin: 0, valign: "middle", fontFace: KR }
  );
  s.addText("2026. 8.   ·   전라남도", {
    x: 6.6, y: 5.28, w: 5.7, h: 0.8, margin: 0, valign: "middle", align: "right",
    fontFace: KR, fontSize: 13, color: "7E96A6",
  });

  s.addNotes(
    "오늘 네 가지를 순서대로 말씀드립니다. 전남 한우의 현황, 그 뒤에 있는 문제, " +
    "카우톡이 제시하는 해결책, 그리고 전남이 얻게 될 기대효과입니다."
  );
}

// ═══════════════════════════════════════════════════════════
// 2. 현황 ①
// ═══════════════════════════════════════════════════════════
{
  const s = pres.addSlide();
  head(s, "01  현황", "전남 한우는 대한민국 한우의 중심입니다");

  const sw = (W - M * 2 - 0.54) / 4;
  const nums = [
    { n: "15.4%", l: "전국 한우 출하 비중\n전국 2위 산지", c: INK },
    { n: "24.2조원", l: "축산업 생산액 (2023)\n농업 생산액의 40.9%", c: INK, size: 26 },
    { n: "363만두", l: "전국 한우 사육두수\n(2026. 4) 전년 대비 −3.2%", c: INK, size: 27 },
    { n: "42.4두", l: "농장당 평균 사육두수\n(2000년 5.5두 → 규모화)", c: INK },
  ];
  nums.forEach((v, i) => {
    stat(s, { x: M + (sw + 0.18) * i, y: 1.62, w: sw, h: 1.52, num: v.n, numSize: v.size || 29, color: v.c, label: v.l });
  });

  const cw = (W - M * 2 - 0.3) / 2;
  card(s, { x: M, y: 3.34, w: cw, h: 2.42, fill: WHITE });
  s.addText("23년 동안 이룬 것", {
    x: M + 0.28, y: 3.48, w: cw - 0.56, h: 0.32, margin: 0,
    fontFace: KR, fontSize: 14.5, bold: true, color: TEAL });
  s.addText(
    [
      { text: "축산업 생산액이 2000년 8.1조원에서 24.2조원으로 약 3배가 되었습니다", options: { bullet: true, breakLine: true } },
      { text: "농장당 사육두수 5.5두 → 42.4두. 부업에서 전업 산업으로 전환됐습니다", options: { bullet: true, breakLine: true } },
      { text: "소 이력제가 전국 시행되어 개체를 특정할 수 있는 기반은 이미 갖췄습니다", options: { bullet: true, breakLine: true } },
      { text: "전남은 그 성장의 한 축을 담당해 왔습니다 — 출하 기준 전국 2위", options: { bullet: true } },
    ],
    { x: M + 0.28, y: 3.86, w: cw - 0.56, h: 1.76, margin: 0, valign: "top",
      fontFace: KR, fontSize: 11.5, color: BODY, lineSpacing: 16, paraSpaceAfter: 7 }
  );

  card(s, { x: M + cw + 0.3, y: 3.34, w: cw, h: 2.42, fill: "F2F6F8" });
  s.addText("그러나 이룬 것의 성격", {
    x: M + cw + 0.58, y: 3.48, w: cw - 0.56, h: 0.32, margin: 0,
    fontFace: KR, fontSize: 14.5, bold: true, color: INK });
  s.addText(
    [
      { text: "성장은 '두수와 규모'에서 나왔습니다 — 더 많이, 더 크게 기르는 방식", options: { bullet: true, breakLine: true } },
      { text: "생산성 자체를 끌어올리는 방식은 아직 본격화되지 않았습니다", options: { bullet: true, breakLine: true } },
      { text: "규모는 커졌지만 관리 방식은 사람의 눈과 경험에 그대로 머물러 있습니다", options: { bullet: true, breakLine: true } },
      { text: "그래서 다음 장의 숫자가 나옵니다", options: { bullet: true } },
    ],
    { x: M + cw + 0.58, y: 3.86, w: cw - 0.56, h: 1.76, margin: 0, valign: "top",
      fontFace: KR, fontSize: 11.5, color: BODY, lineSpacing: 16, paraSpaceAfter: 7 }
  );

  band(s, 6.06, "규모는 다 키웠습니다. 이제 남은 것은 '같은 소에서 더 얻는 것' — 생산성입니다");
  src(s, "출처: 통계청 농림어업조사 · 축산물이력제 데이터(2026. 4) · 국가데이터처 가축동향");

  s.addNotes(
    "먼저 좋은 소식부터. 전남 한우는 작은 산업이 아닙니다. 23년간 3배 성장했고 전국 2위 산지입니다. " +
    "다만 그 성장이 어디서 나왔는지가 중요합니다 — 두수와 규모였습니다. 그 방식이 지금 한계에 닿았습니다."
  );
}

// ═══════════════════════════════════════════════════════════
// 3. 현황 ②
// ═══════════════════════════════════════════════════════════
{
  const s = pres.addSlide();
  head(s, "01  현황", "그런데 지금, 기를수록 손해인 구조에 들어섰습니다");

  const sw = (W - M * 2 - 0.54) / 4;
  const nums = [
    { n: "−86.1만원", l: "한우 번식우\n마리당 순손실 (2025)" },
    { n: "−99.9만원", l: "한우 비육우\n마리당 순손실 (2025)" },
    { n: "−10만두", l: "가임암소\n2년 새 감소" },
    { n: "−3,689호", l: "한우 사육 농장\n1년 새 감소 (−4.8%)" },
  ];
  nums.forEach((v, i) => {
    stat(s, { x: M + (sw + 0.18) * i, y: 1.62, w: sw, h: 1.46, num: v.n, numSize: 25, color: RED, label: v.l });
  });

  const cw = (W - M * 2 - 0.3) / 2;
  card(s, { x: M, y: 3.28, w: cw, h: 2.6, fill: WHITE });
  s.addText("숫자가 말하는 것", {
    x: M + 0.28, y: 3.42, w: cw - 0.56, h: 0.32, margin: 0,
    fontFace: KR, fontSize: 14.5, bold: true, color: INK });
  s.addText(
    [
      { text: "생산액은 사상 최대인데 농가 손익은 마이너스입니다 — 사료비·인건비가 증가분을 모두 흡수했습니다", options: { bullet: true, breakLine: true } },
      { text: "손실 구조에서는 재투자가 멈춥니다. 시설도, 후계 인력도 함께 멈춥니다", options: { bullet: true, breakLine: true } },
      { text: "송아지 가격 강세는 호황 신호가 아니라 생산기반이 줄고 있다는 경고입니다", options: { bullet: true } },
    ],
    { x: M + 0.28, y: 3.8, w: cw - 0.56, h: 1.94, margin: 0, valign: "top",
      fontFace: KR, fontSize: 11.5, color: BODY, lineSpacing: 16, paraSpaceAfter: 8 }
  );

  card(s, { x: M + cw + 0.3, y: 3.28, w: cw, h: 2.6, fill: "FAEDEB", line: "E4B4AC" });
  s.addText("가장 위험한 신호 — 번식 기반", {
    x: M + cw + 0.58, y: 3.42, w: cw - 0.56, h: 0.32, margin: 0,
    fontFace: KR, fontSize: 14.5, bold: true, color: RED });
  s.addText(
    [
      { text: "사육두수 감소는 수급 조절로 회복됩니다. 그러나 가임암소와 번식농가의 소멸은 회복되지 않습니다", options: { bullet: true, breakLine: true } },
      { text: "번식 손실이 더 크기 때문에 번식농가가 먼저 그만둡니다", options: { bullet: true, breakLine: true } },
      { text: "가임암소 감소는 3~4년 뒤 송아지 공급 부족으로 돌아옵니다 — 전남 비육농가가 먼저 타격을 받습니다", options: { bullet: true } },
    ],
    { x: M + cw + 0.58, y: 3.8, w: cw - 0.56, h: 1.94, margin: 0, valign: "top",
      fontFace: KR, fontSize: 11.5, color: BODY, lineSpacing: 16, paraSpaceAfter: 8 }
  );

  band(s, 6.06, "지금 필요한 것은 보조금이 아니라 두당 원가와 손실 요인을 줄이는 구조입니다", RED);
  src(s, "출처: 통계청 2025년 축산물생산비조사 · 국가데이터처 가축동향(2026. 6. 1 기준)");

  s.addNotes(
    "번식우 86만원, 비육우 100만원 손실입니다. 여기서 핵심은 번식입니다. " +
    "두수는 되돌릴 수 있지만 가임암소와 번식농가가 사라지면 되돌릴 수 없습니다. " +
    "그리고 그 청구서는 전남 비육농가가 먼저 받습니다."
  );
}

// ═══════════════════════════════════════════════════════════
// 4. 문제 ①
// ═══════════════════════════════════════════════════════════
{
  const s = pres.addSlide();
  head(s, "02  문제점", "근본 원인 — 한우는 ‘보이지 않는 산업’입니다");

  const cw = (W - M * 2 - 0.3) / 2;

  card(s, { x: M, y: 1.6, w: cw, h: 2.72, fill: WHITE });
  s.addText("한우 농가는 30개월을 계기판 없이 운행합니다", {
    x: M + 0.28, y: 1.74, w: cw - 0.56, h: 0.32, margin: 0,
    fontFace: KR, fontSize: 14.5, bold: true, color: INK });

  const trows = [
    ["구분", "낙농 (젖소)", "한우"],
    ["일일 접점", "착유 2회 — 유량 자동 기록", "없음 (급이 외 부재)"],
    ["이상 감지", "유량 저하로 즉시 포착", "증상 발현까지 미포착"],
    ["성과 확인", "매일 교정 가능", "도체성적 — 30개월 뒤 1회"],
  ];
  s.addTable(
    trows.map((r, i) =>
      r.map((c, j) => ({
        text: c,
        options: {
          fontFace: KR, fontSize: i === 0 ? 9.5 : 10,
          bold: i === 0 || j === 0,
          color: i === 0 ? WHITE : (j === 2 ? RED : BODY),
          fill: i === 0 ? { color: DEEP } : { color: i % 2 ? "FFFFFF" : "F4F7F9" },
          align: "left", valign: "middle", margin: [2, 5, 2, 5],
        },
      }))
    ),
    { x: M + 0.28, y: 2.16, w: cw - 0.56, colW: [0.95, 2.35, 2.14], rowH: [0.25, 0.32, 0.32, 0.32],
      border: { type: "solid", color: LINE, pt: 0.5 } }
  );
  s.addText("낙농은 매일 데이터가 쌓이지만, 한우는 30개월 뒤 도체성적 한 번이 유일한 성적표입니다.\n교정할 기회 없이 결과만 확인하는 구조입니다.", {
    x: M + 0.28, y: 3.6, w: cw - 0.56, h: 0.6, margin: 0, valign: "top",
    fontFace: KR, fontSize: 11, color: MUTE, lineSpacing: 15 });

  card(s, { x: M + cw + 0.3, y: 1.6, w: cw, h: 2.72, fill: "F2F6F8" });
  s.addText("보이지 않아서 생기는 손실", {
    x: M + cw + 0.58, y: 1.74, w: cw - 0.56, h: 0.32, margin: 0,
    fontFace: KR, fontSize: 14.5, bold: true, color: INK });
  s.addText(
    [
      { text: "발정 1회 미발견 = 공태 21일 연장 — 한우는 발현이 미약하고 야간 발정이 많습니다", options: { bullet: true, breakLine: true } },
      { text: "분만 감시 실패 — 밤샘 대기와 난산 대응 시점 판단이 사람에게 달려 있습니다", options: { bullet: true, breakLine: true } },
      { text: "질병은 외관 증상이 보이는 시점엔 이미 늦습니다", options: { bullet: true, breakLine: true } },
      { text: "번식장애 조기 발견 실패 → 도태 지연 → 사료비만 누적됩니다", options: { bullet: true } },
    ],
    { x: M + cw + 0.58, y: 2.16, w: cw - 0.56, h: 2.04, margin: 0, valign: "top",
      fontFace: KR, fontSize: 11.5, color: BODY, lineSpacing: 16, paraSpaceAfter: 7 }
  );

  card(s, { x: M, y: 4.5, w: W - M * 2, h: 1.42, fill: "FAEDEB", line: "E4B4AC" });
  s.addText("그리고 이 네 가지는 모두 ‘24시간 관찰’의 문제입니다", {
    x: M + 0.28, y: 4.62, w: W - M * 2 - 0.56, h: 0.32, margin: 0,
    fontFace: KR, fontSize: 14, bold: true, color: RED });
  s.addText(
    "축산농가 고령화가 진행되는 상황에서, 밤샘 관찰을 사람의 노력으로 더 늘리는 방식은 불가능합니다.\n" +
    "보조금으로도 풀리지 않습니다 — 관찰 자체를 기계가 대신해야 풀리는 문제입니다.",
    { x: M + 0.28, y: 5.0, w: W - M * 2 - 0.56, h: 0.7, margin: 0, valign: "top",
      fontFace: KR, fontSize: 11.5, color: BODY, lineSpacing: 17 }
  );

  band(s, 6.14, "한우 산업의 문제는 ‘노력 부족’이 아니라 ‘데이터 부재’입니다");

  s.addNotes(
    "이 장이 오늘 발표의 논리적 뿌리입니다. 한우는 낙농과 달리 매일 접점이 없습니다. " +
    "그래서 문제가 보일 때는 이미 늦습니다. 그리고 이건 농가가 더 노력해서 풀 수 있는 문제가 아닙니다."
  );
}

// ═══════════════════════════════════════════════════════════
// 5. 문제 ②
// ═══════════════════════════════════════════════════════════
{
  const s = pres.addSlide();
  head(s, "02  문제점", "그동안의 대책이 멈춰 선 지점");

  card(s, { x: M, y: 1.58, w: W - M * 2, h: 0.56, fill: "F2F6F8", flat: true });
  s.addText("자동급이기 · 환기장치 · 발정탐지기 · 위내센서 · CCTV — 장비는 계속 보급됐습니다. 그런데 농가의 문제는 줄지 않았습니다. 왜일까요.", {
    x: M + 0.24, y: 1.58, w: W - M * 2 - 0.48, h: 0.56, margin: 0, valign: "middle",
    fontFace: KR, fontSize: 12, color: BODY });

  const pw = (W - M * 2 - 0.36) / 3;
  const probs = [
    { n: "01", t: "장비의 섬", d: [
      "장비마다 별도 프로그램과 데이터 형식",
      "농가는 여러 앱을 따로 확인해야 합니다",
      "장비를 바꾸면 과거 데이터를 쓸 수 없습니다",
    ] },
    { n: "02", t: "알람과 행동의 단절", d: [
      "알람은 오는데 무엇을 먼저 할지 알려주지 않습니다",
      "‘발정입니다’ 다음에 판단은 농가 몫입니다",
      "센서 이상과 실제 질병을 구분하기 어렵습니다",
    ] },
    { n: "03", t: "닫힌 데이터", d: [
      "수의사에게 데이터가 자동 전달되지 않습니다",
      "지자체는 농장별 위험을 실시간으로 못 봅니다",
      "정책사업의 실제 효과를 측정할 수 없습니다",
    ] },
  ];
  probs.forEach((p, i) => {
    const x = M + (pw + 0.18) * i;
    card(s, { x, y: 2.36, w: pw, h: 2.26, fill: WHITE });
    s.addShape(pres.ShapeType.roundRect, {
      x: x + 0.26, y: 2.54, w: 0.52, h: 0.42, rectRadius: 0.05,
      fill: { color: RED }, line: { color: RED, width: 1 },
    });
    s.addText(p.n, { x: x + 0.26, y: 2.54, w: 0.52, h: 0.42, margin: 0, align: "center", valign: "middle",
      fontFace: KR, fontSize: 12.5, bold: true, color: WHITE });
    s.addText(p.t, { x: x + 0.9, y: 2.54, w: pw - 1.16, h: 0.42, margin: 0, valign: "middle",
      fontFace: KR, fontSize: 15, bold: true, color: INK });
    s.addText(
      p.d.map((t, j) => ({ text: t, options: { bullet: true, breakLine: j < p.d.length - 1 } })),
      { x: x + 0.28, y: 3.08, w: pw - 0.56, h: 1.4, margin: 0, valign: "top",
        fontFace: KR, fontSize: 11, color: BODY, lineSpacing: 15, paraSpaceAfter: 7 }
    );
  });

  card(s, { x: M, y: 4.82, w: W - M * 2, h: 1.3, fill: "FFF6E8", line: "E8C98C" });
  s.addText("정리하면 — 문제는 ‘장비가 부족한 것’이 아닙니다", {
    x: M + 0.28, y: 4.94, w: W - M * 2 - 0.56, h: 0.3, margin: 0,
    fontFace: KR, fontSize: 14, bold: true, color: INK });
  s.addText(
    "센서는 이미 세계 최고 수준입니다. 비어 있는 것은 ‘감지’와 ‘행동’ 사이의 다리입니다.\n" +
    "무엇을 관찰할지는 기계가 풀었지만, 그래서 무엇을 해야 하는지는 여전히 사람이 혼자 판단합니다.",
    { x: M + 0.28, y: 5.28, w: W - M * 2 - 0.56, h: 0.72, margin: 0, valign: "top",
      fontFace: KR, fontSize: 11.5, color: BODY, lineSpacing: 17 }
  );

  band(s, 6.32, "그래서 필요한 것은 장비가 아니라, 감지 → 판단 → 행동 → 기록을 잇는 운영체제입니다", AMBER);

  s.addNotes(
    "여기서 해결책으로 넘어가는 다리를 놓습니다. 장비를 더 깔자는 이야기가 아닙니다. " +
    "이미 깔린 장비의 데이터를 하나의 판단 체계로 묶자는 것입니다. 그것이 카우톡입니다."
  );
}

// ═══════════════════════════════════════════════════════════
// 6. 해결책 ① — 카우톡 구조
// ═══════════════════════════════════════════════════════════
{
  const s = pres.addSlide();
  head(s, "03  해결책", "카우톡 — 축산 디지털 운영체제");

  // 공식 배너
  s.addShape(pres.ShapeType.roundRect, {
    x: M, y: 1.56, w: W - M * 2, h: 0.68, rectRadius: 0.06,
    fill: { color: INK }, line: { color: INK, width: 1 },
  });
  s.addText(
    [
      { text: "위내센서", options: { color: WHITE, bold: true } },
      { text: "  +  ", options: { color: "7E96A6" } },
      { text: "국가 공공데이터", options: { color: WHITE, bold: true } },
      { text: "  +  ", options: { color: "7E96A6" } },
      { text: "AI 해석", options: { color: WHITE, bold: true } },
      { text: "  +  ", options: { color: "7E96A6" } },
      { text: "역할별 액션플랜", options: { color: WHITE, bold: true } },
      { text: "   =   ", options: { color: "7E96A6" } },
      { text: "축산 디지털 운영체제", options: { color: AMBER, bold: true } },
    ],
    { x: M, y: 1.56, w: W - M * 2, h: 0.68, margin: 0, align: "center", valign: "middle",
      fontFace: KR, fontSize: 15 }
  );

  // 좌 — 4계층
  const lw = 8.05;
  s.addText("4계층 구조", {
    x: M, y: 2.42, w: 3, h: 0.3, margin: 0,
    fontFace: KR, fontSize: 12.5, bold: true, color: AMBER, charSpacing: 1 });

  const layers = [
    { n: "1", t: "데이터 통합", d: "위내센서(체온·활동·반추) + 이력제 · 혈통 · 등급판정 · 경락가 · 기상 · 방역 공공데이터 + 농장 기록 → 통합 개체 프로필" },
    { n: "2", t: "AI 해석", d: "센서 이벤트는 재판단하지 않고 신뢰. 맥락을 붙여 해석하고 개체별 조치를 생성 — 근거·기여요인·한계를 함께 표시" },
    { n: "3", t: "역할별 전달", d: "농가 · 수의사 · 방역관 · 행정이 같은 데이터를 각자의 화면과 액션으로 받습니다" },
    { n: "4", t: "학습 루프", d: "조치 결과와 전문가 판단이 다시 입력됩니다. 오탐률·확진율을 집계해 판단 기준을 스스로 보정합니다" },
  ];
  let ly = 2.78;
  layers.forEach((l) => {
    card(s, { x: M, y: ly, w: lw, h: 0.86, fill: WHITE, flat: true });
    s.addShape(pres.ShapeType.roundRect, {
      x: M + 0.2, y: ly + 0.22, w: 0.42, h: 0.42, rectRadius: 0.05,
      fill: { color: DEEP }, line: { color: DEEP, width: 1 },
    });
    s.addText(l.n, { x: M + 0.2, y: ly + 0.22, w: 0.42, h: 0.42, margin: 0, align: "center", valign: "middle",
      fontFace: KR, fontSize: 13, bold: true, color: WHITE });
    s.addText(l.t, { x: M + 0.76, y: ly + 0.06, w: 1.5, h: 0.74, margin: 0, valign: "middle",
      fontFace: KR, fontSize: 13, bold: true, color: INK });
    s.addText(l.d, { x: M + 2.3, y: ly + 0.08, w: lw - 2.5, h: 0.7, margin: 0, valign: "middle",
      fontFace: KR, fontSize: 10.5, color: MUTE, lineSpacing: 14 });
    ly += 0.92;
  });

  // 우 — 6 엔진
  const rx = M + lw + 0.28;
  const rw = W - M - rx;
  s.addText("가동 중인 AI 엔진 6종", {
    x: rx, y: 2.42, w: rw, h: 0.3, margin: 0,
    fontFace: KR, fontSize: 12.5, bold: true, color: AMBER, charSpacing: 1 });
  card(s, { x: rx, y: 2.78, w: rw, h: 3.5, fill: "F2F6F8" });
  s.addText(
    [
      { text: "Claude LLM 해석 엔진", options: { bullet: true, breakLine: true } },
      { text: "v4 룰 엔진 (fallback)", options: { bullet: true, breakLine: true } },
      { text: "번식 AI (수정적기·정액추천)", options: { bullet: true, breakLine: true } },
      { text: "감별진단 엔진", options: { bullet: true, breakLine: true } },
      { text: "방역 인텔리전스", options: { bullet: true, breakLine: true } },
      { text: "알람 신뢰도 학습 루프", options: { bullet: true } },
    ],
    { x: rx + 0.26, y: 2.96, w: rw - 0.52, h: 2.24, margin: 0, valign: "top",
      fontFace: KR, fontSize: 11.5, color: BODY, lineSpacing: 17, paraSpaceAfter: 9 }
  );
  s.addText("AI가 단독 판단하지 않습니다.\nClaude 해석이 불가할 때는 룰 엔진이\n대체 분석을 수행합니다 — 24/7 무중단.", {
    x: rx + 0.26, y: 5.28, w: rw - 0.52, h: 0.86, margin: 0, valign: "top",
    fontFace: KR, fontSize: 10, color: MUTE, lineSpacing: 14 });

  band(s, 6.42, "센서는 보고, AI는 판단하고, 사람은 행동합니다 — 셋이 한 화면에서 끝납니다");

  s.addNotes(
    "카우톡은 센서 회사가 아닙니다. 센서는 이미 있는 것을 씁니다. " +
    "카우톡이 만드는 것은 그 위의 판단 계층입니다. 4층 중 가장 중요한 것은 4층 학습 루프입니다 — " +
    "쓸수록 정확해지는 구조라서, 데이터가 쌓일수록 전남의 자산이 됩니다."
  );
}

// ═══════════════════════════════════════════════════════════
// 7. 해결책 ② — 번식 AI 루프
// ═══════════════════════════════════════════════════════════
{
  const s = pres.addSlide();
  head(s, "03  해결책", "핵심 — 알람에서 끝나지 않고 ‘행동’까지 갑니다");

  s.addText("번식 AI 루프 — 한우 손실의 최대 항목인 공태일수를 직접 겨냥합니다", {
    x: M, y: 1.54, w: W - M * 2, h: 0.3, margin: 0,
    fontFace: KR, fontSize: 12.5, bold: true, color: MUTE });

  const steps = [
    { n: "1", t: "발정 감지", d: "위내센서가 야간·미약 발정까지 24시간 포착" },
    { n: "2", t: "적기 계산", d: "목장별 번식설정을 반영해 수정 적기 산출" },
    { n: "3", t: "정액 추천", d: "혈통·근교계수·씨수소 공공데이터 기반 추천" },
    { n: "4", t: "안전 점검", d: "질병 이력·휴약기간·수정 실패 횟수 사전 확인" },
    { n: "5", t: "실행·기록", d: "수정사 알림 → 실제 사용 정액까지 기록" },
    { n: "6", t: "학습", d: "임신감정 결과가 다시 AI 정확도로 환류" },
  ];
  const stw = (W - M * 2 - 0.5) / 6;
  steps.forEach((st, i) => {
    const x = M + (stw + 0.1) * i;
    card(s, { x, y: 1.92, w: stw, h: 1.62, fill: i === 5 ? "FFF6E8" : WHITE, line: i === 5 ? "E8C98C" : LINE });
    s.addShape(pres.ShapeType.roundRect, {
      x: x + (stw - 0.42) / 2, y: 2.06, w: 0.42, h: 0.42, rectRadius: 0.05,
      fill: { color: i === 5 ? AMBER : DEEP }, line: { color: i === 5 ? AMBER : DEEP, width: 1 },
    });
    s.addText(st.n, { x: x + (stw - 0.42) / 2, y: 2.06, w: 0.42, h: 0.42, margin: 0, align: "center", valign: "middle",
      fontFace: KR, fontSize: 12.5, bold: true, color: i === 5 ? INK : WHITE });
    s.addText(st.t, { x: x + 0.06, y: 2.54, w: stw - 0.12, h: 0.28, margin: 0, align: "center", valign: "middle",
      fontFace: KR, fontSize: 12, bold: true, color: INK });
    s.addText(st.d, { x: x + 0.09, y: 2.84, w: stw - 0.18, h: 0.64, margin: 0, align: "center", valign: "top",
      fontFace: KR, fontSize: 9, color: MUTE, lineSpacing: 12 });
  });

  s.addText("6번이 다시 1번으로 돌아갑니다 — 쓸수록 정확해지는 순환 구조입니다", {
    x: M, y: 3.6, w: W - M * 2, h: 0.28, margin: 0, align: "center",
    fontFace: KR, fontSize: 10.5, italic: true, color: AMBER });

  const cw = (W - M * 2 - 0.3) / 2;
  card(s, { x: M, y: 4.0, w: cw, h: 2.06, fill: WHITE });
  s.addText("같은 원리로 이미 작동하는 것들", {
    x: M + 0.28, y: 4.14, w: cw - 0.56, h: 0.3, margin: 0,
    fontFace: KR, fontSize: 13.5, bold: true, color: INK });
  s.addText(
    [
      { text: "감별진단 — 이상 개체의 질병 후보를 확률 순위로 제시하고 확인검사 순서까지 안내", options: { bullet: true, breakLine: true } },
      { text: "치료 결과 추적 — 치료 후 센서 변화를 비교해 회복·악화 자동 판정", options: { bullet: true, breakLine: true } },
      { text: "자동화 룰 — 알람이 뜨면 지정한 조치가 자동 실행(승인 게이트 경유)", options: { bullet: true, breakLine: true } },
      { text: "대화형 AI — 농가가 말로 묻고 답을 받습니다(앱 조작 불필요)", options: { bullet: true } },
    ],
    { x: M + 0.28, y: 4.5, w: cw - 0.56, h: 1.42, margin: 0, valign: "top",
      fontFace: KR, fontSize: 11, color: BODY, lineSpacing: 15, paraSpaceAfter: 6 }
  );

  card(s, { x: M + cw + 0.3, y: 4.0, w: cw, h: 2.06, fill: "F2F6F8" });
  s.addText("이것이 기존 센서 서비스와 다른 지점", {
    x: M + cw + 0.58, y: 4.14, w: cw - 0.56, h: 0.3, margin: 0,
    fontFace: KR, fontSize: 13.5, bold: true, color: TEAL });
  s.addText(
    [
      { text: "기존: “발정입니다” → 그 다음 판단은 농가 몫", options: { bullet: true, breakLine: true } },
      { text: "카우톡: “423번, 내일 06시 수정 적기. 추천 정액 KPN○○○○. 최근 유방염 치료 이력 있음 — 휴약 종료 확인 필요”", options: { bullet: true, breakLine: true } },
      { text: "판단 근거와 정확도, 한계를 함께 보여주므로 농가가 납득하고 실행할 수 있습니다", options: { bullet: true } },
    ],
    { x: M + cw + 0.58, y: 4.5, w: cw - 0.56, h: 1.42, margin: 0, valign: "top",
      fontFace: KR, fontSize: 11, color: BODY, lineSpacing: 15, paraSpaceAfter: 6 }
  );

  band(s, 6.28, "알람이 아니라 ‘결정’을 드립니다 — 무엇을, 언제, 어떤 순서로");

  s.addNotes(
    "이 장이 카우톡의 정체성입니다. 센서 알람은 이미 세상에 많습니다. " +
    "카우톡이 메우는 것은 알람과 행동 사이입니다. 특히 번식은 한우 손실의 최대 항목이라 " +
    "공태일수 하루를 줄이는 것이 곧 사료비이자 사육일수입니다."
  );
}

// ═══════════════════════════════════════════════════════════
// 8. 해결책 ③ — 네 개의 눈 + 신뢰 설계
// ═══════════════════════════════════════════════════════════
{
  const s = pres.addSlide();
  head(s, "03  해결책", "같은 데이터, 네 개의 눈 — 농가에서 도정까지 한 체계로");

  const rw = (W - M * 2 - 0.54) / 4;
  const roles = [
    { t: "농가", c: DEEP, i: ["오늘의 작업목록", "위험 개체 우선순위", "발정·분만 알림", "치료·투약 기록", "두당 경제효과"] },
    { t: "수의사", c: DEEP, i: ["이상 개체 사전 선별", "방문 전 데이터 확인", "감별진단 근거 제시", "치료 전후 생체 비교", "항생제 사용 관리"] },
    { t: "방역관", c: DEEP, i: ["시군별 이상징후", "농장 간 이동 추적", "확산 위험 시뮬레이션", "방역조치 이력관리", "전국 현황 드릴다운"] },
    { t: "행정", c: DEEP, i: ["생산량·수급 전망", "재난 취약농가 지도", "정책사업 효과분석", "보조사업 성과측정", "축산행정 디지털화"] },
  ];
  roles.forEach((r, i) => {
    const x = M + (rw + 0.18) * i;
    card(s, { x, y: 1.6, w: rw, h: 2.34, fill: WHITE });
    s.addShape(pres.ShapeType.roundRect, {
      x: x + 0.16, y: 1.74, w: rw - 0.32, h: 0.38, rectRadius: 0.05,
      fill: { color: r.c }, line: { color: r.c, width: 1 },
    });
    s.addText(r.t, { x: x + 0.16, y: 1.74, w: rw - 0.32, h: 0.38, margin: 0, align: "center", valign: "middle",
      fontFace: KR, fontSize: 13, bold: true, color: WHITE });
    s.addText(
      r.i.map((t, j) => ({ text: t, options: { bullet: true, breakLine: j < r.i.length - 1 } })),
      { x: x + 0.2, y: 2.22, w: rw - 0.4, h: 1.56, margin: 0, valign: "top",
        fontFace: KR, fontSize: 10.5, color: BODY, lineSpacing: 15, paraSpaceAfter: 4 }
    );
  });

  s.addText("농가가 남긴 조치 기록이 수의사의 진단 근거가 되고, 그것이 방역 판단과 도정 통계가 됩니다 — 데이터가 한 번만 입력되고 네 곳에서 쓰입니다", {
    x: M, y: 4.04, w: W - M * 2, h: 0.3, margin: 0, align: "center",
    fontFace: KR, fontSize: 11, color: MUTE });

  s.addText("신뢰 설계 — 이 세 가지가 없으면 아무도 쓰지 않습니다", {
    x: M, y: 4.46, w: W - M * 2, h: 0.3, margin: 0,
    fontFace: KR, fontSize: 12.5, bold: true, color: AMBER, charSpacing: 1 });

  const tw = (W - M * 2 - 0.36) / 3;
  const trust = [
    { t: "데이터 소유권은 농가에", d: "행정에는 농가 동의 아래 익명화된 위험등급과 정책지표만 제공합니다. 원시데이터·연구·상업 활용 권한을 분리합니다." },
    { t: "수의사 승인 게이트", d: "AI는 진단하지 않습니다. 볼 것을 골라줄 뿐이며 최종 진단과 처방은 수의사가 합니다. 판단근거·정확도·한계를 항상 함께 표시합니다." },
    { t: "개방형 연동", d: "특정 장비·업체 종속을 배제하고 표준 API로 연동합니다. 이미 설치된 장비도 그대로 붙고, 업체를 바꿔도 데이터는 남습니다." },
  ];
  trust.forEach((t, i) => {
    const x = M + (tw + 0.18) * i;
    card(s, { x, y: 4.82, w: tw, h: 1.42, fill: "F2F6F8" });
    s.addText(t.t, { x: x + 0.24, y: 4.94, w: tw - 0.48, h: 0.3, margin: 0,
      fontFace: KR, fontSize: 12.5, bold: true, color: INK });
    s.addText(t.d, { x: x + 0.24, y: 5.26, w: tw - 0.48, h: 0.88, margin: 0, valign: "top",
      fontFace: KR, fontSize: 10.5, color: BODY, lineSpacing: 14 });
  });

  band(s, 6.42, "농가가 쓰면 도정 통계가 되고, 도정이 쓰면 농가에 돌아갑니다");

  s.addNotes(
    "네 역할이 같은 데이터를 각자 관점으로 봅니다. 중요한 건 아래 신뢰 설계입니다. " +
    "농가가 '내 데이터가 감시에 쓰인다'고 느끼는 순간 이 사업은 실패합니다. " +
    "그래서 소유권은 농가, 판단 책임은 수의사, 연동은 개방형 — 이 셋을 원칙으로 못 박았습니다."
  );
}

// ═══════════════════════════════════════════════════════════
// 9. 구축 방안
// ═══════════════════════════════════════════════════════════
{
  const s = pres.addSlide();
  head(s, "04  구축 방안", "맨바닥에서 시작하지 않습니다 — 3단계 확산");

  const sw = (W - M * 2 - 0.54) / 4;
  const nums = [
    { n: "201", l: "연동 농가" },
    { n: "11,170", l: "관리 두수" },
    { n: "11,127", l: "가동 센서" },
    { n: "757,062", l: "누적 AI 판단 이벤트" },
  ];
  nums.forEach((v, i) => {
    stat(s, { x: M + (sw + 0.18) * i, y: 1.58, w: sw, h: 1.2, num: v.n, numSize: 27, color: TEAL, label: v.l });
  });
  s.addText("2026년 7월 운영 대시보드 실측치 · AI 엔진 6종 24/7 가동 · 2013년 국내 최초 반추위 센서 도입 이후 13년간 축적", {
    x: M, y: 2.84, w: W - M * 2, h: 0.26, margin: 0, align: "right",
    fontFace: KR, fontSize: 9.5, color: "93A3AE" });

  const pw = (W - M * 2 - 0.36) / 3;
  const phases = [
    { p: "1단계", y: "1년차", t: "실증 기반 구축", i: [
      "시군 3~5개 · 농가 30~50호 선정",
      "실증 전 1년 기초선 데이터 확보",
      "번식·질병·열스트레스 중점 실증",
      "비참여 농가와 대조 측정",
    ] },
    { p: "2단계", y: "2~3년차", t: "시군 확산", i: [
      "전남 전 시군으로 확대",
      "시군 축산 관제 화면 운영",
      "수의사·축협·생산자단체 연계",
      "설치·AS 인력 지역 육성",
    ] },
    { p: "3단계", y: "4~5년차", t: "전남 표준 · 국가 확산", i: [
      "전남형 한우 데이터 표준 확정",
      "저탄소·동물복지 인증 연계",
      "타 시도 공급 · 국가 모델 제안",
      "K-축산 플랫폼 수출 기반",
    ] },
  ];
  phases.forEach((ph, i) => {
    const x = M + (pw + 0.18) * i;
    card(s, { x, y: 3.2, w: pw, h: 2.5, fill: i === 0 ? "FFF6E8" : WHITE, line: i === 0 ? "E8C98C" : LINE });
    s.addText(ph.p + "   " + ph.y, {
      x: x + 0.26, y: 3.34, w: pw - 0.52, h: 0.26, margin: 0,
      fontFace: KR, fontSize: 10.5, bold: true, color: i === 0 ? AMBER : MUTE });
    s.addText(ph.t, {
      x: x + 0.26, y: 3.62, w: pw - 0.52, h: 0.34, margin: 0,
      fontFace: KR, fontSize: 15, bold: true, color: INK });
    s.addText(
      ph.i.map((t, j) => ({ text: t, options: { bullet: true, breakLine: j < ph.i.length - 1 } })),
      { x: x + 0.26, y: 4.04, w: pw - 0.52, h: 1.52, margin: 0, valign: "top",
        fontFace: KR, fontSize: 11, color: BODY, lineSpacing: 15, paraSpaceAfter: 6 }
    );
  });

  card(s, { x: M, y: 5.94, w: W - M * 2, h: 0.6, fill: "F2F6F8", flat: true });
  s.addText(
    "측정 원칙 — ① 사업 전 기초선을 먼저 확보   ② 참여·비참여 농가를 함께 측정   ③ 실패 항목까지 포함해 공개",
    { x: M + 0.28, y: 5.94, w: W - M * 2 - 0.56, h: 0.6, margin: 0, valign: "middle",
      fontFace: KR, fontSize: 11.5, color: BODY }
  );

  band(s, 6.76, "1단계가 2·3단계의 판단 근거를 만듭니다 — 검증되지 않은 확산은 하지 않습니다");

  s.addNotes(
    "이 사업의 신뢰는 여기서 나옵니다. 첫째, 이미 201개 농가에서 돌아가고 있어 개발 위험이 낮습니다. " +
    "둘째, 기초선을 먼저 잡고 대조군과 비교합니다. 효과가 안 나오면 2단계로 안 갑니다 — " +
    "그렇게 설계하는 것이 정상입니다."
  );
}

// ═══════════════════════════════════════════════════════════
// 10. 기대효과
// ═══════════════════════════════════════════════════════════
{
  const s = pres.addSlide();
  s.background = { color: INK };

  s.addText("05  기대효과", {
    x: M, y: 0.42, w: 5, h: 0.3, margin: 0,
    fontFace: KR, fontSize: 11, bold: true, color: AMBER, charSpacing: 1.2 });
  s.addText("전남이 얻게 될 네 가지", {
    x: M, y: 0.76, w: W - M * 2, h: 0.62, margin: 0, valign: "top",
    fontFace: KR, fontSize: 27, bold: true, color: WHITE });

  const ew = (W - M * 2 - 0.54) / 4;
  const effects = [
    { t: "농가 경제성", i: ["공태일수 단축 → 분만간격 축소", "질병 조기발견 → 폐사·치료비 감소", "수정 횟수 감소 → 직접비 절감", "야간 관찰 노동의 대체", "두당 수익 개선"] },
    { t: "가축질병 대응", i: ["개체 단위 이상징후 조기경보", "농장 간 이동 기반 접촉 추적", "시군·도 단위 확산 예측", "방역자원 배치 우선순위", "방역비용·피해 축소"] },
    { t: "환경·지속가능성", i: ["사육기간 단축 → 두당 배출 감소", "사료효율 개선 → 자원 절감", "분뇨·악취 이력관리", "저탄소 인증 데이터 확보", "경축순환 모델 연계"] },
    { t: "축산 데이터 주권", i: ["한우 데이터는 한국에서만 생성", "전남 한우 데이터셋 구축", "정책이 근거 위에서 결정", "축산 AI 인력·기업 유치", "국가 표준·수출 기반"] },
  ];
  effects.forEach((e, i) => {
    const x = M + (ew + 0.18) * i;
    s.addShape(pres.ShapeType.roundRect, {
      x, y: 1.6, w: ew, h: 2.72, rectRadius: 0.06,
      fill: { color: "16354D" }, line: { color: "27506E", width: 1 },
    });
    s.addShape(pres.ShapeType.roundRect, {
      x: x + 0.16, y: 1.76, w: ew - 0.32, h: 0.4, rectRadius: 0.05,
      fill: { color: AMBER }, line: { color: AMBER, width: 1 },
    });
    s.addText(e.t, { x: x + 0.16, y: 1.76, w: ew - 0.32, h: 0.4, margin: 0, align: "center", valign: "middle",
      fontFace: KR, fontSize: 13, bold: true, color: INK });
    s.addText(
      e.i.map((t, j) => ({ text: t, options: { bullet: true, breakLine: j < e.i.length - 1 } })),
      { x: x + 0.22, y: 2.26, w: ew - 0.44, h: 1.94, margin: 0, valign: "top",
        fontFace: KR, fontSize: 10.5, color: "D9E4EC", lineSpacing: 15, paraSpaceAfter: 5 }
    );
  });

  s.addText("※ 위 항목은 실증에서 두당 금액으로 환산해 확정할 지표입니다. 검증 전 수치를 단정하지 않는 것이 이 사업의 원칙입니다.", {
    x: M, y: 4.42, w: W - M * 2, h: 0.28, margin: 0, align: "center",
    fontFace: KR, fontSize: 10, italic: true, color: "7E96A6" });

  s.addShape(pres.ShapeType.roundRect, {
    x: M, y: 4.86, w: W - M * 2, h: 1.36, rectRadius: 0.06,
    fill: { color: "16354D" }, line: { color: AMBER, width: 1.25 },
  });
  s.addText("지속가능한 한우 산업이란", {
    x: M + 0.34, y: 4.98, w: W - M * 2 - 0.68, h: 0.3, margin: 0,
    fontFace: KR, fontSize: 13, bold: true, color: AMBER });
  s.addText(
    "고령 농가가 밤을 새우지 않아도 소를 놓치지 않고, 수의사가 도착하기 전에 무엇을 볼지 알고,\n" +
    "행정이 추측이 아니라 데이터로 판단하는 축산입니다. 그 기반은 개체 데이터 한 줄에서 시작합니다.",
    { x: M + 0.34, y: 5.32, w: W - M * 2 - 0.68, h: 0.78, margin: 0, valign: "top",
      fontFace: KR, fontSize: 12.5, color: WHITE, lineSpacing: 19 }
  );

  s.addText("올해 놓친 개체 데이터는 내년에 만들 수 없습니다 — 시작하는 시점이 곧 격차입니다", {
    x: M, y: 6.4, w: W - M * 2, h: 0.4, margin: 0, align: "center", valign: "middle",
    fontFace: KR, fontSize: 14, bold: true, color: AMBER });
  s.addText("감사합니다.  질의응답", {
    x: M, y: 6.86, w: W - M * 2, h: 0.3, margin: 0, align: "center", valign: "middle",
    fontFace: KR, fontSize: 11, color: "7E96A6" });

  s.addNotes(
    "마무리. 네 가지 효과 중 어느 하나만으로도 명분은 되지만, 이 넷이 같은 데이터에서 동시에 나온다는 것이 핵심입니다. " +
    "다만 금액은 실증 전에 단정하지 않겠습니다. 그것이 이 사업의 산출물입니다."
  );
}

pres.writeFile({ fileName: "전남_한우_미래청사진_카우톡_10p.pptx" }).then((f) => console.log("wrote", f));
