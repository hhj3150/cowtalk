// 오디오 모델 레지스트리 — "쓸 수 있는 것 중 최상위"를 확정하는지 검증
//
// 핵심 계약:
//   1) 신형 모델이 열려 있으면 반드시 신형을 쓴다 (업그레이드가 실제로 적용됨)
//   2) 운영자가 환경변수로 고정했으면 그 뜻이 조회 결과보다 우선한다
//   3) 조회 실패는 강등 근거가 아니다 — 선호 1순위를 그대로 쓰고 unverified로 표시한다
//   4) 조회에 성공한 결과만 캐시한다 (일시 장애로 구형이 고착되지 않도록)

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  getAudioModels,
  resetAudioModelCache,
  TTS_PREFERENCE,
  STT_PREFERENCE,
} from '@server/services/audio/model-registry';
import { config } from '@server/config/index';

/** OpenAI GET /v1/models 응답 흉내 */
function modelsResponse(ids: readonly string[]): Response {
  return new Response(JSON.stringify({ data: ids.map((id) => ({ id })) }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

const ALL_MODERN = [
  'gpt-4o-mini-tts', 'tts-1-hd', 'tts-1',
  'gpt-4o-transcribe', 'gpt-4o-mini-transcribe', 'whisper-1',
  'gpt-4o', 'text-embedding-3-small',
];

const LEGACY_ONLY = ['tts-1-hd', 'tts-1', 'whisper-1', 'gpt-4o'];

describe('model-registry — 최신 모델 확정', () => {
  const originalKey = config.OPENAI_API_KEY;
  const originalTtsEnv = process.env.OPENAI_TTS_MODEL;
  const originalSttEnv = process.env.OPENAI_STT_MODEL;

  beforeEach(() => {
    resetAudioModelCache();
    (config as { OPENAI_API_KEY?: string }).OPENAI_API_KEY = 'sk-test-key';
    // 핀이 걸려 있으면 조회 결과를 무시하므로, 조회 경로 테스트에서는 비워둔다
    delete process.env.OPENAI_TTS_MODEL;
    delete process.env.OPENAI_STT_MODEL;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    resetAudioModelCache();
    (config as { OPENAI_API_KEY?: string }).OPENAI_API_KEY = originalKey;
    if (originalTtsEnv === undefined) delete process.env.OPENAI_TTS_MODEL;
    else process.env.OPENAI_TTS_MODEL = originalTtsEnv;
    if (originalSttEnv === undefined) delete process.env.OPENAI_STT_MODEL;
    else process.env.OPENAI_STT_MODEL = originalSttEnv;
  });

  it('신형 모델이 열려 있으면 신형을 쓴다 — 업그레이드가 실제로 적용된다', async () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => Promise.resolve(modelsResponse(ALL_MODERN))));

    const models = await getAudioModels();

    expect(models.tts).toBe('gpt-4o-mini-tts');
    expect(models.stt).toBe('gpt-4o-transcribe');
    expect(models.ttsSource).toBe('probed-best');
    expect(models.sttSource).toBe('probed-best');
    expect(models.probeError).toBeUndefined();
    // 선호 1순위와 일치해야 "최신" 판정이 난다
    expect(models.tts).toBe(TTS_PREFERENCE[0]);
    expect(models.stt).toBe(STT_PREFERENCE[0]);
  });

  it('신형이 없으면 사용 가능한 차선을 고른다 — 무작정 1순위를 밀지 않는다', async () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => Promise.resolve(modelsResponse(LEGACY_ONLY))));

    const models = await getAudioModels();

    expect(models.tts).toBe('tts-1-hd');
    expect(models.stt).toBe('whisper-1');
    expect(models.ttsSource).toBe('probed-best');
  });

  it('중간 등급만 있으면 그것을 고른다', async () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() =>
      Promise.resolve(modelsResponse(['tts-1-hd', 'gpt-4o-mini-transcribe', 'whisper-1'])),
    ));

    const models = await getAudioModels();
    expect(models.stt).toBe('gpt-4o-mini-transcribe');
  });

  it('환경변수로 고정하면 조회 결과보다 우선한다 — 운영자 의도 존중', async () => {
    process.env.OPENAI_TTS_MODEL = 'tts-1';
    process.env.OPENAI_STT_MODEL = 'whisper-1';
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => Promise.resolve(modelsResponse(ALL_MODERN))));

    const models = await getAudioModels();

    expect(models.tts).toBe('tts-1');
    expect(models.stt).toBe('whisper-1');
    expect(models.ttsSource).toBe('env-pinned');
    expect(models.sttSource).toBe('env-pinned');
  });

  it('조회 실패는 강등 근거가 아니다 — 선호 1순위를 그대로 쓴다', async () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => Promise.reject(new Error('network down'))));

    const models = await getAudioModels();

    expect(models.tts).toBe(TTS_PREFERENCE[0]);
    expect(models.stt).toBe(STT_PREFERENCE[0]);
    expect(models.ttsSource).toBe('preferred-unverified');
    expect(models.probeError).toContain('network');
  });

  it('조회 실패 결과는 캐시하지 않는다 — 회복되면 다음 호출에서 확정된다', async () => {
    const fetchMock = vi.fn()
      .mockImplementationOnce(() => Promise.reject(new Error('일시 장애')))
      .mockImplementation(() => Promise.resolve(modelsResponse(ALL_MODERN)));
    vi.stubGlobal('fetch', fetchMock);

    const first = await getAudioModels();
    expect(first.ttsSource).toBe('preferred-unverified');

    const second = await getAudioModels();
    expect(second.ttsSource).toBe('probed-best');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('성공한 조회는 캐시한다 — 매 요청마다 모델 목록을 다시 묻지 않는다', async () => {
    const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(modelsResponse(ALL_MODERN)));
    vi.stubGlobal('fetch', fetchMock);

    await getAudioModels();
    await getAudioModels();
    await getAudioModels();

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('동시 호출이 겹쳐도 조회는 한 번만 나간다', async () => {
    const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(modelsResponse(ALL_MODERN)));
    vi.stubGlobal('fetch', fetchMock);

    const [a, b, c] = await Promise.all([getAudioModels(), getAudioModels(), getAudioModels()]);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(a.tts).toBe(b.tts);
    expect(b.tts).toBe(c.tts);
  });

  it('키가 없으면 조회하지 않고 사유를 남긴다', async () => {
    (config as { OPENAI_API_KEY?: string }).OPENAI_API_KEY = undefined;
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const models = await getAudioModels();

    expect(fetchMock).not.toHaveBeenCalled();
    expect(models.probeError).toContain('OPENAI_API_KEY');
    expect(models.ttsSource).toBe('preferred-unverified');
  });

  it('오디오 모델 목록만 진단용으로 추려 노출한다', async () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => Promise.resolve(modelsResponse(ALL_MODERN))));

    const models = await getAudioModels();

    expect(models.availableAudioModels).toContain('gpt-4o-mini-tts');
    expect(models.availableAudioModels).toContain('whisper-1');
    // 오디오와 무관한 모델은 빼서 진단을 읽기 쉽게 한다
    expect(models.availableAudioModels).not.toContain('text-embedding-3-small');
  });

  it('HTTP 오류 응답도 조회 실패로 다룬다 (강등 아님)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() =>
      Promise.resolve(new Response('unauthorized', { status: 401 })),
    ));

    const models = await getAudioModels();

    expect(models.ttsSource).toBe('preferred-unverified');
    expect(models.probeError).toContain('401');
  });
});
