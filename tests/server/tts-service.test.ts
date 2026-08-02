// TTS 서비스 — 음성 전처리 + 모델별 요청 파라미터 분기 테스트
//
// 음성 답변의 자연스러움은 대부분 "합성 전 텍스트를 어떻게 다듬는가"에서 결정된다.
// 마크다운 기호를 그대로 읽으면 "별표 별표 발정" 같은 소리가 나온다.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { synthesize, isTtsDegraded, __testing } from '@server/services/audio/tts.service';
import { config } from '@server/config/index';

const { stripMarkdownForTts, truncateToSentence, clearCache, resetDegraded } = __testing;

describe('stripMarkdownForTts', () => {
  it('마크다운 기호를 읽지 않는다', () => {
    const out = stripMarkdownForTts('**423번 소**는 *발정* 상태입니다');
    expect(out).not.toContain('*');
    expect(out).toContain('423번 소');
  });

  it('코드블록을 통째로 제거한다', () => {
    const out = stripMarkdownForTts('설명\n```js\nconst a=1;\n```\n끝');
    expect(out).not.toContain('const');
  });

  it('축산 약어를 한글 발음으로 편다', () => {
    expect(stripMarkdownForTts('DIM 120일')).toContain('착유 일수');
    expect(stripMarkdownForTts('SCC 상승')).toContain('체세포수');
    expect(stripMarkdownForTts('CMT 검사')).toContain('씨엠티');
  });

  it('온도·단위를 자연 발음으로 바꾼다', () => {
    expect(stripMarkdownForTts('체온 38.5°C')).toContain('38.5도');
    expect(stripMarkdownForTts('사료 25kg')).toContain('25킬로그램');
  });

  it('화살표·줄바꿈을 호흡(쉼표)으로 바꾼다', () => {
    const out = stripMarkdownForTts('발정 확인 → 수정 준비');
    expect(out).not.toContain('→');
    expect(out).toContain(',');
  });

  it('이모지를 제거한다', () => {
    expect(stripMarkdownForTts('🐄 423번 소 확인')).not.toMatch(/[\u{1F300}-\u{1FAFF}]/u);
  });
});

describe('truncateToSentence', () => {
  it('한도 이내면 그대로 둔다', () => {
    expect(truncateToSentence('짧은 문장.', 100)).toBe('짧은 문장.');
  });

  it('문장 경계에서 자른다', () => {
    const text = '첫 문장입니다. 둘째 문장입니다. 셋째 문장입니다.';
    const out = truncateToSentence(text, 20);
    expect(out.endsWith('.')).toBe(true);
    expect(out).not.toContain('셋째');
  });

  it('문장 경계를 못 찾으면 말줄임표를 붙인다', () => {
    const out = truncateToSentence('가'.repeat(200), 50);
    expect(out.endsWith('...')).toBe(true);
  });
});

describe('synthesize — 모델별 요청 파라미터', () => {
  const originalKey = config.OPENAI_API_KEY;
  const originalModel = config.OPENAI_TTS_MODEL;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    clearCache();
    (config as { OPENAI_API_KEY?: string }).OPENAI_API_KEY = 'sk-test-key';
    // Response 본문은 한 번만 읽을 수 있으므로 호출마다 새로 만든다
    fetchMock = vi.fn().mockImplementation(() =>
      Promise.resolve(
        new Response(new Uint8Array([1, 2, 3]), {
          status: 200,
          headers: { 'content-type': 'audio/mpeg' },
        }),
      ),
    );
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    (config as { OPENAI_API_KEY?: string }).OPENAI_API_KEY = originalKey;
    (config as { OPENAI_TTS_MODEL: string }).OPENAI_TTS_MODEL = originalModel;
    clearCache();
  });

  function lastBody(): Record<string, unknown> {
    const call = fetchMock.mock.calls[0] as [string, { body: string }];
    return JSON.parse(call[1].body) as Record<string, unknown>;
  }

  it('gpt-4o-mini-tts는 instructions를 보내고 speed는 보내지 않는다', async () => {
    await synthesize({ text: '423번 소 확인했습니다.', model: 'gpt-4o-mini-tts', instructions: '차분하게' });
    const body = lastBody();
    expect(body.model).toBe('gpt-4o-mini-tts');
    expect(body.instructions).toBe('차분하게');
    expect(body.speed).toBeUndefined();
  });

  it('구형 모델은 speed를 보내고 instructions는 무시한다', async () => {
    await synthesize({ text: '423번 소 확인했습니다.', model: 'tts-1-hd', instructions: '차분하게' });
    const body = lastBody();
    expect(body.model).toBe('tts-1-hd');
    expect(body.instructions).toBeUndefined();
    expect(body.speed).toBeDefined();
  });

  it('instructions가 다르면 캐시를 공유하지 않는다 — 음색이 달라지기 때문', async () => {
    const text = '423번 소 확인했습니다.';
    await synthesize({ text, model: 'gpt-4o-mini-tts', instructions: '차분하게' });
    await synthesize({ text, model: 'gpt-4o-mini-tts', instructions: '활기차게' });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('같은 텍스트·같은 옵션은 캐시에서 재사용한다', async () => {
    const text = '423번 소 확인했습니다.';
    await synthesize({ text, model: 'gpt-4o-mini-tts', instructions: '차분하게' });
    const second = await synthesize({ text, model: 'gpt-4o-mini-tts', instructions: '차분하게' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(second.cached).toBe(true);
  });

  it('키가 없으면 명확한 에러를 던진다', async () => {
    (config as { OPENAI_API_KEY?: string }).OPENAI_API_KEY = undefined;
    await expect(synthesize({ text: '테스트' })).rejects.toThrow(/OPENAI_API_KEY/);
  });
});

// 기본 모델을 gpt-4o-mini-tts로 올렸는데 조직 키에 권한이 없으면 음성이 통째로 죽는다.
// 운영자가 환경변수를 고치기 전까지 현장이 멈추면 안 되므로 스스로 구형 모델로 내려앉아야 한다.
describe('synthesize — 모델 권한 없을 때 자동 강등', () => {
  const originalKey = config.OPENAI_API_KEY;
  let fetchMock: ReturnType<typeof vi.fn>;

  const ok = (): Response =>
    new Response(new Uint8Array([1, 2, 3]), { status: 200, headers: { 'content-type': 'audio/mpeg' } });
  const modelDenied = (): Response =>
    new Response(JSON.stringify({ error: { message: "The model 'gpt-4o-mini-tts' does not exist or you do not have access to it." } }), { status: 403 });

  beforeEach(() => {
    clearCache();
    resetDegraded();
    (config as { OPENAI_API_KEY?: string }).OPENAI_API_KEY = 'sk-test-key';
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    (config as { OPENAI_API_KEY?: string }).OPENAI_API_KEY = originalKey;
    clearCache();
    resetDegraded();
  });

  function bodyOf(callIndex: number): Record<string, unknown> {
    const call = fetchMock.mock.calls[callIndex] as [string, { body: string }];
    return JSON.parse(call[1].body) as Record<string, unknown>;
  }

  it('모델 접근 거부 → tts-1-hd로 재시도하여 음성을 만들어낸다', async () => {
    fetchMock = vi.fn()
      .mockImplementationOnce(() => Promise.resolve(modelDenied()))
      .mockImplementationOnce(() => Promise.resolve(ok()));
    vi.stubGlobal('fetch', fetchMock);

    const result = await synthesize({ text: '423번 소 확인했습니다.', model: 'gpt-4o-mini-tts' });

    expect(result.audio.length).toBeGreaterThan(0);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(bodyOf(0).model).toBe('gpt-4o-mini-tts');
    expect(bodyOf(1).model).toBe('tts-1-hd');
    expect(isTtsDegraded()).toBe(true);
  });

  it('한 번 강등되면 이후 요청은 곧바로 구형 모델로 간다 — 실패를 반복하지 않는다', async () => {
    fetchMock = vi.fn()
      .mockImplementationOnce(() => Promise.resolve(modelDenied()))
      .mockImplementation(() => Promise.resolve(ok()));
    vi.stubGlobal('fetch', fetchMock);

    await synthesize({ text: '첫 번째 요청입니다.', model: 'gpt-4o-mini-tts' });
    fetchMock.mockClear();

    await synthesize({ text: '두 번째 요청입니다.', model: 'gpt-4o-mini-tts' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(bodyOf(0).model).toBe('tts-1-hd');
  });

  it('입력 오류(모델과 무관한 400)는 강등시키지 않는다', async () => {
    fetchMock = vi.fn().mockImplementation(() =>
      Promise.resolve(new Response(JSON.stringify({ error: { message: 'Input text is too long' } }), { status: 400 })),
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(synthesize({ text: '테스트입니다.', model: 'gpt-4o-mini-tts' })).rejects.toThrow(/OpenAI TTS/);
    expect(fetchMock).toHaveBeenCalledTimes(1); // 재시도 없음
    expect(isTtsDegraded()).toBe(false);
  });

  it('폴백도 실패하면 강등 상태를 기억하지 않는다 — 일시 장애일 수 있다', async () => {
    fetchMock = vi.fn()
      .mockImplementationOnce(() => Promise.resolve(modelDenied()))
      .mockImplementationOnce(() => Promise.resolve(new Response('', { status: 500 })));
    vi.stubGlobal('fetch', fetchMock);

    await expect(synthesize({ text: '테스트입니다.', model: 'gpt-4o-mini-tts' })).rejects.toThrow(/OpenAI TTS/);
    expect(isTtsDegraded()).toBe(false);
  });
});
