// 음성 턴 오케스트레이터 — 팅커벨의 **전달 계층**.
//
// ⚠️ 이 파일은 어시스턴트가 아니다. 브레인은 하나뿐이고 그건 팅커벨(chat-service)이다.
// 여기가 하는 일은 넷:
//   1) 오디오 → 텍스트 (STT)
//   2) 팅커벨에게 음성 모드로 물어보기 (handleChatStream + voiceMode)
//   3) 문장이 완성되는 즉시 TTS 로 흘려보내기
//   4) 구간별 지연 계측
//
// 농장 컨텍스트·역할 톤·번식 설정·라벨·장기기억·학습 가이던스·스킬은
// 전부 팅커벨이 이미 조립한다. 음성이 그걸 우회하면 타이핑보다 멍청해진다.

import { config } from '../config/index.js';
import { logger } from '../lib/logger.js';
import { TurnTimer } from './latency.js';
import { getSttProvider, getTtsProvider } from './providers/index.js';
import { routeUtterance, buildAck, shouldAck } from './router.js';
import { stripForSpeech } from './style.js';
import { handleChatStream, type ChatMessageRequest } from '../chat/chat-service.js';
import type { Role } from '@cowtalk/shared';
import { v4 as uuidv4 } from 'uuid';

// ── 문장 분할 (스트리밍 → TTS) ────────────────────────────────
// 첫 문장이 완성되는 즉시 TTS 로 보낸다. 전체 답변을 기다리면 그만큼 늦다.

const SENTENCE_END = /([.!?。]|다\.|요\.|까\?|니다\.|습니다\.)\s/;

/** 누적 텍스트에서 완성된 문장을 떼어낸다. 반환: [완성문장들, 남은 조각] */
export function splitSentences(buffer: string): [string[], string] {
  const out: string[] = [];
  let rest = buffer;
  for (;;) {
    const m = rest.match(SENTENCE_END);
    if (!m || m.index === undefined) break;
    const end = m.index + m[0].length;
    const s = rest.slice(0, end).trim();
    if (s) out.push(s);
    rest = rest.slice(end);
  }
  return [out, rest];
}

// ── 턴 실행 ──────────────────────────────────────────────────

export interface VoiceTurnInput {
  readonly audio: Buffer;
  readonly contentType: string;
  readonly language?: string;
  readonly role: Role;
  readonly userId?: string;
  readonly farmId?: string | null;
  readonly permittedFarmIds?: readonly string[] | null;
  readonly animalId?: string | null;
  /** 직전 대화 — 짧게. 전체 히스토리를 넣으면 캐시가 깨지고 느려진다 */
  readonly conversationHistory?: readonly { role: 'user' | 'assistant'; content: string }[];
  readonly uiLang?: 'ko' | 'en' | 'uz' | 'ru' | 'mn';
}

export interface VoiceTurnCallbacks {
  readonly onTranscript: (text: string, confidence?: number) => void;
  readonly onAudio: (audio: Buffer, contentType: string, seq: number, isAck: boolean) => void;
  readonly onText: (sentence: string) => void;
  readonly onDone: (fullText: string) => void;
  readonly onError: (error: Error) => void;
}

/** STT 힌트 — 개체번호·축산 용어 오인식을 줄인다 */
const STT_HINTS: readonly string[] = [
  '발정', '분만', '유방염', '케토시스', '반추', '음수', '체온', '활동량',
  '수정', '임신감정', '건유', '착유', '휴약', '한우', '젖소', '개체번호',
];

export async function runVoiceTurn(
  input: VoiceTurnInput,
  cb: VoiceTurnCallbacks,
): Promise<void> {
  const turnId = uuidv4();
  const timer = new TurnTimer({
    turnId,
    ...(input.userId ? { userId: input.userId } : {}),
    ...(input.farmId ? { farmId: input.farmId } : {}),
  });

  const stt = getSttProvider();
  const tts = getTtsProvider();
  if (!stt) {
    timer.end('error', 'stt-not-configured');
    cb.onError(new Error('음성 인식이 설정되지 않았습니다'));
    return;
  }
  timer.setMeta({ stt: stt.name, ...(tts ? { tts: tts.name } : {}) });

  let seq = 0;
  const speak = async (raw: string, isAck: boolean): Promise<void> => {
    const text = stripForSpeech(raw);
    if (!tts || !text) return;
    try {
      const r = await tts.synthesize({
        text,
        maxChars: config.VOICE_TTS_MAX_CHARS,
        speed: config.VOICE_TTS_SPEED,
      });
      if (isAck) timer.mark('ackAudioMs');
      timer.mark('firstAudioMs');
      cb.onAudio(r.audio, r.contentType, seq++, isAck);
    } catch (err) {
      // 합성 실패가 대화를 죽이면 안 된다. 자막은 이미 나갔다.
      logger.warn({ err, isAck }, '[voice] TTS 실패 — 텍스트만 전달');
    }
  };

  try {
    // 1) 전사
    const t = await stt.transcribe({
      audio: input.audio,
      contentType: input.contentType,
      language: input.language ?? 'ko',
      hints: STT_HINTS,
    });
    timer.mark('sttDoneMs');
    timer.setMeta({
      transcriptChars: t.text.length,
      ...(t.confidence !== undefined ? { sttConfidence: t.confidence } : {}),
    });
    cb.onTranscript(t.text, t.confidence);

    const askAgain = async (): Promise<void> => {
      const msg = '잘 못 들었습니다. 다시 말씀해 주시겠습니까?';
      cb.onText(msg);
      await speak(msg, false);
      cb.onDone(msg);
      timer.end('ok');
    };

    if (!t.text.trim()) { await askAgain(); return; }
    // 신뢰도가 낮으면 추측하지 않고 되묻는다. 공급자가 신뢰도를 안 주면 이 검사는 건너뛴다.
    if (t.confidence !== undefined && t.confidence < config.VOICE_STT_MIN_CONFIDENCE) {
      await askAgain(); return;
    }

    // 2) 라우팅 + 선행 응답
    const decision = routeUtterance(t.text);
    const modelOverride = decision.route === 'fast' ? config.VOICE_MODEL_FAST : undefined;
    timer.setMeta({ model: modelOverride ?? config.ANTHROPIC_MODEL });

    // 선행 응답은 기다리지 않는다 — 백그라운드로 내보내고 브레인을 바로 시작한다
    const ackPromise = shouldAck(t.text) ? speak(buildAck(t.text), true) : Promise.resolve();

    // 3) 팅커벨에게 물어본다 — 음성 모드 오버레이만 얹는다
    let full = '';
    let pending = '';

    const req: ChatMessageRequest = {
      question: t.text,
      role: input.role,
      farmId: input.farmId ?? null,
      animalId: input.animalId ?? null,
      conversationHistory: (input.conversationHistory ?? []).map((m) => ({
        role: m.role,
        content: m.content,
      })),
      voiceMode: true,
      ...(modelOverride ? { modelOverride } : {}),
      ...(input.userId ? { userId: input.userId } : {}),
      ...(input.permittedFarmIds !== undefined ? { permittedFarmIds: input.permittedFarmIds } : {}),
      ...(input.uiLang ? { uiLang: input.uiLang } : {}),
    };

    await handleChatStream(req, {
      onText: (chunk: string) => {
        timer.mark('ttftMs');
        full += chunk;
        pending += chunk;
        const [sentences, rest] = splitSentences(pending);
        pending = rest;
        for (const s of sentences) {
          if (!timer.timings().firstSentenceMs) timer.mark('firstSentenceMs');
          cb.onText(s);
          void speak(s, false);
        }
      },
      onDone: async () => {
        // 마지막 문장은 마침표로 안 끝나는 경우가 많다 — 남은 조각도 말한다
        if (pending.trim()) {
          cb.onText(pending.trim());
          await speak(pending.trim(), false);
          pending = '';
        }
        await ackPromise;
        cb.onDone(full);
        timer.end('ok');
      },
      onError: (err: Error) => {
        timer.end('error', err);
        cb.onError(err);
      },
      onToolEvent: (e) => {
        if (e.phase === 'start') {
          const prev = timer.timings();
          void prev; // 도구 목록은 메타로만 남긴다
          timer.setMeta({ tools: [e.toolName] });
        }
      },
    });
  } catch (err) {
    timer.end('error', err);
    cb.onError(err instanceof Error ? err : new Error(String(err)));
  }
}
