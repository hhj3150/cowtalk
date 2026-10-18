// 음성 대화 세션 — "왜?"가 통하게 만드는 것.
//
// 문제: 매 턴이 무상태면 "1877번 어때?" 다음에 "왜?"라고 물었을 때
// 무엇의 이유를 묻는지 알 수 없다. 화면이 없으니 사용자가 다시 번호를 말해야 하는데,
// 그건 대화가 아니라 명령어 입력이다.
//
// 왜 서버에 두는가: 클라이언트가 이력을 매번 실어 보내면 (1) 헤더·본문이 커지고
// (2) 기기를 바꾸면 대화가 끊긴다. 서버가 스레드를 들고 있으면 폰에서 시작한 대화를
// 사무실 웹에서 이어받는다.
//
// 왜 짧게 두는가: 컨텍스트가 길수록 첫 토큰이 늦다. 음성은 그 지연을 감당 못 한다.
// 최근 N턴만 남기고, 각 턴도 길이를 자른다.

import { getRedis } from '../serving/cache.service.js';
import { logger } from '../lib/logger.js';

const PREFIX = 'voice:session:';
const TTL_SEC = 30 * 60;      // 30분 — 목장 일과 한 구간
const MAX_TURNS = 8;          // 4왕복. 그 이상은 첫 토큰만 늦춘다
const MAX_CHARS_PER_TURN = 300;

export interface VoiceTurnRecord {
  readonly role: 'user' | 'assistant';
  readonly content: string;
}

export interface VoiceSession {
  readonly turns: readonly VoiceTurnRecord[];
  /**
   * 마지막으로 언급된 개체번호. "그 소", "걔", "다시 확인해줘"의 대상이다.
   * 이력만으로도 모델이 대개 알아내지만, 명시적으로 남겨두면
   * 이력이 잘려나간 뒤에도 지시대명사가 살아 있다.
   */
  readonly lastAnimalId?: string;
  readonly updatedAt: number;
}

const EMPTY: VoiceSession = { turns: [], updatedAt: 0 };

/** 세션 키 — 사용자 단위. 같은 계정이면 기기가 달라도 대화가 이어진다. */
function key(userId: string): string {
  return PREFIX + userId;
}

// Redis 가 없는 개발 환경용 폴백
const memory = new Map<string, VoiceSession>();

export async function loadSession(userId?: string): Promise<VoiceSession> {
  if (!userId) return EMPTY;
  const redis = getRedis();
  if (!redis) return memory.get(userId) ?? EMPTY;
  try {
    const raw = await redis.get(key(userId));
    return raw ? (JSON.parse(raw) as VoiceSession) : EMPTY;
  } catch (err) {
    // 세션을 못 읽는다고 대화가 죽으면 안 된다. 맥락 없이라도 답하는 편이 낫다.
    logger.warn({ err }, '[voice/session] 로드 실패 — 빈 세션으로 진행');
    return EMPTY;
  }
}

/** 한 왕복을 세션에 붙인다. 오래된 턴은 밀려난다. */
export async function appendTurn(
  userId: string | undefined,
  userText: string,
  assistantText: string,
  lastAnimalId?: string,
): Promise<void> {
  if (!userId) return;
  const prev = await loadSession(userId);
  const clip = (s: string): string =>
    s.length > MAX_CHARS_PER_TURN ? s.slice(0, MAX_CHARS_PER_TURN) : s;

  const turns = [
    ...prev.turns,
    { role: 'user' as const, content: clip(userText) },
    { role: 'assistant' as const, content: clip(assistantText) },
  ].slice(-MAX_TURNS);

  const next: VoiceSession = {
    turns,
    ...(lastAnimalId ?? prev.lastAnimalId ? { lastAnimalId: lastAnimalId ?? prev.lastAnimalId } : {}),
    updatedAt: Date.now(),
  };

  const redis = getRedis();
  if (!redis) {
    memory.set(userId, next);
    return;
  }
  try {
    await redis.set(key(userId), JSON.stringify(next), 'EX', TTL_SEC);
  } catch (err) {
    logger.warn({ err }, '[voice/session] 저장 실패 — 다음 턴은 맥락 없이 시작');
  }
}

/** 대화를 끊는다 — "처음부터", "그만하자" 같은 발화나 명시적 초기화 */
export async function clearSession(userId?: string): Promise<void> {
  if (!userId) return;
  const redis = getRedis();
  if (!redis) { memory.delete(userId); return; }
  try { await redis.del(key(userId)); } catch { /* 지우기 실패는 무시해도 된다 */ }
}

/** 세션 초기화를 요청하는 발화인가 */
export function isResetUtterance(text: string): boolean {
  return /^(처음부터|초기화|새로\s*시작|다시\s*시작|그만하자|리셋)/.test(text.trim());
}
