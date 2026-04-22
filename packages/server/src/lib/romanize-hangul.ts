// 한글 → 로마자 변환 (Revised Romanization 기반, 농장명 검색용 단순화)
// "술탄" → "sultan", "갈전리" → "galjeonri", "송영신" → "songyeongsin"
//
// 목적: DB에 영문으로 저장된 농장명을 한국어 질의로도 찾을 수 있도록
// 정확도 100%가 아님 — 검색 보조용 (ILIKE 확장)

const HANGUL_START = 0xac00;
const HANGUL_END = 0xd7a3;

// 19개 초성
const INITIALS = [
  'g', 'kk', 'n', 'd', 'tt', 'r', 'm', 'b', 'pp', 's',
  'ss', '', 'j', 'jj', 'ch', 'k', 't', 'p', 'h',
] as const;

// 21개 중성
const MEDIALS = [
  'a', 'ae', 'ya', 'yae', 'eo', 'e', 'yeo', 'ye', 'o', 'wa',
  'wae', 'oe', 'yo', 'u', 'wo', 'we', 'wi', 'yu', 'eu', 'ui', 'i',
] as const;

// 28개 종성 (빈 종성 포함)
const FINALS = [
  '', 'k', 'k', 'ks', 'n', 'nj', 'nh', 't', 'l', 'lk',
  'lm', 'lp', 'ls', 'lt', 'lp', 'lh', 'm', 'p', 'ps', 't',
  't', 'ng', 't', 't', 'k', 't', 'p', 'h',
] as const;

export function romanizeHangul(input: string): string {
  let output = '';
  for (const ch of input) {
    const code = ch.codePointAt(0);
    if (code === undefined) continue;

    if (code >= HANGUL_START && code <= HANGUL_END) {
      const offset = code - HANGUL_START;
      const initialIdx = Math.floor(offset / (21 * 28));
      const medialIdx = Math.floor((offset % (21 * 28)) / 28);
      const finalIdx = offset % 28;

      output += INITIALS[initialIdx] ?? '';
      output += MEDIALS[medialIdx] ?? '';
      output += FINALS[finalIdx] ?? '';
    } else {
      output += ch;
    }
  }
  return output;
}

// 원본 텍스트에 한글이 포함되어 있으면 로마자 변환본을 반환, 아니면 null
// (DB 검색을 불필요하게 확장하지 않기 위함)
export function romanizeIfHangul(input: string): string | null {
  const hasHangul = /[가-힣]/.test(input);
  if (!hasHangul) return null;
  const romanized = romanizeHangul(input);
  return romanized.toLowerCase() || null;
}
