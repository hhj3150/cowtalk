// TTS 언어 계층 테스트 — 우즈벡어 답변에 한국어 발음이 섞이던 회귀 방지
//
// 배경: 우즈벡 현지인이 "음성을 알아들을 수 없다"고 보고. 원인 3가지:
//   1) 단위·약어 전처리가 언어 무관하게 한국어(도·킬로그램·인공 수정) 주입
//   2) tts-1-hd 가 우즈벡어를 러시아어·영어 억양으로 낭독 (발음 지시 불가)
//   3) STT 힌트 프롬프트가 한국어 단어라 우즈벡 발화가 한국어로 편향

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../config/index.js', () => ({
  config: {
    OPENAI_API_KEY: 'sk-test',
    OPENAI_TTS_MODEL: 'tts-1-hd',
    OPENAI_TTS_MODEL_NATIVE: 'gpt-4o-mini-tts',
    OPENAI_TTS_VOICE: 'nova',
    OPENAI_TTS_MAX_CHARS: 800,
    OPENAI_TTS_FORMAT: 'mp3',
    OPENAI_TTS_SPEED: 1.0,
    NATIVE_VOICE_LANGS: 'uz,mn',
    OPENAI_STT_MODEL: 'whisper-1',
    OPENAI_STT_MODEL_NATIVE: 'gpt-4o-transcribe',
    AZURE_SPEECH_KEY: undefined as string | undefined,
    AZURE_SPEECH_REGION: undefined as string | undefined,
    AZURE_SPEECH_VOICE_UZ: undefined as string | undefined,
    AZURE_SPEECH_VOICE_MN: undefined as string | undefined,
  },
}));

vi.mock('../../../lib/logger.js', () => ({
  logger: { info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { config } from '../../../config/index.js';
import {
  detectTtsLang,
  naturalizeForTts,
  parseLangList,
  OPENAI_TTS_INSTRUCTIONS,
  AZURE_NEURAL_VOICES,
} from '../tts-language.js';
import { buildOpenAiTtsBody, resolveTtsRoute, __testing } from '../tts.service.js';
import { resolveSttModel, resolveSttPrompt, STT_DOMAIN_PROMPTS } from '../stt.service.js';
import { buildSsml, speedToProsodyRate, isAzureTtsConfigured } from '../azure-tts.service.js';

const mutableConfig = config as unknown as Record<string, unknown>;

beforeEach(() => {
  mutableConfig.AZURE_SPEECH_KEY = undefined;
  mutableConfig.AZURE_SPEECH_REGION = undefined;
  mutableConfig.AZURE_SPEECH_VOICE_UZ = undefined;
  mutableConfig.NATIVE_VOICE_LANGS = 'uz,mn';
  __testing.clearCache();
});

describe('detectTtsLang — 답변 언어 판정', () => {
  it('한글 본문은 힌트와 무관하게 한국어', () => {
    expect(detectTtsLang('423번 소 체온이 39.8도입니다.', 'uz')).toBe('ko');
  });

  it('우즈벡 라틴 본문 (아포스트로피·특유 어휘)은 우즈벡어', () => {
    expect(detectTtsLang("423-sigirning tana harorati 39.8 daraja, bo'g'ozlik tekshiruvi kerak.")).toBe('uz');
    expect(detectTtsLang('Sigir sog’lom.', undefined)).toBe('uz'); // ’ (U+2019)
  });

  it('우즈벡 UI 힌트가 있으면 특유 어휘가 없는 라틴 문장도 우즈벡어', () => {
    expect(detectTtsLang('Hammasi yaxshi.', 'uz')).toBe('uz');
  });

  it('우즈벡 UI에서 "answer in English" 로 받은 영어 답변은 영어 — 힌트보다 본문', () => {
    // 우즈벡 특유 신호가 전혀 없는 영어 문장 + 힌트 uz → 힌트 우선(우즈벡 UI 사용자의 의도)
    // 단, 한글·키릴처럼 문자 체계가 명백히 다르면 본문을 따른다 (위 테스트)
    expect(detectTtsLang('The cow is healthy and eating well.', 'en')).toBe('en');
    expect(detectTtsLang('The cow is healthy and eating well.')).toBe('en');
  });

  it('키릴 + Өө/Үү 는 몽골어, 그 외 키릴은 러시아어', () => {
    expect(detectTtsLang('Үнээ эрүүл байна.')).toBe('mn');
    expect(detectTtsLang('Корова здорова.')).toBe('ru');
    expect(detectTtsLang('Корова здорова.', 'mn')).toBe('mn');
  });

  it('우즈벡 키릴 특유 문자 + uz 힌트는 우즈벡어', () => {
    expect(detectTtsLang('Сигир соғлом, ҳарорат нормал.', 'uz')).toBe('uz');
  });

  it('문자가 없으면 힌트, 힌트도 없으면 한국어', () => {
    expect(detectTtsLang('123 456', 'uz')).toBe('uz');
    expect(detectTtsLang('123 456')).toBe('ko');
  });
});

describe('naturalizeForTts — 언어별 단위·약어 (한국어 주입 회귀 방지)', () => {
  const uzAnswer = "423-sigir: tana harorati **39.8°C**, 12 kg/kun yem, DIM 45, AI tavsiya etiladi.\n- SCC yuqori";

  it('우즈벡어 답변에 한글이 단 한 글자도 섞이지 않는다', () => {
    const out = naturalizeForTts(uzAnswer, 'uz');
    expect(out).not.toMatch(/[가-힣]/);
  });

  it('우즈벡어 단위·약어는 우즈벡 어휘로 풀린다', () => {
    const out = naturalizeForTts(uzAnswer, 'uz');
    expect(out).toContain('39.8 daraja');
    expect(out).toContain('kuniga 12 kilogramm');
    expect(out).toContain("sog'im kunlari 45");
    expect(out).toContain("sun'iy urug'lantirish");
    expect(out).toContain('somatik hujayralar soni');
    expect(out).not.toContain('**');
  });

  it('우즈벡 아포스트로피 변형(ʻ ’ `)을 ASCII 로 통일한다', () => {
    const out = naturalizeForTts("Boʻgʻozlik va so’gʻin sigir", 'uz');
    expect(out).toBe("Bo'g'ozlik va so'g'in sigir");
  });

  it('한국어 답변은 기존 동작을 유지한다', () => {
    const out = naturalizeForTts('체온 39.8°C, 사료 12 kg/일, DIM 45, AI 권장', 'ko');
    expect(out).toBe('체온 39.8도, 사료 하루 12킬로그램, 착유 일수 45, 인공 수정 권장');
  });

  it('영어·러시아어·몽골어도 각자 언어의 어휘를 쓴다', () => {
    expect(naturalizeForTts('Temperature 39.8°C, feed 12 kg/day, AI recommended', 'en'))
      .toBe('Temperature 39.8 degrees, feed 12 kilograms per day, artificial insemination recommended');
    expect(naturalizeForTts('Температура 39.8°C, 12 kg корма', 'ru'))
      .toBe('Температура 39.8 градусов, 12 килограмм корма');
    expect(naturalizeForTts('Халуун 39.8°C, 12 kg тэжээл', 'mn'))
      .toBe('Халуун 39.8 хэм, 12 килограмм тэжээл');
  });

  it('마크다운·이모지·줄바꿈 정리는 모든 언어에 공통', () => {
    const out = naturalizeForTts('## Xulosa 🐄\n\n- **Sigir** sog\'lom\n- Yem yetarli', 'uz');
    expect(out).toBe("Xulosa. Sigir sog'lom, Yem yetarli");
  });
});

describe('resolveTtsRoute — 공급자 라우팅', () => {
  it('Azure 미설정 시 우즈벡어는 OpenAI gpt-4o-mini-tts (발음 지시 가능 모델)', () => {
    expect(resolveTtsRoute('uz')).toEqual({ provider: 'openai', model: 'gpt-4o-mini-tts', reason: 'native-lang openai-instructed' });
  });

  it('Azure 설정 시 우즈벡어는 Azure 네이티브 신경망 음성', () => {
    mutableConfig.AZURE_SPEECH_KEY = 'azure-key';
    mutableConfig.AZURE_SPEECH_REGION = 'koreacentral';
    expect(isAzureTtsConfigured()).toBe(true);
    expect(resolveTtsRoute('uz')).toEqual({ provider: 'azure', model: 'uz-UZ-MadinaNeural', reason: 'native-lang azure' });
    expect(resolveTtsRoute('mn').model).toBe('mn-MN-YesuiNeural');
  });

  it('AZURE_SPEECH_VOICE_UZ 로 음성을 교체할 수 있다', () => {
    mutableConfig.AZURE_SPEECH_KEY = 'azure-key';
    mutableConfig.AZURE_SPEECH_REGION = 'koreacentral';
    mutableConfig.AZURE_SPEECH_VOICE_UZ = 'uz-UZ-SardorNeural';
    expect(resolveTtsRoute('uz').model).toBe('uz-UZ-SardorNeural');
  });

  it('한국어·영어·러시아어는 기존 OPENAI_TTS_MODEL 경로 (비파괴)', () => {
    mutableConfig.AZURE_SPEECH_KEY = 'azure-key';
    mutableConfig.AZURE_SPEECH_REGION = 'koreacentral';
    expect(resolveTtsRoute('ko')).toEqual({ provider: 'openai', model: 'tts-1-hd', reason: 'default' });
    expect(resolveTtsRoute('en').provider).toBe('openai');
    expect(resolveTtsRoute('ru').provider).toBe('openai');
    expect(resolveTtsRoute('ko', 'tts-1').model).toBe('tts-1');
  });

  it('NATIVE_VOICE_LANGS 로 네이티브 언어 집합을 조정할 수 있다', () => {
    mutableConfig.NATIVE_VOICE_LANGS = 'uz';
    expect(resolveTtsRoute('mn').reason).toBe('default');
    expect(parseLangList(' uz , MN ,xx')).toEqual(new Set(['uz', 'mn']));
  });
});

describe('buildOpenAiTtsBody — 모델별 파라미터 분기', () => {
  const base = { voice: 'nova' as const, input: 'Salom', format: 'mp3' as const, speed: 1.05 };

  it('gpt-4o-mini-tts 는 instructions 를 보내고 speed 는 보내지 않는다', () => {
    const body = buildOpenAiTtsBody({ ...base, model: 'gpt-4o-mini-tts', lang: 'uz' });
    expect(body.instructions).toBe(OPENAI_TTS_INSTRUCTIONS.uz);
    expect(body).not.toHaveProperty('speed');
    expect(String(body.instructions)).toMatch(/Uzbek/);
    expect(String(body.instructions)).toMatch(/Never use a Russian/);
  });

  it('tts-1 계열은 speed 를 보내고 instructions 는 보내지 않는다 (400 방지)', () => {
    const body = buildOpenAiTtsBody({ ...base, model: 'tts-1-hd', lang: 'ko' });
    expect(body.speed).toBe(1.05);
    expect(body).not.toHaveProperty('instructions');
  });
});

describe('STT 언어별 모델·힌트', () => {
  it('우즈벡어·몽골어는 gpt-4o-transcribe, 그 외는 whisper-1', () => {
    expect(resolveSttModel('uz')).toBe('gpt-4o-transcribe');
    expect(resolveSttModel('mn')).toBe('gpt-4o-transcribe');
    expect(resolveSttModel('ko')).toBe('whisper-1');
    expect(resolveSttModel(undefined)).toBe('whisper-1');
  });

  it('힌트 프롬프트는 발화 언어의 어휘 — 우즈벡 발화에 한국어 힌트를 주지 않는다', () => {
    expect(resolveSttPrompt('uz')).toBe(STT_DOMAIN_PROMPTS.uz);
    expect(resolveSttPrompt('uz')).not.toMatch(/[가-힣]/);
    expect(resolveSttPrompt('uz')).toContain('sigir');
    expect(resolveSttPrompt(undefined)).toBe(STT_DOMAIN_PROMPTS.ko); // 기존 동작 유지
  });
});

describe('Azure SSML', () => {
  it('언어 태그·음성·속도가 SSML 에 반영되고 특수문자는 이스케이프된다', () => {
    const ssml = buildSsml({ text: "Sigir <sog'lom> & yaxshi", lang: 'uz', voiceName: AZURE_NEURAL_VOICES.uz.female, speed: 0.9 });
    expect(ssml).toContain('xml:lang="uz-UZ"');
    expect(ssml).toContain('<voice name="uz-UZ-MadinaNeural">');
    expect(ssml).toContain('<prosody rate="-10%">');
    expect(ssml).toContain('&lt;sog&apos;lom&gt; &amp; yaxshi');
  });

  it('속도 배율 → prosody rate 변환', () => {
    expect(speedToProsodyRate(1.0)).toBe('0%');
    expect(speedToProsodyRate(1.1)).toBe('+10%');
    expect(speedToProsodyRate(undefined)).toBe('0%');
  });
});
