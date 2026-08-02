// 오디오 모델 레지스트리 — 쓸 수 있는 것 중 "가장 좋은 것"을 확정한다.
//
// 왜 이렇게 하는가:
//   기본 모델을 신형으로 올려두고 "실패하면 구형으로 내려앉기"는 틀린 설계다.
//   - 실패해야만 알 수 있고 (현장 사용자가 첫 피해자)
//   - 한 번 내려앉으면 조용히 구형으로 굳어 업그레이드가 무산된다.
//
//   그래서 반대로 간다: 부팅 시 OpenAI에 "이 키로 뭘 쓸 수 있냐"고 직접 물어서
//   선호 순위 중 실제 사용 가능한 최상위를 확정한다. 요청 시점에는 이미 검증된 모델만 쓴다.
//   확정 결과는 로그와 /api/audio/health로 노출해 눈으로 확인할 수 있다.
//
// 우선순위 원칙:
//   1) 운영자가 환경변수로 명시했으면 그 뜻을 따른다 (수동 핀 고정)
//   2) 아니면 선호 순위 중 사용 가능한 최상위
//   3) 조회 자체가 실패하면 선호 1순위를 그대로 쓴다 — 조회 실패를 강등 근거로 삼지 않는다

import { config } from '../../config/index.js';
import { logger } from '../../lib/logger.js';
import type { TtsModel } from './tts.service.js';
import type { SttModel } from './stt.service.js';

/** TTS 선호 순위 — 앞이 우선. gpt-4o-mini-tts는 자연성·비용·말투지시 모두 우월. */
export const TTS_PREFERENCE: readonly TtsModel[] = ['gpt-4o-mini-tts', 'tts-1-hd', 'tts-1'];

/** STT 선호 순위 — gpt-4o-transcribe가 한국어 축산 전문어에서 whisper-1보다 확연히 낫다. */
export const STT_PREFERENCE: readonly SttModel[] = ['gpt-4o-transcribe', 'gpt-4o-mini-transcribe', 'whisper-1'];

export interface ResolvedAudioModels {
  readonly tts: TtsModel;
  readonly stt: SttModel;
  /** 각 모델이 어떻게 정해졌는지 — health 응답과 로그에 그대로 실린다 */
  readonly ttsSource: ModelSource;
  readonly sttSource: ModelSource;
  /** 조회로 확인된 오디오 모델 목록 (진단용) */
  readonly availableAudioModels: readonly string[];
  /** 모델 목록 조회에 실패했다면 그 사유 */
  readonly probeError?: string;
  readonly resolvedAt: string;
}

export type ModelSource =
  | 'env-pinned'      // 운영자가 환경변수로 명시
  | 'probed-best'     // 조회 결과 사용 가능한 최상위
  | 'preferred-unverified'; // 조회 실패 — 선호 1순위를 그대로 사용

/** 환경변수로 "명시" 되었는지. config는 기본값을 채우므로 원본 env를 봐야 한다. */
function envPinned(name: string): string | undefined {
  const raw = process.env[name];
  return raw && raw.trim() ? raw.trim() : undefined;
}

interface ModelListResponse {
  readonly data?: ReadonlyArray<{ id?: string }>;
}

/** OpenAI가 이 키에 허용한 모델 id 집합. 실패 시 null (강등 근거로 쓰지 않음). */
async function fetchAvailableModels(apiKey: string, timeoutMs = 8000): Promise<Set<string> | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch('https://api.openai.com/v1/models', {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: controller.signal,
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`HTTP ${String(res.status)} ${body.slice(0, 200)}`);
    }
    const json = (await res.json()) as ModelListResponse;
    const ids = (json.data ?? []).map((m) => m.id).filter((id): id is string => typeof id === 'string');
    return new Set(ids);
  } finally {
    clearTimeout(timer);
  }
}

function pickBest<T extends string>(
  preference: readonly T[],
  available: Set<string> | null,
): { model: T; source: ModelSource } {
  const first = preference[0]!;
  if (!available) return { model: first, source: 'preferred-unverified' };
  const found = preference.find((m) => available.has(m));
  // 선호 목록 중 아무것도 없다는 건 조회 결과가 이상한 것 — 1순위를 그대로 쓰고 요청 시점 에러로 드러낸다
  if (!found) return { model: first, source: 'preferred-unverified' };
  return { model: found, source: 'probed-best' };
}

// 한 번만 조회하고 결과를 재사용한다. 실패한 조회는 캐시하지 않아 다음 요청에서 재시도된다.
let resolvedCache: ResolvedAudioModels | null = null;
let inflight: Promise<ResolvedAudioModels> | null = null;

async function doResolve(): Promise<ResolvedAudioModels> {
  const apiKey = config.OPENAI_API_KEY;
  const ttsPin = envPinned('OPENAI_TTS_MODEL') as TtsModel | undefined;
  const sttPin = envPinned('OPENAI_STT_MODEL') as SttModel | undefined;

  let available: Set<string> | null = null;
  let probeError: string | undefined;

  if (apiKey) {
    try {
      available = await fetchAvailableModels(apiKey);
    } catch (err) {
      probeError = err instanceof Error ? err.message : String(err);
    }
  } else {
    probeError = 'OPENAI_API_KEY 미설정';
  }

  const ttsPicked = ttsPin
    ? { model: ttsPin, source: 'env-pinned' as ModelSource }
    : pickBest(TTS_PREFERENCE, available);
  const sttPicked = sttPin
    ? { model: sttPin, source: 'env-pinned' as ModelSource }
    : pickBest(STT_PREFERENCE, available);

  const audioModels = available
    ? [...available].filter((id) => /tts|whisper|transcribe|audio/i.test(id)).sort()
    : [];

  const result: ResolvedAudioModels = {
    tts: ttsPicked.model,
    stt: sttPicked.model,
    ttsSource: ttsPicked.source,
    sttSource: sttPicked.source,
    availableAudioModels: audioModels,
    probeError,
    resolvedAt: new Date().toISOString(),
  };

  // 결과를 소리 내어 알린다 — 신형이 안 잡혔다면 조용히 넘어가지 않는다.
  if (probeError) {
    logger.warn(
      { probeError, tts: result.tts, stt: result.stt },
      '[audio-models] 모델 목록 조회 실패 — 선호 모델을 그대로 사용한다 (강등 아님)',
    );
  } else {
    const ttsBelowBest = ttsPicked.source === 'probed-best' && result.tts !== TTS_PREFERENCE[0];
    const sttBelowBest = sttPicked.source === 'probed-best' && result.stt !== STT_PREFERENCE[0];
    if (ttsBelowBest || sttBelowBest) {
      logger.error(
        { tts: result.tts, stt: result.stt, availableAudioModels: audioModels },
        '[audio-models] 최신 음성 모델을 이 키로 쓸 수 없다 — OpenAI 대시보드에서 모델 접근 권한을 확인하라',
      );
    } else {
      logger.info(
        { tts: result.tts, stt: result.stt, ttsSource: result.ttsSource, sttSource: result.sttSource },
        '[audio-models] 음성 모델 확정',
      );
    }
  }

  return result;
}

/** 확정된 오디오 모델. 첫 호출에서 조회하고 이후 재사용한다. */
export async function getAudioModels(): Promise<ResolvedAudioModels> {
  if (resolvedCache) return resolvedCache;
  inflight ??= doResolve()
    .then((r) => {
      // 조회에 성공했을 때만 굳힌다 — 일시적 네트워크 실패로 선호 모델이 고착되지 않도록
      if (!r.probeError) resolvedCache = r;
      return r;
    })
    .finally(() => { inflight = null; });
  return inflight;
}

/** 부팅 시 미리 확정해두기 위한 워밍 (실패해도 서버 기동을 막지 않는다) */
export function warmAudioModels(): void {
  void getAudioModels().catch((err: unknown) => {
    logger.warn({ err }, '[audio-models] 워밍 실패 — 첫 요청 시 재시도한다');
  });
}

/** 테스트·운영 진단용 — 캐시를 비워 다음 호출에서 다시 조회하게 한다 */
export function resetAudioModelCache(): void {
  resolvedCache = null;
  inflight = null;
}
