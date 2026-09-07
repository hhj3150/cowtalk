// TTS 언어 계층 — 답변 언어 판정 + 언어별 자연 발화 전처리 + 공급자별 음성 매핑
//
// 배경: 기존 전처리는 언어와 무관하게 한국어 발음(도·킬로그램·인공 수정)을 주입했다.
// 우즈벡어 답변에 한국어 단어가 섞여 현지인이 알아들을 수 없었다.
// 원칙: 단위·약어 풀이는 반드시 답변 언어의 어휘로. 모르는 언어는 건드리지 않는다.
//
// 순수 함수만 둔다 (테스트 용이). 네트워크 호출은 tts.service / azure-tts.service 담당.

export type TtsLang = 'ko' | 'en' | 'uz' | 'ru' | 'mn';

export const TTS_LANGS: ReadonlyArray<TtsLang> = ['ko', 'en', 'uz', 'ru', 'mn'];

export function isTtsLang(value: unknown): value is TtsLang {
  return typeof value === 'string' && (TTS_LANGS as readonly string[]).includes(value);
}

// BCP-47 태그 (Azure SSML xml:lang, 브라우저 SpeechSynthesis)
export const TTS_LANG_TAG: Readonly<Record<TtsLang, string>> = {
  ko: 'ko-KR',
  en: 'en-US',
  uz: 'uz-UZ',
  ru: 'ru-RU',
  mn: 'mn-MN',
};

// ── 언어 판정 ──
// 힌트(uiLang)가 있어도 본문 문자 체계가 명백히 다르면 본문을 따른다.
// 예: 우즈벡 UI에서 "answer in English"라고 요청한 답변은 영어로 읽어야 한다.
const UZBEK_SIGNAL = /(\bo[ʻ'’]|\bg[ʻ'’]|\bsigir|\bqoramol|\bveterinar|\bferma|\bso[ʻ'’]g[ʻ'’]|\bbo[ʻ'’]g[ʻ'’]|\bbuzoq|\bsun[ʻ'’]iy|\bkasallik|\bharorat|\bsalomatlik|\bmumkin|\buchun|\bkerak|\bva\b|\bbilan\b)/i;

export function detectTtsLang(text: string, hint?: string): TtsLang {
  const hintLang: TtsLang | undefined = isTtsLang(hint) ? hint : undefined;

  const hangul = (text.match(/[가-힣]/g) ?? []).length;
  const cyrillic = (text.match(/[а-яА-ЯЁёӨөҮү]/g) ?? []).length;
  const latin = (text.match(/[a-zA-Z]/g) ?? []).length;
  const total = hangul + cyrillic + latin;
  if (total === 0) return hintLang ?? 'ko';

  if (hangul / total > 0.3) return 'ko';

  if (cyrillic / total > 0.3) {
    // 몽골어 특유 모음 Өө/Үү — 러시아어와 구분 핵심
    if (/[ӨөҮү]/.test(text)) return 'mn';
    if (hintLang === 'mn') return 'mn';
    // 우즈벡 키릴 특유 문자 (ў қ ғ ҳ) — 우즈벡 UI면 우즈벡으로
    if (hintLang === 'uz' && /[ўқғҳЎҚҒҲ]/.test(text)) return 'uz';
    return 'ru';
  }

  // 라틴 문자 우세
  if (hintLang === 'uz') return 'uz';
  if (UZBEK_SIGNAL.test(text)) return 'uz';
  if (hintLang === 'en') return 'en';
  return 'en';
}

// ── 언어별 약어·단위 사전 ──
// 우즈벡어 축산 용어는 system-prompt.ts의 "우즈벡어 축산 용어 기준"과 일치시킨다.
// (수정=sun'iy urug'lantirish, 체온=tana harorati, 사료=yem/ozuqa, 반추위=katta oshqozon)

interface LangLexicon {
  readonly degree: string;              // °C
  readonly kg: string;
  readonly g: string;
  readonly liter: string;
  readonly ml: string;
  readonly mg: string;
  readonly cm: string;
  readonly km: string;
  readonly perDay: (amount: string, unit: string) => string; // "10 kg/일"
  readonly abbrev: ReadonlyArray<[RegExp, string]>;
}

const KO: LangLexicon = {
  degree: '도',
  kg: '킬로그램',
  g: '그램',
  liter: '리터',
  ml: '밀리리터',
  mg: '밀리그램',
  cm: '센티미터',
  km: '킬로미터',
  perDay: (amount, unit) => `하루 ${amount}${unit}`,
  abbrev: [
    [/\bTMR\b/g, '티엠알'],
    [/\bDIM\b/g, '착유 일수'],
    [/\bBCS\b/g, '체형 점수'],
    [/\bSCC\b/g, '체세포수'],
    [/\bMUN\b/g, '유중 요소태 질소'],
    [/\bDHI\b/g, '디에이치아이'],
    [/\bTHI\b/g, '티에이치아이'],
    [/\bSARA\b/g, '아급성 반추위 산증'],
    [/\bBHB\b/g, '비에이치비'],
    [/\bNEB\b/g, '에너지 음성 균형'],
    [/\bHPAI\b/g, '고병원성 조류 인플루엔자'],
    [/\bCMT\b/g, '씨엠티'],
    [/\bIM\b/g, '근육 주사'],
    [/\bIV\b/g, '정맥 주사'],
    [/\bAI\b/g, '인공 수정'],
    [/\bPCR\b/g, '피시알'],
    [/\bKAHIS\b/g, '카이스'],
    [/\bWOAH\b/g, '세계 동물 보건 기구'],
    [/\bR0\b/g, '기초 감염 재생산 지수'],
    [/\bNDF\b/g, '엔디에프'],
    [/\bDCAD\b/g, '디캐드'],
    [/\bFCR\b/g, '사료 효율'],
  ],
};

const EN: LangLexicon = {
  degree: ' degrees',
  kg: ' kilograms',
  g: ' grams',
  liter: ' liters',
  ml: ' milliliters',
  mg: ' milligrams',
  cm: ' centimeters',
  km: ' kilometers',
  perDay: (amount, unit) => `${amount}${unit} per day`,
  abbrev: [
    [/\bTMR\b/g, 'total mixed ration'],
    [/\bDIM\b/g, 'days in milk'],
    [/\bBCS\b/g, 'body condition score'],
    [/\bSCC\b/g, 'somatic cell count'],
    [/\bMUN\b/g, 'milk urea nitrogen'],
    [/\bTHI\b/g, 'temperature humidity index'],
    [/\bSARA\b/g, 'subacute ruminal acidosis'],
    [/\bNEB\b/g, 'negative energy balance'],
    [/\bHPAI\b/g, 'highly pathogenic avian influenza'],
    [/\bCMT\b/g, 'C M T'],
    [/\bIM\b/g, 'intramuscular'],
    [/\bIV\b/g, 'intravenous'],
    [/\bAI\b/g, 'artificial insemination'],
    [/\bWOAH\b/g, 'World Organisation for Animal Health'],
    [/\bR0\b/g, 'basic reproduction number'],
    [/\bFCR\b/g, 'feed conversion ratio'],
  ],
};

// 우즈벡어 (라틴). 약어는 우즈벡 수의 현장 어휘로 풀어 읽는다 — 라틴 약어를 그대로 두면
// 음성 엔진이 영어식으로 철자 낭독해 현지인이 알아듣지 못한다.
const UZ: LangLexicon = {
  degree: ' daraja',
  kg: ' kilogramm',
  g: ' gramm',
  liter: ' litr',
  ml: ' millilitr',
  mg: ' milligramm',
  cm: ' santimetr',
  km: ' kilometr',
  perDay: (amount, unit) => `kuniga ${amount}${unit}`,
  abbrev: [
    [/\bTMR\b/g, "to'liq aralash ratsion"],
    [/\bDIM\b/g, "sog'im kunlari"],
    [/\bBCS\b/g, 'tana holati bali'],
    [/\bSCC\b/g, 'somatik hujayralar soni'],
    [/\bMUN\b/g, 'sutdagi mochevina azoti'],
    [/\bTHI\b/g, 'issiqlik-namlik indeksi'],
    [/\bSARA\b/g, 'katta oshqozonning subklinik atsidozi'],
    [/\bNEB\b/g, 'manfiy energiya balansi'],
    [/\bHPAI\b/g, 'yuqori patogenli parranda grippi'],
    [/\bCMT\b/g, 'CMT testi'],
    [/\bIM\b/g, 'mushak ichiga'],
    [/\bIV\b/g, 'vena ichiga'],
    [/\bAI\b/g, "sun'iy urug'lantirish"],
    [/\bWOAH\b/g, 'Jahon hayvonlar salomatligi tashkiloti'],
    [/\bR0\b/g, 'asosiy ko\'payish soni'],
    [/\bFCR\b/g, 'yem konversiyasi koeffitsienti'],
  ],
};

const RU: LangLexicon = {
  degree: ' градусов',
  kg: ' килограмм',
  g: ' грамм',
  liter: ' литров',
  ml: ' миллилитров',
  mg: ' миллиграмм',
  cm: ' сантиметров',
  km: ' километров',
  perDay: (amount, unit) => `${amount}${unit} в сутки`,
  abbrev: [
    [/\bTMR\b/g, 'полносмешанный рацион'],
    [/\bDIM\b/g, 'дней лактации'],
    [/\bBCS\b/g, 'оценка упитанности'],
    [/\bSCC\b/g, 'количество соматических клеток'],
    [/\bMUN\b/g, 'мочевина в молоке'],
    [/\bTHI\b/g, 'индекс температуры и влажности'],
    [/\bSARA\b/g, 'субклинический ацидоз рубца'],
    [/\bNEB\b/g, 'отрицательный энергетический баланс'],
    [/\bHPAI\b/g, 'высокопатогенный грипп птиц'],
    [/\bCMT\b/g, 'тест CMT'],
    [/\bIM\b/g, 'внутримышечно'],
    [/\bIV\b/g, 'внутривенно'],
    [/\bAI\b/g, 'искусственное осеменение'],
    [/\bWOAH\b/g, 'Всемирная организация здравоохранения животных'],
    [/\bR0\b/g, 'базовое репродуктивное число'],
    [/\bFCR\b/g, 'конверсия корма'],
  ],
};

const MN: LangLexicon = {
  degree: ' хэм',
  kg: ' килограмм',
  g: ' грамм',
  liter: ' литр',
  ml: ' миллилитр',
  mg: ' миллиграмм',
  cm: ' сантиметр',
  km: ' километр',
  perDay: (amount, unit) => `өдөрт ${amount}${unit}`,
  abbrev: [
    [/\bTMR\b/g, 'бүрэн холимог тэжээл'],
    [/\bDIM\b/g, 'саалийн хоног'],
    [/\bBCS\b/g, 'биеийн тарга тэвээргийн оноо'],
    [/\bSCC\b/g, 'соматик эсийн тоо'],
    [/\bTHI\b/g, 'халуун чийгийн индекс'],
    [/\bSARA\b/g, 'гүзээний субклиник ацидоз'],
    [/\bNEB\b/g, 'сөрөг энергийн баланс'],
    [/\bHPAI\b/g, 'шувууны хүчтэй хоруу чанартай томуу'],
    [/\bCMT\b/g, 'CMT тест'],
    [/\bIM\b/g, 'булчинд'],
    [/\bIV\b/g, 'судсаар'],
    [/\bAI\b/g, 'зохиомол хээлтүүлэг'],
    [/\bWOAH\b/g, 'Дэлхийн мал амьтны эрүүл мэндийн байгууллага'],
    [/\bR0\b/g, 'үндсэн нөхөн үржихүйн тоо'],
    [/\bFCR\b/g, 'тэжээлийн хувиралт'],
  ],
};

const LEXICON: Readonly<Record<TtsLang, LangLexicon>> = { ko: KO, en: EN, uz: UZ, ru: RU, mn: MN };

// ── 전처리 ──

function naturalizeUnitsAndSymbols(text: string, lex: LangLexicon, lang: TtsLang): string {
  let out = text
    // 온도: 38.5°C, 38.5℃ → "38.5도" / "38.5 daraja"
    .replace(/(\d+(?:\.\d+)?)\s*[°℃]C?/g, `$1${lex.degree}`);

  // "단위/일" — 한국어 "일" 표기와 영문 "/d", "/day"
  out = out
    // (\b 는 ASCII 경계라 한글·키릴 뒤에서 동작하지 않는다 → 라틴 문자 비후속 lookahead)
    .replace(/(\d+(?:\.\d+)?)\s*kg\s*\/\s*(?:일|d|day|kun|сут|өдөр)(?![A-Za-z])/gi, (_m, n: string) => lex.perDay(n, lex.kg))
    .replace(/(\d+(?:\.\d+)?)\s*L\s*\/\s*(?:일|d|day|kun|сут|өдөр)(?![A-Za-z])/g, (_m, n: string) => lex.perDay(n, lex.liter));
  if (lang === 'ko') {
    out = out
      .replace(/(\d+)\s*분\s*\/\s*일/g, '하루 $1분')
      .replace(/(\d+)\s*회\s*\/\s*일/g, '하루 $1회');
  }

  out = out
    // 일반 슬래시 — "A / B / C" 같은 단순 구분은 쉼표
    .replace(/\s+\/\s+/g, ', ')
    // 화살표 → 자연 호흡(쉼표)
    .replace(/\s*→\s*/g, ', ')
    .replace(/\s*=>\s*/g, ', ')
    // 대시·하이픈을 자연 호흡으로
    .replace(/—/g, ', ')
    .replace(/\s--\s/g, ', ')
    // 괄호 안 짧은 부연은 쉼표로 (2~25자, 한글·라틴·키릴·숫자)
    .replace(/\s*\(([가-힣A-Za-z0-9а-яА-ЯЁёӨөҮүʻ'’\s.,]{2,25})\)/g, ', $1')
    // 단순 단위 (mL 은 mg/mL 보다 먼저 — 긴 토큰 우선)
    .replace(/(\d+(?:\.\d+)?)\s*mL\b/g, `$1${lex.ml}`)
    .replace(/(\d+(?:\.\d+)?)\s*ml\b/g, `$1${lex.ml}`)
    .replace(/(\d+(?:\.\d+)?)\s*mg\b/g, `$1${lex.mg}`)
    .replace(/(\d+(?:\.\d+)?)\s*kg\b/g, `$1${lex.kg}`)
    .replace(/(\d+(?:\.\d+)?)\s*L\b/g, `$1${lex.liter}`)
    .replace(/(\d+(?:\.\d+)?)\s*cm\b/g, `$1${lex.cm}`)
    .replace(/(\d+(?:\.\d+)?)\s*km\b/g, `$1${lex.km}`);

  return out;
}

function expandAbbreviations(text: string, lex: LangLexicon): string {
  let out = text;
  for (const [re, replacement] of lex.abbrev) {
    out = out.replace(re, replacement);
  }
  return out;
}

// 줄바꿈을 자연스러운 호흡으로
function naturalizeBreaks(text: string): string {
  return text
    .replace(/\n{2,}/g, '. ')   // 빈 줄 = 문장 종료
    .replace(/\n/g, ', ')        // 단일 줄바꿈 = 짧은 호흡
    .replace(/[ \t]+\./g, '.')   // 이모지 제거 뒤 남은 "단어 ." 정리
    .replace(/,\s*\./g, '.')     // ", ." 정리
    .replace(/\.\s*\./g, '.')    // ".." 정리
    .replace(/,\s*,/g, ',')      // ",," 정리
    .replace(/\s+/g, ' ')        // 다중 공백 정리
    .trim();
}

function stripMarkdown(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, '') // 코드 블록 제거
    .replace(/`([^`]+)`/g, '$1')     // 인라인 코드
    .replace(/\*\*([^*]+)\*\*/g, '$1') // bold
    .replace(/\*([^*]+)\*/g, '$1')     // italic
    .replace(/^#{1,6}\s+/gm, '')        // 헤더 #
    .replace(/^[-*]\s+/gm, '')          // 리스트 - *
    .replace(/^\d+\.\s+/gm, '')         // 번호 리스트
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // 링크
    // 이모지·픽토그램 광범위 제거 (TTS에서 부자연)
    .replace(/[\u{1F300}-\u{1FAFF}]|[\u{2600}-\u{27BF}]|[\u{2300}-\u{23FF}]|[\u{1F000}-\u{1F2FF}]/gu, '')
    .replace(/✓|×|✔|✗/g, '');
}

// 우즈벡 라틴 표기 정규화 — 답변에 섞이는 ʻ(U+02BB)·’(U+2019)·`(백틱) 을
// 음성 엔진이 가장 안정적으로 읽는 ASCII 아포스트로피로 통일한다.
// (o' g' 는 별개 자모 — 기호가 섞이면 엔진마다 다르게 끊어 읽는다)
function normalizeUzbekApostrophes(text: string): string {
  return text.replace(/([oOgG])[ʻʼ’‘`´]/g, "$1'");
}

/** 답변 텍스트 → 해당 언어 자연 발화용 텍스트 */
export function naturalizeForTts(text: string, lang: TtsLang): string {
  const lex = LEXICON[lang];
  let out = stripMarkdown(text);
  if (lang === 'uz') out = normalizeUzbekApostrophes(out);
  out = naturalizeUnitsAndSymbols(out, lex, lang);
  out = expandAbbreviations(out, lex);
  out = naturalizeBreaks(out);
  return out;
}

// ── 공급자별 음성 매핑 ──

// OpenAI gpt-4o-mini-tts 발화 지시 — 이 세대만 instructions 파라미터를 받는다.
// 우즈벡어: 러시아어·영어 억양으로 읽히는 것이 현지인 불이해의 핵심 원인이었다.
export const OPENAI_TTS_INSTRUCTIONS: Readonly<Record<TtsLang, string>> = {
  ko: '한국어 원어민처럼 차분하고 또렷하게, 친구에게 설명하듯 말하세요. 숫자는 한국어로 읽습니다.',
  en: 'Speak as a calm, clear native English speaker explaining to a farmer. Read numbers naturally.',
  uz: "Speak fluent, natural Uzbek (O'zbek tili, Latin script) exactly as a native speaker from Tashkent would. "
    + "Use Uzbek phonology: o' is a rounded /o/, g' is a voiced uvular /ʁ/, x is /x/, q is uvular /q/, "
    + "sh is /ʃ/, ch is /tʃ/, j is /dʒ/. Never use a Russian, Turkish or English accent. "
    + 'Read numbers in Uzbek. Calm, warm, clear tone suitable for a farmer or veterinarian.',
  ru: 'Говорите как носитель русского языка: спокойно, чётко, естественно. Числа читайте по-русски.',
  mn: 'Speak fluent, natural Mongolian (Монгол хэл, Cyrillic) as a native speaker from Ulaanbaatar. '
    + 'Use Mongolian vowel harmony and pronunciation, never a Russian accent. Read numbers in Mongolian.',
};

// Azure AI Speech 네이티브 신경망 음성 — 우즈벡어·몽골어는 OpenAI 보다 현지 원어민 발음에 가깝다.
// 여성 음성 우선 (기존 Nova 톤 유지), 필요 시 환경변수로 교체.
export const AZURE_NEURAL_VOICES: Readonly<Record<TtsLang, { readonly female: string; readonly male: string }>> = {
  uz: { female: 'uz-UZ-MadinaNeural', male: 'uz-UZ-SardorNeural' },
  mn: { female: 'mn-MN-YesuiNeural', male: 'mn-MN-BataaNeural' },
  ru: { female: 'ru-RU-SvetlanaNeural', male: 'ru-RU-DmitryNeural' },
  ko: { female: 'ko-KR-SunHiNeural', male: 'ko-KR-InJoonNeural' },
  en: { female: 'en-US-JennyNeural', male: 'en-US-GuyNeural' },
};

/** "uz,mn" 형태의 환경변수를 TtsLang 집합으로 */
export function parseLangList(raw: string): ReadonlySet<TtsLang> {
  const out = new Set<TtsLang>();
  for (const token of raw.split(',')) {
    const v = token.trim().toLowerCase();
    if (isTtsLang(v)) out.add(v);
  }
  return out;
}
