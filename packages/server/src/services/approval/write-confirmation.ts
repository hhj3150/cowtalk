// 기록 도구 사용자 확인 — 순수 규칙 (DB 없음, 테스트 대상)
//
// AI가 진료·번식 기록 도구를 부르면 바로 저장하지 않는다.
//   1차 호출 → 제안만 남기고 사용자에게 요약을 보여준다
//   2차 호출(confirmationId 동반) → 사용자의 **다음 발화**가 명시적 승인일 때만 실행
// 이 파일은 "어떤 도구가 확인 대상인가", "사용자 발화가 승인인가", "요약을 어떻게 보여주나"만 다룬다.

/**
 * 확인 없이는 저장하지 않는 도구. 공식 진료·번식 기록과 학습 레이블에 남는 것들이다.
 * record_milk_yield 는 일상 입력(하루 여러 번)이라 제외 — 오입력 시 영향이 제한적이고 수정 화면이 있다.
 */
export const CONFIRM_REQUIRED_TOOLS: readonly string[] = [
  'record_treatment',
  'record_insemination',
  'record_pregnancy_check',
  'confirm_treatment_outcome',
  'record_expert_label',
  'schedule_sync_protocol',
];

export function requiresWriteConfirmation(toolName: string): boolean {
  return CONFIRM_REQUIRED_TOOLS.includes(toolName);
}

/** 제안 유효 시간 — 현장에서 다른 일을 하다 돌아와도 될 만큼, 하루를 넘기지는 않게 */
export const CONFIRMATION_TTL_MS = 30 * 60 * 1000;

export type ConfirmationIntent = 'affirm' | 'deny' | 'unclear';

// VO-02: 예전 판정은 "승인 단어가 문장 어디에든 있으면 승인"이었다.
//   "저장 안 할래", "아직 확정 안 됐어", "좋아지고 있어", "그래서 체온은?", "네 번째 소"가 모두 승인으로 판정됐다.
// 이제 규칙은 셋이다.
//   1) 질문이면 unclear (제안은 그대로 남는다 — "그 소 마지막 수정일은?" 같은 물음이 제안을 취소하지 않게)
//   2) 부정·보류·수정 요청이 하나라도 있으면 deny (안·않·못 포함)
//   3) 발화 전체가 짧은 승인 표현만으로 이루어졌을 때만 affirm. 하나라도 모르는 말이 섞이면 unclear.

/** 부정·보류·수정 요청 — 승인 표현과 함께 있어도 이쪽이 이긴다 */
const DENY_RE = new RegExp(
  [
    '아니', '아냐', '아뇨', '취소', '잠깐', '잠시만', '그만', '말고', '하지\\s*마', '보류', '나중', '멈춰', '스톱',
    '틀렸', '틀려', '틀린', '잘못', '다시', '수정\\s*(?:해|하|할|필요|요청)', '바꿔', '바꾸', '변경', '고쳐', '빼', '지워',
    // 부정 부사·어미: "저장 안 할래", "확정 안 됐어", "저장하지 않을게", "못 하겠어"
    '(?:^|\\s)안(?=\\s|$)', '(?:^|\\s)안\\s*(?:해|하|돼|되|됐|할|함)', '않', '(?:^|\\s)못(?=\\s|$)', '(?:^|\\s)못\\s*(?:해|하|했|할)',
    '\\bno\\b', '\\bnope\\b', '\\bcancel', '\\bstop\\b', '\\bwait\\b', "\\bdon'?t\\b", '\\bnot\\b',
  ].join('|'),
  'i',
);

/** 발화를 이루는 토큰이 전부 이 목록에 있어야 승인. 확인은 완료형만 ("확인해줘"는 조회 요청). */
const AFFIRM_TOKEN_RE = new RegExp(
  '^(?:' + [
    '네', '예', '응', '어', '넵', '넹', '네네', '예예', 'ㅇㅇ', '오케이', '오키', '좋아', '좋아요', '좋습니다', '좋네요',
    '맞아', '맞아요', '맞습니다', '맞네', '맞네요', '그래', '그래요', '그럽시다', '그렇게', '그대로',
    '확인', '확인했어', '확인했어요', '확인했습니다', '확인함', '확인됨', '확인됐어', '확인완료', '완료', '이상',
    '확정', '확정해', '확정해줘', '확정해주세요', '확정합니다',
    '저장', '저장해', '저장해줘', '저장해요', '저장해주세요', '저장합니다', '저장하자', '저장하세요',
    '기록', '기록해', '기록해줘', '기록해요', '기록해주세요', '기록합니다', '기록하자',
    '등록', '등록해', '등록해줘', '등록해주세요', '등록합니다',
    '진행', '진행해', '진행해줘', '진행해주세요', '진행합니다', '진행하자',
    '반영', '반영해', '반영해줘', '반영해주세요', '올려', '올려줘', '올려주세요',
    '해', '해줘', '해요', '해주세요', '하세요', '하자', '합시다', '그럼', '줘', '주세요', '주십시오',
    'ok', 'okay', 'yes', 'yep', 'yeah', 'sure', 'confirm', 'confirmed', 'save', 'go', 'ahead', 'please',
  ].join('|') + ')$',
  'i',
);

/** 승인으로 인정하는 최대 토큰 수 — 긴 문장은 다른 요청이 섞였을 가능성이 크다 */
const MAX_AFFIRM_TOKENS = 6;

/** 사용자 발화가 저장 승인인지 판정한다. 애매하면 unclear — 저장하지 않는다. */
export function classifyConfirmationUtterance(text: string): ConfirmationIntent {
  const t = text.replace(/\s+/g, ' ').trim();
  if (!t) return 'unclear';
  if (/[?？]/.test(t) || /(?:나요|까요|니까|는지|인가|건가|어때)\s*[.!~…]*$/.test(t)) return 'unclear';
  if (DENY_RE.test(t)) return 'deny';
  const tokens = t.split(/[\s.,!~…·]+/).filter((w) => w.length > 0);
  if (tokens.length === 0 || tokens.length > MAX_AFFIRM_TOKENS) return 'unclear';
  return tokens.every((w) => AFFIRM_TOKEN_RE.test(w)) ? 'affirm' : 'unclear';
}

/**
 * VO-01: 승인 판정·학습·기억에 쓸 사용자 원문.
 * 클라이언트가 보낸 userText 가 있으면 그것을, 없으면(구버전 클라이언트) 맥락이 덧붙은 question 에서
 * 마지막 "사용자 질문:"/"질문:" 표지 뒤만 떼어낸다. 표지가 없으면 question 그대로.
 */
export function extractUserUtterance(question: string, userText?: string): string {
  if (userText !== undefined && userText.trim() !== '') return userText.trim();
  const markers = ['\n사용자 질문:', '\n질문:'];
  for (const m of markers) {
    const i = question.lastIndexOf(m);
    if (i >= 0) return question.slice(i + m.length).trim();
  }
  return question.trim();
}

// ── 요약 ──

const TOOL_LABEL: Readonly<Record<string, string>> = {
  record_treatment: '진료(치료) 기록',
  record_insemination: '인공수정 기록',
  record_pregnancy_check: '임신감정 기록',
  confirm_treatment_outcome: '치료결과 확정',
  record_expert_label: '전문가 진단 레이블',
  schedule_sync_protocol: '발정동기화 처방',
};

/**
 * 입력 키 → 사람이 읽는 이름.
 * VO-08: 예전엔 여기 없는 키를 요약에서 뺐다 → 유방 분방·CMT·BCS·탈수도·정액 ID 처럼 실제로 저장되는 값이
 * 확인 없이 저장됐다. 이제 ID_KEYS(개체 표시로 대신하는 내부 id)만 빼고 저장되는 키는 전부 보여준다.
 */
const FIELD_LABEL: Readonly<Record<string, string>> = {
  diagnosis: '진단',
  severity: '중증도',
  drug: '약품',
  dosage: '용량',
  route: '투여 경로',
  frequency: '투여 빈도',
  durationDays: '투약 기간(일)',
  withdrawalDays: '휴약기간(일)',
  rectalTemp: '직장체온(°C)',
  result: '결과',
  method: '방법',
  daysPostInsemination: '수정 후 경과일',
  semenInfo: '정액',
  technicianName: '수정사',
  outcome: '치료결과',
  labelType: '판정 유형',
  protocol: '프로토콜',
  startDate: '시작일',
  prescribedBy: '처방 수의사',
  treatmentId: '대상 치료 기록 ID',
  cmtResult: 'CMT 결과',
  bcs: '체형점수(BCS)',
  hydrationLevel: '탈수 정도',
  affectedQuarter: '이환 분방',
  semenId: '정액 카탈로그(재고 1개 차감)',
  mappedAlarmType: '연결 알람 유형',
  notes: '비고',
};

/** 요약에서 빼는 키 — 개체·목장은 animalLabel 로 사람이 읽게 보여주고, 확인 메타는 저장 대상이 아니다 */
const ID_KEYS: ReadonlySet<string> = new Set(['animalId', 'farmId', 'confirmationId']);

const VALUE_LABEL: Readonly<Record<string, Readonly<Record<string, string>>>> = {
  hydrationLevel: { normal: '정상', mild: '경도', moderate: '중등도', severe: '중증' },
  affectedQuarter: { LF: '좌전', RF: '우전', LR: '좌후', RR: '우후' },
  severity: { mild: '경증', moderate: '중등증', severe: '중증', low: '낮음', medium: '중간', high: '높음', critical: '긴급' },
  result: { pregnant: '임신', open: '미임신', uncertain: '불확실' },
  outcome: { recovered: '회복', improving: '호전', unchanged: '변화 없음', worsened: '악화', relapsed: '재발', died: '폐사', culled: '도태' },
};

function formatValue(key: string, v: unknown): string {
  if (Array.isArray(v)) return v.map((x) => formatValue(key, x)).join(', ');
  if (typeof v === 'object' && v !== null) return JSON.stringify(v);
  const s = String(v);
  const label = VALUE_LABEL[key]?.[s];
  return label ? `${label} (${s})` : s;
}

export interface ProposalSubject {
  /** 예: "송영신목장 123번" — 개체를 사람이 확인할 수 있게 */
  readonly animalLabel?: string;
}

/** 사용자에게 그대로 보여줄 확인 요약 (한 줄씩) */
export function buildProposalSummary(
  toolName: string,
  input: Readonly<Record<string, unknown>>,
  subject: ProposalSubject,
): string {
  const lines: string[] = [`[${TOOL_LABEL[toolName] ?? toolName}]`];
  if (subject.animalLabel) lines.push(`개체: ${subject.animalLabel}`);
  const present = (k: string): boolean => {
    const v = input[k];
    return v !== undefined && v !== null && v !== '';
  };
  // 알려진 키는 정해진 순서·이름으로, 그 밖의 저장 키도 빠짐없이 (원래 키 이름 그대로)
  for (const [key, label] of Object.entries(FIELD_LABEL)) {
    if (present(key)) lines.push(`${label}: ${formatValue(key, input[key])}`);
  }
  for (const key of Object.keys(input)) {
    if (key in FIELD_LABEL || ID_KEYS.has(key) || !present(key)) continue;
    lines.push(`${key}: ${formatValue(key, input[key])}`);
  }
  return lines.join('\n');
}

export interface PendingConfirmation {
  readonly confirmationId: string;
  readonly summary: string;
}

/**
 * VO-08: 게이트웨이 결과가 '저장 대기 제안'이면 그 요약을 꺼낸다 — LLM 을 거치지 않고
 * 클라이언트에 원문 그대로 보내기 위해 (LLM 이 요약을 줄이거나 바꿔 말하면 사용자는 다른 내용을 승인하게 된다)
 */
export function extractPendingConfirmation(toolResult: string): PendingConfirmation | null {
  try {
    const r = JSON.parse(toolResult) as { confirmationRequired?: unknown; confirmationId?: unknown; summary?: unknown };
    if (r.confirmationRequired === true && typeof r.confirmationId === 'string' && typeof r.summary === 'string') {
      return { confirmationId: r.confirmationId, summary: r.summary };
    }
  } catch {
    // 도구 결과가 JSON 이 아니면 제안이 아니다
  }
  return null;
}

/** confirmationId 등 게이트웨이용 메타 키를 뺀 실제 도구 입력 */
export function stripConfirmationMeta(input: Readonly<Record<string, unknown>>): Record<string, unknown> {
  const rest: Record<string, unknown> = { ...input };
  delete rest.confirmationId;
  return rest;
}
