// 음성 턴 오케스트레이터 — 한 번의 발화가 답변 음성이 되기까지.
//
// 흐름:
//   오디오 → STT → 라우팅 → (선행 응답 TTS) → Claude 스트리밍 + 도구
//         → 첫 문장 완성 즉시 TTS → 이어지는 문장 TTS → 종료
//
// 지연에 대한 입장:
//   "발화 종료 → 첫 소리 1초"를 목표로 한다. 도구를 호출하면 LLM 왕복이
//   한 번 더 붙어 실제 답변은 1초를 넘는다. 그래서 **선행 응답**을 먼저 내보낸다.
//   사용자 귀에는 1초 안에 소리가 들리고, 실제 답변이 그 뒤에 이어진다.

import Anthropic from '@anthropic-ai/sdk';
import { config } from '../config/index.js';
import { logger } from '../lib/logger.js';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { TurnTimer } from './latency.js';
import { getSttProvider, getTtsProvider } from './providers/index.js';
import { VOICE_TOOLS } from './tools.schema.js';
import { runVoiceTool } from './tools.js';
import { routeUtterance, buildAck, shouldAck } from './router.js';
import { temperatureParam, thinkingParam, effortParam } from '../ai-brain/claude-model-params.js';
import type { ToolCallContext } from '../ai-brain/tools/tool-gateway.js';
import { v4 as uuidv4 } from 'uuid';

// ── 시스템 프롬프트 (파일 분리 — 지시서 §7) ──────────────────
// 시작 시 한 번만 읽는다. 매 턴 파일 IO 를 하면 그것도 지연이다.
const here = path.dirname(fileURLToPath(import.meta.url));
let cachedSystemPrompt: string | null = null;

export function getVoiceSystemPrompt(): string {
  if (cachedSystemPrompt) return cachedSystemPrompt;
  // 빌드 후에는 dist 에도 md 가 있어야 한다 (build 스크립트에서 복사)
  const candidates = [
    path.join(here, 'system_prompt.md'),
    path.join(here, '../../src/voice/system_prompt.md'),
  ];
  for (const p of candidates) {
    try {
      cachedSystemPrompt = readFileSync(p, 'utf-8');
      return cachedSystemPrompt;
    } catch {
      // 다음 후보로
    }
  }
  // 파일을 못 찾아도 음성이 죽지 않게 최소 규칙은 코드에 남긴다
  logger.error({ candidates }, '[voice] system_prompt.md 를 찾지 못함 — 최소 프롬프트로 동작');
  cachedSystemPrompt =
    '당신은 카우톡입니다. 화면 없이 음성으로만 답합니다. 1~2문장, 숫자를 앞에 두고, ' +
    '개체번호는 복창 확인하고, 기록·처방은 확답을 받은 뒤에만 실행합니다.';
  return cachedSystemPrompt;
}

// ── 문장 분할 (스트리밍 → TTS) ────────────────────────────────
// 첫 문장이 완성되는 즉시 TTS 로 보낸다. 전체 답변을 기다리면 그만큼 늦다.

const SENTENCE_END = /([.!?。]|다\.|요\.|까\?|니다\.|습니다\.)\s/;

/**
 * 누적 텍스트에서 완성된 문장을 떼어낸다.
 * 반환: [완성문장들, 남은 조각]
 */
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
  /** 이전 턴 요약 — 짧게. 전체 히스토리를 넣으면 캐시가 깨지고 느려진다 */
  readonly context?: readonly { role: 'user' | 'assistant'; text: string }[];
  readonly toolContext: ToolCallContext;
}

export interface VoiceTurnCallbacks {
  /** 전사 결과 — 클라이언트가 화면에 즉시 표시(보조 UI) */
  readonly onTranscript: (text: string, confidence?: number) => void;
  /** 오디오 청크. seq 순서대로 재생하면 된다 */
  readonly onAudio: (audio: Buffer, contentType: string, seq: number, isAck: boolean) => void;
  /** 답변 텍스트(문장 단위) — 자막용 */
  readonly onText: (sentence: string) => void;
  readonly onDone: (fullText: string) => void;
  readonly onError: (error: Error) => void;
}

/** 개체번호 힌트 — STT 오인식을 줄이기 위해 도메인 단어를 넘긴다 */
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
    ...(input.toolContext.userId ? { userId: input.toolContext.userId } : {}),
    ...(input.toolContext.farmId ? { farmId: input.toolContext.farmId } : {}),
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
  const speak = async (text: string, isAck: boolean): Promise<void> => {
    if (!tts || !text.trim()) return;
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
      // 음성 합성 실패가 대화를 죽이면 안 된다. 자막은 이미 나갔다.
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
    timer.setMeta({ transcriptChars: t.text.length, ...(t.confidence !== undefined ? { sttConfidence: t.confidence } : {}) });
    cb.onTranscript(t.text, t.confidence);

    if (!t.text.trim()) {
      await speak('잘 못 들었습니다. 다시 말씀해 주시겠습니까?', false);
      cb.onDone('');
      timer.end('ok');
      return;
    }

    // 신뢰도가 낮으면 추측하지 않고 되묻는다 (지시서 §4)
    if (t.confidence !== undefined && t.confidence < config.VOICE_STT_MIN_CONFIDENCE) {
      const msg = '잘 못 들었습니다. 다시 말씀해 주시겠습니까?';
      cb.onText(msg);
      await speak(msg, false);
      cb.onDone(msg);
      timer.end('ok');
      return;
    }

    // 2) 라우팅 + 선행 응답
    const decision = routeUtterance(t.text);
    const model = decision.route === 'fast' ? config.VOICE_MODEL_FAST : config.VOICE_MODEL_MAIN;
    timer.setMeta({ model });

    // 선행 응답은 기다리지 않는다 — 백그라운드로 내보내고 LLM 을 바로 시작한다
    const ackPromise = shouldAck(t.text) ? speak(buildAck(t.text), true) : Promise.resolve();

    // 3) Claude 스트리밍 + 도구 루프
    const anthropic = new Anthropic({ apiKey: config.ANTHROPIC_API_KEY ?? '' });
    const messages: Anthropic.MessageParam[] = [
      ...(input.context ?? []).map((m) => ({
        role: m.role,
        content: m.text,
      })) as Anthropic.MessageParam[],
      { role: 'user', content: t.text },
    ];

    const usedTools: string[] = [];
    let full = '';
    let pending = '';

    // 도구 호출을 포함해 최대 3 라운드. 음성 대화에서 그 이상은 이미 너무 느리다.
    for (let round = 0; round < 3; round++) {
      const stream = anthropic.messages.stream({
        model,
        max_tokens: config.VOICE_MAX_TOKENS,
        system: [
          {
            type: 'text',
            text: getVoiceSystemPrompt(),
            // 시스템 프롬프트는 매 턴 동일하다 — 캐시가 걸려야 TTFT 가 줄어든다
            cache_control: { type: 'ephemeral' },
          },
        ],
        tools: VOICE_TOOLS as Anthropic.Messages.Tool[],
        messages,
        ...temperatureParam(model, config.VOICE_TEMPERATURE),
        ...thinkingParam(model, 0), // 음성은 추론 지연을 감당할 수 없다
        ...effortParam(model, config.VOICE_EFFORT),
      });

      stream.on('text', (chunk) => {
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
      });

      const msg = await stream.finalMessage();

      if (msg.stop_reason !== 'tool_use') break;

      // 도구 실행 — 병렬. 순차 실행은 그대로 지연이 된다.
      const toolUses = msg.content.filter(
        (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use',
      );
      const results = await Promise.all(
        toolUses.map(async (tu) => {
          usedTools.push(tu.name);
          const r = await runVoiceTool(
            tu.name,
            (tu.input ?? {}) as Record<string, unknown>,
            input.toolContext,
          );
          return {
            type: 'tool_result' as const,
            tool_use_id: tu.id,
            content: r.content,
          };
        }),
      );

      messages.push({ role: 'assistant', content: msg.content });
      messages.push({ role: 'user', content: results });
    }

    // 남은 조각도 말한다 — 마지막 문장이 마침표로 안 끝나는 경우가 많다
    if (pending.trim()) {
      cb.onText(pending.trim());
      await speak(pending.trim(), false);
    }

    await ackPromise;
    timer.setMeta({ tools: usedTools });
    cb.onDone(full);
    timer.end('ok');
  } catch (err) {
    timer.end('error', err);
    cb.onError(err instanceof Error ? err : new Error(String(err)));
  }
}
