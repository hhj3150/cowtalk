// Azure AI Speech (Neural TTS) — 우즈벡어·몽골어 네이티브 음성 공급자
// 사용처: tts.service.ts (NATIVE_VOICE_LANGS 에 속한 언어 + AZURE_SPEECH_KEY 설정 시)
//
// 왜 별도 공급자인가: OpenAI TTS는 우즈벡어를 공식 품질 보증 언어로 두지 않아
// 러시아어·영어 억양으로 읽힌다. Azure는 uz-UZ-MadinaNeural / uz-UZ-SardorNeural 등
// 현지 원어민 데이터로 학습한 신경망 음성을 제공한다. (몽골어 mn-MN 도 동일)
//
// REST: POST https://{region}.tts.speech.microsoft.com/cognitiveservices/v1  (SSML → mp3)
// 키·리전은 Azure Portal → Speech 리소스 → Keys and Endpoint.
// 보안: 키는 응답·로그에 절대 노출하지 않는다.

import { config } from '../../config/index.js';
import { logger } from '../../lib/logger.js';
import { TTS_LANG_TAG, type TtsLang } from './tts-language.js';

export interface AzureSynthesizeOptions {
  readonly text: string;
  readonly lang: TtsLang;
  readonly voiceName: string;   // 예: uz-UZ-MadinaNeural
  readonly speed?: number;      // 1.0 = 기본 (OpenAI speed 와 동일 스케일)
}

export interface AzureSynthesizeResult {
  readonly audio: Buffer;
  readonly contentType: string;
}

export function isAzureTtsConfigured(): boolean {
  return Boolean(config.AZURE_SPEECH_KEY && config.AZURE_SPEECH_REGION);
}

function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/** OpenAI speed(1.0 기준 배율) → SSML prosody rate ("+10%" / "-5%") */
export function speedToProsodyRate(speed: number | undefined): string {
  const s = typeof speed === 'number' && Number.isFinite(speed) ? speed : 1.0;
  const pct = Math.round((s - 1) * 100);
  if (pct === 0) return '0%';
  return `${pct > 0 ? '+' : ''}${pct}%`;
}

export function buildSsml(opts: AzureSynthesizeOptions): string {
  const langTag = TTS_LANG_TAG[opts.lang];
  const rate = speedToProsodyRate(opts.speed);
  return `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="${langTag}">`
    + `<voice name="${escapeXml(opts.voiceName)}">`
    + `<prosody rate="${rate}">${escapeXml(opts.text)}</prosody>`
    + '</voice></speak>';
}

export async function synthesizeWithAzure(opts: AzureSynthesizeOptions): Promise<AzureSynthesizeResult> {
  const key = config.AZURE_SPEECH_KEY;
  const region = config.AZURE_SPEECH_REGION;
  if (!key || !region) {
    throw new Error('AZURE_SPEECH_KEY/AZURE_SPEECH_REGION 미설정 — Azure 네이티브 음성 사용 불가');
  }

  const ssml = buildSsml(opts);
  const startedAt = Date.now();
  const response = await fetch(`https://${region}.tts.speech.microsoft.com/cognitiveservices/v1`, {
    method: 'POST',
    headers: {
      'Ocp-Apim-Subscription-Key': key,
      'Content-Type': 'application/ssml+xml',
      'X-Microsoft-OutputFormat': 'audio-24khz-48kbitrate-mono-mp3',
      'User-Agent': 'CowTalk-v5-TTS',
    },
    body: ssml,
  });

  if (!response.ok) {
    const errBody = await response.text().catch(() => '');
    logger.error(
      { status: response.status, body: errBody.slice(0, 300), voice: opts.voiceName, lang: opts.lang, region },
      '[azure-tts] API error',
    );
    // tts.service 의 상위 에러 포맷("OpenAI TTS 실패 (HTTP nnn)")과 동일 규약 — 라우트가 상태코드를 추출한다
    throw new Error(`Azure TTS 실패 (HTTP ${String(response.status)})`);
  }

  const audio = Buffer.from(await response.arrayBuffer());
  logger.info(
    { voice: opts.voiceName, lang: opts.lang, chars: opts.text.length, audioBytes: audio.length, elapsedMs: Date.now() - startedAt },
    '[azure-tts] synthesized',
  );
  return { audio, contentType: 'audio/mpeg' };
}
