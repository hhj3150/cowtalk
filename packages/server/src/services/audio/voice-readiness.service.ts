// 음성 응답 시연 전 점검 — 대화 모델 · 음성 합성(TTS) · 음성 인식(STT)을 실제로 한 번씩 호출한다
//
// /health/deep 은 "키가 있는가"만 본다. 강연·시연 직전에 필요한 건 "지금 답이 오는가"다.
// TTS 로 만든 음성을 다시 STT 에 넣어(왕복) 두 경로를 한 번에 확인한다 — 비용은 수 원 수준.
// 같은 분 안의 반복 호출은 결과를 재사용한다 (연타해도 외부 호출이 쌓이지 않게).

import { pingClaude } from '../../ai-brain/claude-client.js';
import { synthesize } from './tts.service.js';
import { transcribe } from './stt.service.js';

export type ReadinessStatus = 'ok' | 'slow' | 'fail';

export interface ReadinessCheck {
  readonly name: 'claude' | 'tts' | 'stt';
  readonly label: string;
  readonly status: ReadinessStatus;
  readonly latencyMs: number;
  readonly detail: string;
}

export interface VoiceReadiness {
  readonly ready: boolean;
  readonly checkedAt: string;
  readonly totalMs: number;
  readonly checks: readonly ReadinessCheck[];
}

/** 체감 지연 기준 — 이보다 느리면 '느림'(시연은 되지만 청중이 기다림) */
export const SLOW_MS: Readonly<Record<ReadinessCheck['name'], number>> = {
  claude: 6_000,
  tts: 4_000,
  stt: 5_000,
};

export interface ReadinessDeps {
  readonly pingClaude: typeof pingClaude;
  readonly synthesize: typeof synthesize;
  readonly transcribe: typeof transcribe;
  readonly now: () => number;
}

const DEFAULT_DEPS: ReadinessDeps = { pingClaude, synthesize, transcribe, now: () => Date.now() };

function grade(name: ReadinessCheck['name'], ok: boolean, latencyMs: number): ReadinessStatus {
  if (!ok) return 'fail';
  return latencyMs > SLOW_MS[name] ? 'slow' : 'ok';
}

const errText = (e: unknown): string => (e instanceof Error ? e.message : String(e)).slice(0, 200);

export async function runVoiceReadiness(deps: ReadinessDeps = DEFAULT_DEPS): Promise<VoiceReadiness> {
  const started = deps.now();
  const checks: ReadinessCheck[] = [];

  // 1·2. 대화 모델과 음성 합성은 서로 독립 — 동시에
  // 합성 문장에 시각을 넣어 캐시를 피한다 (캐시 적중이면 외부 API 를 확인하지 못한다)
  const stamp = new Date(started).toISOString().slice(11, 16);
  const phrase = `카우톡 음성 점검입니다. 현재 시각 ${stamp}.`;
  const ttsStart = deps.now();
  const [claude, tts] = await Promise.all([
    deps.pingClaude(),
    deps.synthesize({ text: phrase, maxChars: 200 })
      .then((r) => ({ ok: true as const, r, ms: deps.now() - ttsStart }))
      .catch((e: unknown) => ({ ok: false as const, e, ms: deps.now() - ttsStart })),
  ]);

  checks.push({
    name: 'claude',
    label: '대화 모델 (팅커벨 답변)',
    status: grade('claude', claude.ok, claude.latencyMs),
    latencyMs: claude.latencyMs,
    detail: claude.ok ? claude.model : `실패: ${claude.error ?? '알 수 없음'}`,
  });

  if (tts.ok) {
    checks.push({
      name: 'tts',
      label: '음성 합성 (답변 읽어주기)',
      status: grade('tts', true, tts.ms),
      latencyMs: tts.ms,
      detail: `${String(Math.round(tts.r.audio.length / 1024))}KB ${tts.r.contentType}${tts.r.cached ? ' (캐시)' : ''}`,
    });
  } else {
    checks.push({ name: 'tts', label: '음성 합성 (답변 읽어주기)', status: 'fail', latencyMs: tts.ms, detail: `실패: ${errText(tts.e)}` });
  }

  // 3. 음성 인식 — 방금 합성한 음성을 다시 알아듣는지 (합성이 실패했으면 확인 불가)
  if (tts.ok) {
    const sttStart = deps.now();
    try {
      const r = await deps.transcribe({ audio: tts.r.audio, contentType: tts.r.contentType, language: 'ko' });
      const ms = deps.now() - sttStart;
      const understood = r.text.includes('점검') || r.text.includes('카우톡');
      checks.push({
        name: 'stt',
        label: '음성 인식 (말로 질문하기 — 서버 인식)',
        status: understood ? grade('stt', true, ms) : 'fail',
        latencyMs: ms,
        detail: understood ? `인식: "${r.text.slice(0, 40)}"` : `엉뚱하게 인식: "${r.text.slice(0, 40)}"`,
      });
    } catch (e) {
      checks.push({ name: 'stt', label: '음성 인식 (말로 질문하기 — 서버 인식)', status: 'fail', latencyMs: deps.now() - sttStart, detail: `실패: ${errText(e)}` });
    }
  } else {
    checks.push({ name: 'stt', label: '음성 인식 (말로 질문하기 — 서버 인식)', status: 'fail', latencyMs: 0, detail: '음성 합성이 실패해 확인하지 못함' });
  }

  return {
    ready: checks.every((c) => c.status !== 'fail'),
    checkedAt: new Date(started).toISOString(),
    totalMs: deps.now() - started,
    checks,
  };
}

// 1분 안 반복 호출은 결과 재사용 + 동시 호출 합류. '다시 점검'(force)도 15초 간격으로만
let cached: { readonly at: number; readonly value: Promise<VoiceReadiness> } | null = null;
const REUSE_MS = 60_000;
const FORCE_MIN_MS = 15_000;

export function getVoiceReadiness(force = false): Promise<VoiceReadiness> {
  const now = Date.now();
  const age = cached ? now - cached.at : Infinity;
  if (age < (force ? FORCE_MIN_MS : REUSE_MS)) return cached!.value;
  const value = runVoiceReadiness().catch((e: unknown) => {
    cached = null;
    throw e;
  });
  cached = { at: now, value };
  return value;
}
