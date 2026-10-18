// 한국어 개체번호 정규화 — STT 가 숫자를 어떻게 뱉든 하나로 모은다.
//
// 문제: 같은 "1877번"을 STT 는 여러 형태로 준다.
//   "1877번" / "18 77번" / "일팔칠칠번" / "천팔백칠십칠번" / "1,877번"
// 이걸 정규화하지 않으면 로스터 대조도 조회도 못 한다.
//
// 이건 STT 공급자를 바꾸지 않고 얻는 정확도다. 순수 함수라 테스트가 쉽다.

/** 한글 숫자 낱자 */
const DIGIT: Readonly<Record<string, string>> = {
  영: '0', 공: '0', 빵: '0',
  일: '1', 하나: '1',
  이: '2', 둘: '2',
  삼: '3', 셋: '3',
  사: '4', 넷: '4',
  오: '5', 다섯: '5',
  육: '6', 륙: '6', 여섯: '6',
  칠: '7', 일곱: '7',
  팔: '8', 여덟: '8',
  구: '9', 아홉: '9',
};

/** 자릿수 한글 */
const UNIT: Readonly<Record<string, number>> = { 십: 10, 백: 100, 천: 1000, 만: 10000 };

/**
 * "천팔백칠십칠" → 1877 (자릿수 낭독)
 * 실패하면 null. 억지로 숫자를 만들지 않는다 — 틀린 번호가 없는 번호보다 나쁘다.
 */
export function parseSinoKorean(text: string): number | null {
  const s = text.replace(/\s/g, '');
  if (!s || !/^[영공빵일이삼사오육륙칠팔구십백천만]+$/.test(s)) return null;

  let total = 0;
  let current = 0;
  let sawAny = false;

  for (const ch of s) {
    const d = DIGIT[ch];
    if (d !== undefined) {
      current = current * 10 + Number(d);
      sawAny = true;
      continue;
    }
    const u = UNIT[ch];
    if (u === undefined) return null;
    sawAny = true;
    if (u === 10000) {
      total = (total + (current === 0 ? 1 : current)) * u;
      current = 0;
    } else {
      total += (current === 0 ? 1 : current) * u;
      current = 0;
    }
  }
  const out = total + current;
  return sawAny && out > 0 ? out : null;
}

/**
 * "일팔칠칠" → 1877 (낱자 낭독)
 * 목장에서 번호를 부르는 가장 흔한 방식이다.
 */
export function parseDigitByDigit(text: string): number | null {
  const s = text.replace(/\s/g, '');
  if (!s || s.length < 3) return null;
  let out = '';
  for (const ch of s) {
    const d = DIGIT[ch];
    if (d === undefined) return null;
    out += d;
  }
  return out.length >= 3 ? Number(out) : null;
}

/**
 * 발화에서 개체번호 후보를 모두 뽑는다.
 * 아라비아 숫자와 한글 낭독을 모두 훑고, 등장 순서를 유지한다.
 *
 * 왜 여러 개를 뽑나: "1877 말고 1902" 같은 발화가 실제로 나온다.
 * 하나만 뽑으면 앞의 것을 골라 틀린다.
 */
export function extractNumberCandidates(text: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const push = (n: string): void => {
    if (n.length >= 3 && n.length <= 5 && !seen.has(n)) { seen.add(n); out.push(n); }
  };

  // 1) 아라비아 숫자 — 쉼표·공백으로 쪼개진 것도 붙인다 ("18 77" → "1877")
  const compact = text.replace(/(\d)[,\s]+(?=\d)/g, '$1');
  for (const m of compact.matchAll(/(?<!\d)(\d{3,5})(?!\d)/g)) push(m[1]!);

  // 2) 한글 낭독 — "번" 앞의 한글 덩어리를 우선 본다
  for (const m of text.matchAll(/([영공빵일이삼사오육륙칠팔구십백천만하나둘셋넷다섯여섯일곱여덟아홉\s]{2,})\s*번/g)) {
    const chunk = m[1]!;
    const a = parseDigitByDigit(chunk);
    if (a !== null) push(String(a));
    const b = parseSinoKorean(chunk);
    if (b !== null) push(String(b));
  }
  return out;
}

/** 편집거리 — 로스터 근접 후보를 찾는 데 쓴다 */
export function editDistance(a: string, b: string): number {
  const m = a.length, n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  let prev = Array.from({ length: n + 1 }, (_, i) => i);
  for (let i = 1; i <= m; i++) {
    const cur = [i, ...Array<number>(n).fill(0)];
    for (let j = 1; j <= n; j++) {
      cur[j] = Math.min(
        prev[j]! + 1,
        cur[j - 1]! + 1,
        prev[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
    prev = cur;
  }
  return prev[n]!;
}

/**
 * 발화에서 **개체번호로 볼 수 있는** 후보만 뽑는다.
 *
 * extractNumberCandidates 와 다른 점: "번" 표지를 요구한다.
 * 왜 필요한가 — 로스터 자동 대조는 표지가 있을 때만 안전하다.
 * "2026년 계획"의 2026 을 개체번호로 오인해 "2016번 말씀이신가요?"라고
 * 되물으면 그게 더 나쁜 경험이다. 표지가 없으면 대조하지 않는다.
 */
export function extractSpokenAnimalNumbers(text: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const push = (n: string): void => {
    if (n.length >= 3 && n.length <= 5 && !seen.has(n)) { seen.add(n); out.push(n); }
  };

  const compact = text.replace(/(\d)[,\s]+(?=\d)/g, '$1');
  for (const m of compact.matchAll(/(?<!\d)(\d{3,5})\s*번/g)) push(m[1]!);

  for (const m of text.matchAll(/([영공빵일이삼사오육륙칠팔구십백천만하나둘셋넷다섯여섯일곱여덟아홉\s]{2,})\s*번/g)) {
    const chunk = m[1]!;
    const a = parseDigitByDigit(chunk);
    if (a !== null) push(String(a));
    const b = parseSinoKorean(chunk);
    if (b !== null) push(String(b));
  }
  return out;
}
