// 답변 사후 검증 — AI-07
//
// 환각 통제가 시스템 프롬프트에만 있었다. 답변이 근거(도구 결과·제공된 맥락)에 없는 개체번호나 체온 값을 말해도
// 아무도 알아채지 못했다. 이 모듈은 답변 속 '사실 주장' 중 대조 가능한 두 가지만 근거 텍스트와 맞춰 본다.
//   - 개체번호: "423번" (순서 표현 "3번째"·"2번 더"는 제외)
//   - 체온: "40.2°C" — 일반 지식의 정상 범위(38.0~39.5)는 참고값일 수 있어 제외
// 판정은 '근거에 그 문자열이 있는가'뿐이다 — 틀렸다는 단정이 아니라 '확인되지 않음' 표시용.

export interface UnverifiedClaims {
  readonly earTags: readonly string[];
  readonly temperatures: readonly string[];
}

const EAR_TAG_RE = /(?<![\d.])(\d{2,6})번(?!째|\s*더|\s*다시)/g;
const TEMP_RE = /(?<![\d.])(3[5-9]|4[0-2])\.(\d)\s*(?:°\s*C|℃|도)/g;

function normalizeEvidence(evidence: string): string {
  return evidence.replace(/\s+/g, ' ');
}

export function findUnverifiedClaims(answer: string, evidence: string): UnverifiedClaims {
  const ev = normalizeEvidence(evidence);
  const earTags = new Set<string>();
  for (const m of answer.matchAll(EAR_TAG_RE)) {
    const tag = m[1]!;
    // 근거에 숫자가 개체번호로 나오는 형태들 — "423번", "earTag":"423", 관리번호 423
    const found = ev.includes(`${tag}번`) || new RegExp(`["':\\s]${tag}["',\\s}]`).test(ev);
    if (!found) earTags.add(`${tag}번`);
  }
  const temperatures = new Set<string>();
  for (const m of answer.matchAll(TEMP_RE)) {
    const value = Number(`${m[1]}.${m[2]}`);
    if (value >= 38.0 && value <= 39.5) continue; // 정상 범위 — 참고값일 수 있음
    const text = `${m[1]}.${m[2]}`;
    if (!ev.includes(text)) temperatures.add(`${text}°C`);
  }
  return { earTags: [...earTags], temperatures: [...temperatures] };
}

export function hasUnverified(c: UnverifiedClaims): boolean {
  return c.earTags.length > 0 || c.temperatures.length > 0;
}
