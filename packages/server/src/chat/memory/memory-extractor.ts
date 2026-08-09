// 팅커벨 기억 추출기 — 대화에서 '기억할 가치가 있는 것'만 골라낸다.
//
// 설계 원칙:
// 1) **게이트 우선**: 모든 대화에 LLM을 태우지 않는다. 대부분의 발화는 질의("오늘 할 일 뭐야")라
//    기억할 게 없다. 사전 휴리스틱으로 후보 발화만 추출기로 보낸다 (비용·지연 방지).
// 2) **명시 지시 최우선**: "이거 기억해" / "그건 잊어"는 LLM 없이 결정적으로 처리한다.
// 3) **사실이 아니라 발언을 기억한다**: 추출된 기억에는 항상 사용자 원문(sourceQuote)이 붙는다.
// 4) **일회성은 버린다**: "오늘 423번 열났어"는 이벤트지 기억이 아니다. 지속되는 것만 남긴다.
//
// LLM 불가(키 없음·실패) 시에는 규칙 기반 추출로 폴백한다 — 기억 축적이 완전히 멈추지 않게.

import type { MemoryCategory, MemorySource } from '@cowtalk/shared';
import { callClaudeForChatJson } from '../../ai-brain/claude-client.js';
import { logger } from '../../lib/logger.js';

/** 추출된 기억 후보 — 아직 DB에 들어가기 전 */
export interface MemoryCandidate {
  readonly category: MemoryCategory;
  readonly subject: string;
  readonly content: string;
  readonly importance: number;
  readonly confidence: number;
  readonly source: MemorySource;
  readonly sourceQuote: string;
  readonly keywords: readonly string[];
}

const VALID_CATEGORIES: ReadonlySet<string> = new Set<MemoryCategory>([
  'farm_fact', 'protocol', 'preference', 'constraint',
  'equipment', 'economics', 'person', 'goal', 'animal_fact',
]);

// ── 명시적 기억 지시 감지 ──
// "기억해", "잊어" — 사용자가 직접 내리는 지시. LLM 판단을 거치지 않는다.

const REMEMBER_COMMAND = /(기억해|기억해줘|기억해 줘|기억하고|메모해|저장해|잊지\s*마)/;
const FORGET_COMMAND = /(잊어|잊어줘|잊어 줘|잊어버려|기억하지\s*마|지워\s*줘|삭제해\s*줘|기억에서\s*지워)/;

export type ExplicitCommand =
  | { readonly kind: 'remember'; readonly payload: string }
  | { readonly kind: 'forget'; readonly payload: string }
  | null;

/**
 * 명시적 기억 지시를 감지한다.
 * payload는 지시어를 걷어낸 실제 내용 — "우리 착유는 6시야, 기억해" → "우리 착유는 6시야"
 */
export function detectExplicitCommand(text: string): ExplicitCommand {
  const trimmed = text.trim();
  if (trimmed.length === 0) return null;

  // 잊기가 먼저 — "기억하지 마"는 REMEMBER_COMMAND의 '기억하'에도 걸리므로 순서가 중요하다
  if (FORGET_COMMAND.test(trimmed)) {
    const payload = trimmed.replace(FORGET_COMMAND, '').replace(/[,，.。\s]+$/u, '').trim();
    return { kind: 'forget', payload: payload.length > 0 ? payload : trimmed };
  }
  if (REMEMBER_COMMAND.test(trimmed)) {
    const payload = trimmed.replace(REMEMBER_COMMAND, '').replace(/[,，.。\s]+$/u, '').trim();
    return { kind: 'remember', payload: payload.length > 0 ? payload : trimmed };
  }
  return null;
}

// ── 기억 가치 게이트 ──

/** 순수 질의 신호 — 이것만 있으면 기억할 게 없다 */
const QUESTION_MARKERS =
  /[?？]|알려\s*줘|보여\s*줘|뭐야|무엇|어때|어떤가|몇\s*(마리|두|건|개)|어디|언제|왜|어떻게|가능해|있나|없나|요약\s*해|분석\s*해|찾아\s*줘|계산해/;

/** 지속되는 사실을 알려주는 신호 — 이게 있으면 기억 후보 */
const DECLARATIVE_MARKERS: readonly RegExp[] = [
  /우리\s*(목장|농장|는|가|집)/,
  // '늘'은 앞뒤에 한글이 붙지 않을 때만 — 그러지 않으면 '오늘'·'하늘'에 걸린다
  /앞으로|항상|(?<![가-힣])늘(?![가-힣])|매번|매일|매주|보통|원칙|기본적으로|반드시|절대/,
  /안\s*(쓴다|써|쓰고|한다|해)|쓰지\s*않|사용\s*(안|하지\s*않)|금지/,
  /선호|좋아해|싫어|편해|불편|원해|원한다|해\s*주면\s*좋겠/,
  /(단가|가격|납품|판매|계약|출하처|거래처)/,
  /(로봇착유|착유기|착유\s*설비|사료|TMR|배합|깔짚|우사|축사)/,
  /담당\s*(수의사|수정사)|우리\s*수의사|주치의/,
  /목표(는|가|로)|계획(이|은|다)/,
  /(이다|이야|입니다|예요|해요|한다|합니다|였어|했어|쓴다|쓰고\s*있)$/m,
];

/** AI 답변을 정정하는 신호 — 정정은 언제나 기억 가치가 높다 */
const CORRECTION_MARKERS =
  /(그건?\s*아니|그게\s*아니|아니야|아니에요|아닌데|틀렸|틀린|잘못\s*(알|봤|이해)|정정|사실은|실제로는)/;

export type MemoryGateReason =
  | 'explicit_command'
  | 'correction'
  | 'declarative'
  | 'pure_question'
  | 'too_short'
  | 'no_signal';

export interface MemoryGateResult {
  readonly worthy: boolean;
  readonly reason: MemoryGateReason;
}

/** 이 발화에 추출기를 태울 가치가 있는가 — LLM 호출 전 결정적 사전 판정 */
export function evaluateMemoryGate(text: string): MemoryGateResult {
  const trimmed = text.trim();

  if (detectExplicitCommand(trimmed) !== null) {
    return { worthy: true, reason: 'explicit_command' };
  }
  if (CORRECTION_MARKERS.test(trimmed)) {
    return { worthy: true, reason: 'correction' };
  }
  if (trimmed.length < 8) {
    return { worthy: false, reason: 'too_short' };
  }

  const hasDeclarative = DECLARATIVE_MARKERS.some((re) => re.test(trimmed));
  if (hasDeclarative) {
    // 질문 + 서술이 섞이면(예: "우리는 로봇착유기 쓰는데 발정 어떻게 봐?") 서술 부분이 기억 가치를 갖는다
    return { worthy: true, reason: 'declarative' };
  }
  if (QUESTION_MARKERS.test(trimmed)) {
    return { worthy: false, reason: 'pure_question' };
  }
  return { worthy: false, reason: 'no_signal' };
}

export function isMemoryWorthy(text: string): boolean {
  return evaluateMemoryGate(text).worthy;
}

// ── 키워드 추출 (회상 매칭용) ──

/** 회상 점수에 기여하지 않는 흔한 조사·기능어 */
const STOPWORDS: ReadonlySet<string> = new Set([
  '그리고', '하지만', '그래서', '우리', '저는', '내가', '너는', '해줘', '알려', '있는', '없는',
  '이것', '그것', '저것', '때문', '경우', '정도', '이번', '다음', '지금', '오늘', '어제', '내일',
  '입니다', '이에요', '예요', '한다', '합니다', '같아', '것을', '것이', '거의', '조금', '많이',
]);

/** 한글·영문·숫자 토큰 추출 → 소문자 정규화 → 불용어·1글자 제거 */
export function extractKeywords(text: string, limit = 12): readonly string[] {
  const tokens = text
    .toLowerCase()
    .split(/[^가-힣a-z0-9]+/u)
    .map((t) => t.trim())
    .filter((t) => t.length >= 2 && !STOPWORDS.has(t));

  const seen = new Set<string>();
  const result: string[] = [];
  for (const t of tokens) {
    if (seen.has(t)) continue;
    seen.add(t);
    result.push(t);
    if (result.length >= limit) break;
  }
  return result;
}

// ── LLM 응답 파싱·검증 ──

const MAX_CONTENT_LENGTH = 300;
const MAX_SUBJECT_LENGTH = 120;
const MAX_CANDIDATES = 5;

/** 일회성 사건 신호 — 기억이 아니라 이벤트다. 추출됐어도 버린다. */
const TRANSIENT_MARKERS =
  /(오늘|어제|방금|지금\s*막|아까|이번\s*주에\s*한\s*번|일시적)/;

function clamp(v: number, min: number, max: number): number {
  if (!Number.isFinite(v)) return min;
  return Math.min(max, Math.max(min, v));
}

/**
 * LLM JSON 응답 → 검증된 후보 목록.
 * 형식이 어긋난 항목은 조용히 버린다 (전체 실패로 만들지 않는다).
 */
export function parseExtractionResponse(
  parsed: Record<string, unknown>,
  sourceQuote: string,
  source: MemorySource = 'chat_auto',
): readonly MemoryCandidate[] {
  const raw = parsed['memories'];
  if (!Array.isArray(raw)) return [];

  const candidates: MemoryCandidate[] = [];
  for (const item of raw) {
    if (typeof item !== 'object' || item === null) continue;
    const obj = item as Record<string, unknown>;

    const category = typeof obj['category'] === 'string' ? obj['category'] : '';
    const subject = typeof obj['subject'] === 'string' ? obj['subject'].trim() : '';
    const content = typeof obj['content'] === 'string' ? obj['content'].trim() : '';

    if (!VALID_CATEGORIES.has(category)) continue;
    if (subject.length === 0 || subject.length > MAX_SUBJECT_LENGTH) continue;
    if (content.length < 4 || content.length > MAX_CONTENT_LENGTH) continue;
    // 일회성 사건은 기억으로 승격하지 않는다 (animal_events가 담당)
    if (TRANSIENT_MARKERS.test(content)) continue;

    const importance = clamp(Math.round(Number(obj['importance'] ?? 3)), 1, 5);
    const confidence = clamp(Number(obj['confidence'] ?? 0.6), 0.1, 0.95);

    candidates.push({
      category: category as MemoryCategory,
      subject,
      content,
      importance,
      confidence,
      source,
      sourceQuote: sourceQuote.slice(0, 500),
      keywords: extractKeywords(`${subject} ${content}`),
    });
    if (candidates.length >= MAX_CANDIDATES) break;
  }
  return candidates;
}

// ── 추출 프롬프트 ──

const EXTRACTION_SYSTEM = `당신은 축산 AI 어시스턴트 '팅커벨'의 기억 관리자입니다.
목장주·수의사와의 대화에서 **앞으로도 계속 유효한 사실만** 골라 기억으로 저장합니다.

기억할 것 (지속되는 사실):
- farm_fact: 목장 고유 사실 (사육 방식, 축사 구조, 규모)
- protocol: 반복되는 운영·처치 원칙 ("분만 후 3일 칼슘 급여한다")
- preference: 사용자 선호 (보고 방식, 알림 시간, 답변 상세도)
- constraint: 제약 (쓰지 않는 약, 못 하는 작업, 인력·예산 한계)
- equipment: 장비 (착유기, 센서, 사료 배합기 기종)
- economics: 단가·판매 구조 (자체가공 여부, 납품처, 가격)
- person: 관계자 (담당 수의사·수정사 이름과 역할)
- goal: 목표 (수태율 목표, 출하 계획)
- animal_fact: 특정 개체의 지속되는 특성 ("423번은 착유 시 발길질한다")

기억하지 말 것:
- 일회성 사건 ("오늘 423번 열났어", "어제 수정했어") — 이미 이벤트로 기록된다
- 사용자의 질문 자체 ("발정 언제야?")
- AI가 추측한 내용 — 사용자가 실제로 말한 것만
- 센서·DB에서 조회 가능한 수치 (체온, 두수, 유량)

규칙:
- 없으면 빈 배열을 반환하세요. 억지로 만들지 마세요.
- content는 주어를 갖춘 한 문장(한국어)으로 씁니다.
- subject는 이 기억의 주제를 나타내는 2~10자 키워드입니다 (같은 주제의 갱신을 알아보기 위함).
- confidence는 사용자가 얼마나 단정적으로 말했는지입니다 (단정 0.9, 애매 0.4).
- importance는 앞으로의 답변에 얼마나 영향을 주는지입니다 (1~5).

JSON만 출력하세요:
{"memories":[{"category":"farm_fact","subject":"착유설비","content":"착유는 Lely A3 로봇착유기 1대로 한다.","importance":5,"confidence":0.9}]}`;

export function buildExtractionPrompt(
  question: string,
  answer: string,
  existingSubjects: readonly string[],
): string {
  const known = existingSubjects.length > 0
    ? `\n\n## 이미 기억하고 있는 주제\n${existingSubjects.slice(0, 30).join(', ')}\n(같은 주제의 새 정보라면 같은 subject를 그대로 쓰세요 — 갱신·강화로 처리됩니다.)`
    : '';
  return `## 사용자 발화\n${question}\n\n## 팅커벨 답변 (맥락 참고용 — 여기서는 기억을 뽑지 마세요)\n${answer.slice(0, 1200)}${known}\n\n위 사용자 발화에서 기억할 사실을 추출하세요.`;
}

// ── 규칙 기반 폴백 추출 ──
//
// Claude 불가 시에도 명시 지시·고신호 발화는 놓치지 않는다.
// 정규식이 잡을 수 있는 것만 보수적으로 — 애매하면 추출하지 않는다.

const RULE_PATTERNS: ReadonlyArray<{
  readonly pattern: RegExp;
  readonly category: MemoryCategory;
  readonly subject: string;
}> = [
  { pattern: /로봇착유|착유\s*로봇|lely|델라발|delaval|착유기/i, category: 'equipment', subject: '착유설비' },
  { pattern: /tmr|배합사료|조사료|사료\s*(회사|업체|배합)/i, category: 'equipment', subject: '사료급여' },
  { pattern: /(휴머스|hbp|깔짚|우분|퇴비|분뇨)/i, category: 'farm_fact', subject: '축사환경' },
  { pattern: /(단가|납품|자체\s*가공|우유공장|판매처|거래처)/, category: 'economics', subject: '판매구조' },
  { pattern: /(안\s*쓴다|안\s*써|쓰지\s*않|사용\s*안\s*함|금지)/, category: 'constraint', subject: '사용제한' },
  { pattern: /담당\s*수의사|주치의|담당\s*수정사/, category: 'person', subject: '담당자' },
  { pattern: /목표(는|가|로)\s/, category: 'goal', subject: '목표' },
];

export function extractByRules(
  text: string,
  source: MemorySource = 'chat_auto',
): readonly MemoryCandidate[] {
  if (!isMemoryWorthy(text)) return [];
  const trimmed = text.trim();
  if (TRANSIENT_MARKERS.test(trimmed)) return [];

  const candidates: MemoryCandidate[] = [];
  for (const { pattern, category, subject } of RULE_PATTERNS) {
    if (!pattern.test(trimmed)) continue;
    candidates.push({
      category,
      subject,
      content: trimmed.slice(0, MAX_CONTENT_LENGTH),
      importance: 3,
      // 규칙 추출은 문맥을 읽지 못한다 — LLM 추출보다 낮은 신뢰도로 시작한다
      confidence: source === 'user_explicit' ? 0.75 : 0.5,
      source,
      sourceQuote: trimmed.slice(0, 500),
      keywords: extractKeywords(trimmed),
    });
    if (candidates.length >= 2) break;
  }

  // 명시 지시인데 어떤 규칙에도 안 걸리면 — 사용자가 기억하라고 했으니 통째로 저장한다
  if (candidates.length === 0 && source === 'user_explicit') {
    candidates.push({
      category: 'farm_fact',
      subject: trimmed.slice(0, 20),
      content: trimmed.slice(0, MAX_CONTENT_LENGTH),
      importance: 4,
      confidence: 0.8,
      source,
      sourceQuote: trimmed.slice(0, 500),
      keywords: extractKeywords(trimmed),
    });
  }
  return candidates;
}

// ── 통합 추출 진입점 ──

export interface ExtractionInput {
  readonly question: string;
  readonly answer: string;
  readonly existingSubjects: readonly string[];
}

/**
 * 대화 한 턴 → 기억 후보.
 * 게이트 통과 실패 시 즉시 빈 배열 (LLM 호출 없음).
 * LLM 실패 시 규칙 기반으로 폴백.
 */
export async function extractMemoryCandidates(
  input: ExtractionInput,
): Promise<readonly MemoryCandidate[]> {
  const gate = evaluateMemoryGate(input.question);
  if (!gate.worthy) return [];

  const explicit = detectExplicitCommand(input.question);
  const source: MemorySource =
    explicit?.kind === 'remember' ? 'user_explicit'
      : gate.reason === 'correction' ? 'correction'
        : 'chat_auto';

  // 명시 지시는 지시어를 걷어낸 본문으로 추출한다
  const subject = explicit?.kind === 'remember' ? explicit.payload : input.question;

  try {
    const result = await callClaudeForChatJson(
      EXTRACTION_SYSTEM,
      buildExtractionPrompt(subject, input.answer, input.existingSubjects),
    );
    if (result) {
      const candidates = parseExtractionResponse(result.parsed, subject, source);
      // 명시 지시인데 LLM이 아무것도 못 뽑았으면 규칙 폴백으로 반드시 남긴다
      if (candidates.length === 0 && source === 'user_explicit') {
        return extractByRules(subject, source);
      }
      return candidates;
    }
  } catch (err) {
    logger.warn({ err }, '[Memory] LLM 추출 실패 — 규칙 기반으로 폴백');
  }

  return extractByRules(subject, source);
}
