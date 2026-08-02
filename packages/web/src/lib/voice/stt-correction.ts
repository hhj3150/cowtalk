// STT 후보정 — 음성 인식 결과를 축산 현장 언어로 교정한다.
//
// 왜 필요한가:
//   Web Speech API·Whisper 모두 일반 한국어 모델이라 축산 전문어를 자주 틀린다.
//   "발정" → "발전", "케토시스" → "게토시스", "사백이십삼번" → 문자 그대로.
//   목장주는 장갑 낀 손으로 재입력할 수 없다. 인식 직후 교정해야 대화가 끊기지 않는다.
//
// 안전 원칙 (오교정이 미교정보다 나쁘다):
//   1) 축산 맥락에서만 성립하는 패턴만 교정한다. "수정"처럼 일상어와 겹치는 단어는 건드리지 않는다.
//   2) 교정 대상은 뒤따르는 단어(검사/징후/왔어 등)나 조사로 맥락이 확인될 때만 적용한다.
//   3) 숫자 변환은 단위(번/두/산차/일 등)가 뒤따를 때만 — 일반 문장의 수사는 그대로 둔다.

// ── 1) 한국어 수사 → 아라비아 숫자 ──
// 개체번호가 곧 대화의 주어다. "사백이십삼번 소" 가 "423번"으로 바뀌어야
// query_animal 도구가 earTag로 개체를 찾는다.

const SINO_DIGIT: Readonly<Record<string, number>> = {
  영: 0, 공: 0, 일: 1, 이: 2, 삼: 3, 사: 4, 오: 5, 육: 6, 륙: 6, 칠: 7, 팔: 8, 구: 9,
};

const SINO_UNIT: Readonly<Record<string, number>> = { 십: 10, 백: 100, 천: 1000 };

/** 고유어 수사 — 관형형(한/두/세/네)과 기본형(하나/둘/…) 모두. 두수 세기에 쓰인다. */
const NATIVE_NUMBER: Readonly<Record<string, number>> = {
  한: 1, 하나: 1, 두: 2, 둘: 2, 세: 3, 셋: 3, 서: 3, 네: 4, 넷: 4, 너: 4,
  다섯: 5, 여섯: 6, 일곱: 7, 여덟: 8, 아홉: 9, 열: 10, 스물: 20, 서른: 30, 마흔: 40, 쉰: 50,
};

/** 숫자 뒤에 와야 변환을 허용하는 단위 — 이게 없으면 일반 문장의 수사를 망가뜨린다. */
const NUMERIC_UNITS = [
  '번', '번째', '두', '마리', '산차', '산', '일', '일째', '개월', '주',
  '도', '리터', '킬로', '킬로그램', '퍼센트', '회', '시', '분', '초', '건', '개', '명',
] as const;

/** 만 단위까지 지원하는 한자어 수사 파서. 파싱 불가 시 null. */
function parseSinoKorean(text: string): number | null {
  if (!text) return null;

  // "만"을 기준으로 상위/하위 분리 (이력제 12자리까지는 필요 없지만 두수·금액에 유용)
  const manIdx = text.indexOf('만');
  if (manIdx >= 0) {
    const head = text.slice(0, manIdx);
    const tail = text.slice(manIdx + 1);
    const headVal = head === '' ? 1 : parseSinoBelowMan(head);
    const tailVal = tail === '' ? 0 : parseSinoBelowMan(tail);
    if (headVal === null || tailVal === null) return null;
    return headVal * 10000 + tailVal;
  }
  return parseSinoBelowMan(text);
}

function parseSinoBelowMan(text: string): number | null {
  let total = 0;
  let current = 0;
  let sawAny = false;

  for (const ch of text) {
    const digit = SINO_DIGIT[ch];
    if (digit !== undefined) {
      // "공공삼" 같은 연속 나열은 자릿수 결합이 아니라 숫자 나열이므로 여기서 처리하지 않음
      current = current * 10 + digit;
      sawAny = true;
      continue;
    }
    const unit = SINO_UNIT[ch];
    if (unit !== undefined) {
      // "십" 단독 = 10, "이십" = 20
      total += (current === 0 ? 1 : current) * unit;
      current = 0;
      sawAny = true;
      continue;
    }
    return null; // 수사가 아닌 글자 — 파싱 실패
  }
  if (!sawAny) return null;
  return total + current;
}

/** "공사삼이" 처럼 자릿수 없이 나열된 숫자 (이력제 번호 읽기) → "0432" */
function parseDigitSequence(text: string): string | null {
  if (text.length < 2) return null;
  let out = '';
  for (const ch of text) {
    const d = SINO_DIGIT[ch];
    if (d === undefined) return null;
    out += String(d);
  }
  return out;
}

const SINO_CHARS = '영공일이삼사오육륙칠팔구십백천만';

/**
 * 단위가 뒤따르는 한국어 수사를 아라비아 숫자로 바꾼다.
 * "사백이십삼번 소" → "423번 소", "세 마리" → "3마리", "삼산차" → "3산차"
 */
export function normalizeKoreanNumerals(input: string): string {
  const unitAlt = NUMERIC_UNITS.slice().sort((a, b) => b.length - a.length).join('|');

  // (1) 한자어 수사 + 단위
  const sinoRe = new RegExp(`([${SINO_CHARS}]{1,8})\\s*(${unitAlt})(?![가-힣])`, 'g');
  let out = input.replace(sinoRe, (match, numeral: string, unit: string) => {
    // 자릿수 문자(십·백·천·만)가 없는 2글자 이상은 번호 나열로 본다: "공사삼이번" → "0432번"
    const hasUnitChar = /[십백천만]/.test(numeral);
    if (!hasUnitChar && numeral.length >= 2) {
      const seq = parseDigitSequence(numeral);
      return seq === null ? match : `${seq}${unit}`;
    }
    const value = parseSinoKorean(numeral);
    if (value === null) return match;
    return `${String(value)}${unit}`;
  });

  // (2) 고유어 수사 + 단위 ("두 마리", "세 번째")
  const nativeAlt = Object.keys(NATIVE_NUMBER).sort((a, b) => b.length - a.length).join('|');
  const nativeRe = new RegExp(`(?<![가-힣])(${nativeAlt})\\s*(${unitAlt})(?![가-힣])`, 'g');
  out = out.replace(nativeRe, (match, numeral: string, unit: string) => {
    const value = NATIVE_NUMBER[numeral];
    if (value === undefined) return match;
    // "일" 은 한자어(1)와 고유어 맥락이 겹치므로 (1)에서 이미 처리됨 — 중복 방지
    return `${String(value)}${unit}`;
  });

  return out;
}

// ── 2) 축산 전문어 오인식 사전 ──
// [잘못 들린 형태, 올바른 형태] — 정규식은 맥락 조건을 포함한다.

interface DomainRule {
  readonly pattern: RegExp;
  readonly replacement: string;
}

const DOMAIN_RULES: readonly DomainRule[] = [
  // 발정 — "발전"으로 가장 자주 틀림. 뒤에 축산 맥락 단어가 붙을 때만 교정.
  { pattern: /발전\s*(왔|났|징후|온|시작|탐지|알람|발견|재귀|주기|확인)/g, replacement: '발정 $1' },
  { pattern: /발전기\s*(소|개체|우)/g, replacement: '발정기 $1' },
  { pattern: /(밭|받)정/g, replacement: '발정' },

  // 케토시스 — 무성음 혼동
  { pattern: /(게|케이|캐)토\s*시스/g, replacement: '케토시스' },
  { pattern: /케토\s+시스/g, replacement: '케토시스' },

  // 유방염 / 유열 — 우/유 혼동
  { pattern: /(우방|유방)\s*념/g, replacement: '유방염' },
  { pattern: /우방염/g, replacement: '유방염' },
  { pattern: /우열\s*(증상|왔|의심|위험|예방)/g, replacement: '유열 $1' },

  // 자궁내막염
  { pattern: /자궁\s*내\s*막염/g, replacement: '자궁내막염' },

  // 후산정체
  { pattern: /후산\s*정체/g, replacement: '후산정체' },

  // 반추 — "반쭈", "만추"
  { pattern: /(반쭈|만추)(위|\s*시간|\s*저하|량)/g, replacement: '반추$2' },

  // 건유 — "거뉴", "건우"
  { pattern: /거뉴/g, replacement: '건유' },
  { pattern: /건우\s*(우|기|전환|시기|예정)/g, replacement: '건유 $1' },

  // 이력제
  { pattern: /이력\s*체(?![가-힣])/g, replacement: '이력제' },

  // 도태
  { pattern: /도테(?![가-힣])/g, replacement: '도태' },

  // 산차 — "삼차"로 틀리는 케이스. 숫자가 앞에 오면 산차가 맞다.
  { pattern: /(\d+)\s*삼차/g, replacement: '$1산차' },

  // 공태 — "공테", "곰태"
  { pattern: /(공테|곰태)(?![가-힣])/g, replacement: '공태' },
  { pattern: /장기\s*공태\s*우/g, replacement: '장기공태우' },

  // 수태율 — "수대율"
  { pattern: /수대율/g, replacement: '수태율' },

  // 임신감정 — 띄어쓰기 정규화
  { pattern: /임신\s+감정/g, replacement: '임신감정' },

  // 인공수정 / 수정사
  { pattern: /인공\s+수정/g, replacement: '인공수정' },
  { pattern: /수정\s+사(?![가-힣])/g, replacement: '수정사' },

  // 팅커벨 호명이 문장 안에 남아있을 때 정규화 (오인식 변형 흡수)
  { pattern: /(딩커|칭커|팅컬|띵커)\s*벨/g, replacement: '팅커벨' },

  // 체세포수 / 유량
  { pattern: /체\s*세포\s*수/g, replacement: '체세포수' },
  { pattern: /유량\s*저하/g, replacement: '유량 저하' },

  // 승가 (발정 행동)
  { pattern: /(승가|성가)\s*행동/g, replacement: '승가 행동' },

  // 파행 (다리 절음) — "파행"이 "파형"으로
  { pattern: /파형\s*(있|보이|심|증상|개체)/g, replacement: '파행 $1' },
];

/** 축산 도메인 오인식 교정 */
export function correctLivestockTerms(input: string): string {
  let out = input;
  for (const rule of DOMAIN_RULES) {
    out = out.replace(rule.pattern, rule.replacement);
  }
  // 규칙이 만든 이중 공백 정리
  return out.replace(/\s{2,}/g, ' ').trim();
}

// ── 3) 통합 파이프라인 ──

export interface SttCorrectionResult {
  readonly text: string;
  /** 원문에서 실제로 바뀌었는지 — UI에 "교정됨" 힌트를 띄우거나 로깅에 쓴다. */
  readonly changed: boolean;
}

/**
 * STT 원문 → 축산 현장 언어로 교정한다.
 * 한국어가 아닌 입력(영어·러시아어 등)은 도메인 규칙이 한글 기반이라 사실상 통과된다.
 */
export function correctSttTranscript(raw: string, lang = 'ko'): SttCorrectionResult {
  const input = raw.trim();
  if (!input) return { text: input, changed: false };

  // 한국어가 아니면 숫자·용어 규칙이 모두 한글 전제라 그대로 반환
  if (!lang.toLowerCase().startsWith('ko')) {
    return { text: input, changed: false };
  }

  const numeralized = normalizeKoreanNumerals(input);
  const corrected = correctLivestockTerms(numeralized);

  return { text: corrected, changed: corrected !== input };
}

/** Whisper API에 넘길 도메인 힌트 — 인식 전 단계에서 정확도를 올린다. */
export const WHISPER_DOMAIN_PROMPT =
  '한우 젖소 목장 대화입니다. 발정, 수정, 임신감정, 분만, 건유, 유방염, 케토시스, 유열, ' +
  '자궁내막염, 후산정체, 반추, 산차, 공태일, 수태율, 체세포수, 유량, 이력제, 개체번호, ' +
  '두수, TMR, DIM, BCS, SCC, 팅커벨, 송영신목장, 해돋이목장 같은 축산 용어가 나옵니다.';
