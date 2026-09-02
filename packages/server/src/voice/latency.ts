// 턴 지연 계측 — 측정 없이 최적화하지 않는다.
//
// 음성 대화의 체감 품질은 "발화 종료 → 첫 소리"가 지배한다.
// 그 구간을 다섯 시점으로 쪼개 매 턴 기록한다. 어디가 느린지 모르면 고칠 수 없다.
//
// 목표(Phase 1):
//   - firstAudioMs  (발화 종료 → 첫 오디오 바이트)   p50 < 1000ms
//   - ttftMs        (요청 → LLM 첫 토큰)             p50 < 800ms
// 도구를 호출하면 LLM 왕복이 한 번 더 붙어 1초는 구조적으로 불가능하다.
// 그래서 선행 응답(speculative ack)의 firstAudioMs 를 따로 본다.

import { logger } from '../lib/logger.js';

/** 한 턴에서 기록하는 시점들 (모두 턴 시작 기준 상대 ms) */
export interface TurnTimings {
  /** 클라이언트가 녹음을 마치고 서버에 도착한 시각 */
  readonly receivedMs: number;
  /** STT 전사 완료 */
  readonly sttDoneMs?: number;
  /** 선행 응답("확인하겠습니다") 첫 오디오 — 캐시 히트면 거의 0 */
  readonly ackAudioMs?: number;
  /** LLM 첫 토큰 도착 (TTFT) */
  readonly ttftMs?: number;
  /** 첫 문장 완성 → TTS 전달 */
  readonly firstSentenceMs?: number;
  /** 첫 오디오 바이트 생성 완료 */
  readonly firstAudioMs?: number;
  /** 턴 전체 종료 */
  readonly totalMs?: number;
}

export interface TurnMeta {
  readonly turnId: string;
  readonly userId?: string;
  readonly farmId?: string;
  /** 어느 모델로 라우팅됐나 */
  readonly model?: string;
  /** 호출된 도구 (지연의 주범을 찾기 위해) */
  readonly tools?: readonly string[];
  /** STT/TTS 공급자 — 교체 효과를 비교하려면 필요하다 */
  readonly stt?: string;
  readonly tts?: string;
  /** 전사 결과 길이 (내용은 남기지 않는다 — 개인정보·현장 발화) */
  readonly transcriptChars?: number;
  readonly sttConfidence?: number;
}

/**
 * 턴 계측기. `mark()` 로 시점을 찍고 `end()` 로 한 줄 로그를 남긴다.
 *
 * 시작 시각을 생성자에서 고정하므로, 요청 핸들러 진입 즉시 생성해야
 * 네트워크 이후 구간이 온전히 잡힌다.
 */
export class TurnTimer {
  private readonly startedAt = Date.now();
  private readonly marks = new Map<keyof TurnTimings, number>();
  private meta: TurnMeta;

  constructor(meta: TurnMeta) {
    this.meta = meta;
    this.marks.set('receivedMs', 0);
  }

  /** 시점 기록. 같은 시점을 두 번 찍으면 첫 번째만 남긴다(첫 토큰 등). */
  mark(point: keyof TurnTimings): void {
    if (this.marks.has(point)) return;
    this.marks.set(point, Date.now() - this.startedAt);
  }

  /** 메타 갱신 — 라우팅 결과·도구 목록은 턴 도중에야 알 수 있다. */
  setMeta(patch: Partial<TurnMeta>): void {
    this.meta = { ...this.meta, ...patch };
  }

  get elapsedMs(): number {
    return Date.now() - this.startedAt;
  }

  timings(): TurnTimings {
    const out: Record<string, number> = {};
    for (const [k, v] of this.marks) out[k] = v;
    return out as unknown as TurnTimings;
  }

  /**
   * 턴 종료. 한 줄로 남긴다 — 로그를 grep 해서 p50/p95 를 뽑을 수 있어야 한다.
   * 실패한 턴도 반드시 기록한다(실패가 느린 경우가 많다).
   */
  end(outcome: 'ok' | 'error' | 'aborted', error?: unknown): TurnTimings {
    this.mark('totalMs');
    const t = this.timings();
    const payload = { ...this.meta, ...t, outcome, ...(error ? { err: String(error) } : {}) };
    if (outcome === 'ok') logger.info(payload, '[voice] turn');
    else logger.warn(payload, '[voice] turn');
    return t;
  }
}
