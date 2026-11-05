// 대화 실패를 사용자 문장으로 — 원문(SDK 오류 JSON, 상태코드)은 로그에만 남긴다
//
// 예전에는 Claude 오류 원문(예: 529 {"type":"error",...})이 그대로 화면에 뜨고,
// 음성 모드에서는 그 원문을 소리 내어 읽었다. 사용자에게는 "무슨 일이고 무엇을 하면 되는지"만.

export type ChatErrorKind = 'busy' | 'timeout' | 'auth' | 'bad_request' | 'empty' | 'unknown';

export interface ClassifiedChatError {
  readonly kind: ChatErrorKind;
  readonly userMessage: string;
}

/** 전체 답변 시간 상한 초과 */
export class ChatDeadlineError extends Error {
  constructor(readonly deadlineMs: number) {
    super(`chat deadline exceeded (${String(deadlineMs)}ms)`);
    this.name = 'ChatDeadlineError';
  }
}

const MESSAGES: Readonly<Record<ChatErrorKind, string>> = {
  busy: '지금 AI 사용량이 몰려 답변을 만들지 못했습니다. 잠시 후 같은 질문을 다시 해 주세요.',
  timeout: '답변이 너무 오래 걸려 중단했습니다. 질문을 조금 짧게 나눠서 다시 물어봐 주세요.',
  auth: 'AI 서비스 연결 설정에 문제가 있습니다. 관리자에게 알려 주세요.',
  bad_request: '질문을 처리하지 못했습니다. 표현을 바꿔 다시 물어봐 주세요.',
  empty: '이번에는 답변이 만들어지지 않았습니다. 같은 질문을 한 번 더 해 주세요.',
  unknown: '일시적인 오류로 답변하지 못했습니다. 잠시 후 다시 시도해 주세요.',
};

export function classifyChatError(err: unknown): ClassifiedChatError {
  const e = (err ?? {}) as { status?: number; name?: string; message?: string };
  const msg = (e.message ?? '').toLowerCase();
  const name = e.name ?? '';
  let kind: ChatErrorKind = 'unknown';
  if (err instanceof ChatDeadlineError || name === 'APIConnectionTimeoutError' || msg.includes('timed out') || msg.includes('timeout')) {
    kind = 'timeout';
  } else if (e.status === 429 || e.status === 529 || (e.status !== undefined && e.status >= 500) || msg.includes('overloaded')) {
    kind = 'busy';
  } else if (e.status === 401 || e.status === 403 || msg.includes('api key')) {
    kind = 'auth';
  } else if (e.status === 400 || e.status === 413) {
    kind = 'bad_request';
  } else if (msg.includes('빈 응답') || msg.includes('답변이 생성되지 않았습니다')) {
    kind = 'empty';
  } else if (name === 'APIConnectionError' || msg.includes('fetch failed') || msg.includes('econnreset')) {
    kind = 'busy';
  }
  return { kind, userMessage: MESSAGES[kind] };
}
