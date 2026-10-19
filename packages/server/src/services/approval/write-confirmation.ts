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

// 한글은 정규식 \b 경계가 성립하지 않는다 (한글은 \w가 아님). 짧은 응답어는 문장 끝·구두점 앞에서만 인정.
const END = '(?=$|[\\s.,!?~…])';

/** 부정·보류 — 승인 표현과 함께 있어도 이쪽이 이긴다 ("저장하지 마", "아니 저장 말고") */
const DENY_RE = new RegExp(
  [
    '아니', '아냐', '취소', '잠깐', '그만', '말고', '하지\\s*마', '보류', '나중에', '멈춰',
    '틀렸', '잘못', '다시\\s*(?:해|확인|작성)', '수정해',
    '\\bno\\b', '\\bcancel\\b', '\\bstop\\b', '\\bwait\\b',
  ].join('|'),
  'i',
);

/**
 * 명시적 승인. "확인해줘"(조회 요청)와 "확인했어"(승인)를 구분하기 위해 확인은 완료형만 받는다.
 */
const AFFIRM_RE = new RegExp(
  [
    '저장', '기록해', '등록해', '확정', '진행해', '반영해', '올려',
    '확인\\s*(?:했|됐|완료|함|이요|입니다)',
    '맞아', '맞습니다', '맞네', '좋아', '좋습니다', '그래', '그렇게\\s*해', '오케이',
    `네${END}`, `예${END}`, `응${END}`, `넵${END}`,
    '\\bok\\b', '\\bokay\\b', '\\byes\\b', '\\bconfirm', '\\bsave\\b', 'go ahead',
  ].join('|'),
  'i',
);

/** 사용자 발화가 저장 승인인지 판정한다. 애매하면 unclear — 저장하지 않는다. */
export function classifyConfirmationUtterance(text: string): ConfirmationIntent {
  const t = text.replace(/\s+/g, ' ').trim();
  if (!t) return 'unclear';
  if (DENY_RE.test(t)) return 'deny';
  if (AFFIRM_RE.test(t)) return 'affirm';
  return 'unclear';
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

/** 입력 키 → 사람이 읽는 이름. 여기 없는 키는 요약에 넣지 않는다 (내부 id 노출 방지). */
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
  notes: '비고',
};

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
  for (const [key, label] of Object.entries(FIELD_LABEL)) {
    const v = input[key];
    if (v === undefined || v === null || v === '') continue;
    lines.push(`${label}: ${String(v)}`);
  }
  return lines.join('\n');
}

/** confirmationId 등 게이트웨이용 메타 키를 뺀 실제 도구 입력 */
export function stripConfirmationMeta(input: Readonly<Record<string, unknown>>): Record<string, unknown> {
  const rest: Record<string, unknown> = { ...input };
  delete rest.confirmationId;
  return rest;
}
