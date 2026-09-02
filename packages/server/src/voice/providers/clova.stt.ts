// CLOVA Speech Recognition (CSR) 어댑터 — 한국어 정확도 우선 경로.
//
// ⚠️ 키가 없어 실 호출로 검증하지 못했다. 키 확보 후 반드시 스모크 테스트할 것.
//    (엔드포인트·헤더 이름은 네이버 클라우드 문서 기준으로 작성)
//
// 왜 이 공급자인가: 국내 특화 엔진은 한국어 문자오류율이 Whisper 의 절반 수준이고,
// 무엇보다 **부스팅(도메인 단어 등록)** 이 명확하다. 개체번호와 축산 용어를
// 미리 등록할 수 있다는 점이 이 제품에서는 정확도 수치보다 중요하다.
//
// Phase 1 은 push-to-talk(짧은 발화)이므로 단문 인식 API 를 쓴다.
// 연속 대화(Phase 2)로 가면 스트리밍 엔드포인트로 교체해야 한다.

import { config } from '../../config/index.js';
import { logger } from '../../lib/logger.js';
import type { SttProvider, SttRequest, SttResult } from './stt.port.js';

const CSR_ENDPOINT = 'https://naveropenapi.apigw.ntruss.com/recog/v1/stt';

/** contentType → CSR lang 파라미터 (Kor/Eng/Jpn/Chn) */
function toClovaLang(language?: string): string {
  switch ((language ?? 'ko').slice(0, 2)) {
    case 'en': return 'Eng';
    case 'ja': return 'Jpn';
    case 'zh': return 'Chn';
    default: return 'Kor';
  }
}

export const clovaStt: SttProvider = {
  name: 'clova',

  isConfigured(): boolean {
    return Boolean(config.CLOVA_CLIENT_ID && config.CLOVA_CLIENT_SECRET);
  },

  async transcribe(req: SttRequest): Promise<SttResult> {
    if (!clovaStt.isConfigured()) {
      throw new Error('CLOVA_CLIENT_ID/SECRET 미설정 — CLOVA STT 사용 불가');
    }
    const started = Date.now();
    const url = `${CSR_ENDPOINT}?lang=${toClovaLang(req.language)}`;

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'X-NCP-APIGW-API-KEY-ID': config.CLOVA_CLIENT_ID as string,
        'X-NCP-APIGW-API-KEY': config.CLOVA_CLIENT_SECRET as string,
        'Content-Type': 'application/octet-stream',
      },
      body: new Uint8Array(req.audio),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      logger.error({ status: res.status, body: body.slice(0, 300) }, '[voice/clova-stt] 전사 실패');
      throw new Error(`CLOVA STT 실패 (${res.status})`);
    }

    const json = (await res.json()) as { text?: string; confidence?: number };
    return {
      text: (json.text ?? '').trim(),
      ...(typeof json.confidence === 'number' ? { confidence: json.confidence } : {}),
      language: req.language ?? 'ko',
      durationMs: Date.now() - started,
    };
  },
};
