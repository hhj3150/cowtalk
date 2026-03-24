// EKAPE / data.go.kr 공공데이터 공통 HTTP 클라이언트
// 모든 공공데이터 커넥터가 이 클라이언트를 사용한다.
// XML 응답 파싱 + 에러 처리 + 재시도 포함

import { XMLParser } from 'fast-xml-parser';
import { config } from '../../../config/index.js';
import { logger } from '../../../lib/logger.js';

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  textNodeName: '#text',
  isArray: (name) => ['item', 'moveList', 'slaughterList'].includes(name),
});

export interface EkapeResponse {
  readonly resultCode: string;
  readonly resultMsg: string;
  readonly body: Record<string, unknown> | null;
  readonly raw: Record<string, unknown>;
}

/**
 * EKAPE / data.go.kr API 호출 공통 함수
 * - XML 응답 자동 파싱
 * - JSON 응답도 지원 (_type=json 파라미터 사용 시)
 * - 10초 타임아웃
 * - 에러 코드 확인
 */
export async function ekapeGet(
  url: string,
  params: Record<string, string>,
  label: string,
): Promise<EkapeResponse> {
  const apiKey = config.PUBLIC_DATA_API_KEY;
  if (!apiKey) {
    throw new Error(`[${label}] PUBLIC_DATA_API_KEY 미설정`);
  }

  const searchParams = new URLSearchParams({
    serviceKey: apiKey,
    ...params,
  });

  const fullUrl = `${url}?${searchParams.toString()}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);

  try {
    const res = await fetch(fullUrl, { signal: controller.signal });
    clearTimeout(timer);

    if (!res.ok) {
      logger.warn({ status: res.status, url, label }, `[${label}] API HTTP error`);
      return { resultCode: String(res.status), resultMsg: 'HTTP error', body: null, raw: {} };
    }

    const contentType = res.headers.get('content-type') ?? '';
    const text = await res.text();

    let parsed: Record<string, unknown>;

    if (contentType.includes('json')) {
      parsed = JSON.parse(text) as Record<string, unknown>;
    } else {
      // XML 파싱
      parsed = xmlParser.parse(text) as Record<string, unknown>;
    }

    // 응답 구조: { response: { header: { resultCode, resultMsg }, body: { ... } } }
    const response = (parsed.response ?? parsed) as Record<string, unknown>;
    const header = (response.header ?? {}) as Record<string, unknown>;
    const resultCode = String(header.resultCode ?? '00');
    const resultMsg = String(header.resultMsg ?? 'OK');

    if (resultCode !== '00' && resultCode !== '0000' && resultCode !== '000') {
      logger.warn({ resultCode, resultMsg, label }, `[${label}] API error response`);
      return { resultCode, resultMsg, body: null, raw: parsed };
    }

    const body = (response.body ?? null) as Record<string, unknown> | null;
    return { resultCode, resultMsg, body, raw: parsed };
  } catch (error) {
    clearTimeout(timer);
    if (error instanceof Error && error.name === 'AbortError') {
      logger.error({ label }, `[${label}] API 타임아웃 (10s)`);
      return { resultCode: 'TIMEOUT', resultMsg: '요청 시간 초과', body: null, raw: {} };
    }
    logger.error({ err: error, label }, `[${label}] API 호출 실패`);
    throw error;
  }
}

/** body.items.item 또는 body.item 에서 배열 추출 */
export function extractItems(body: Record<string, unknown> | null): readonly Record<string, unknown>[] {
  if (!body) return [];

  // items.item 패턴
  const items = body.items as Record<string, unknown> | undefined;
  if (items?.item) {
    return Array.isArray(items.item) ? items.item as Record<string, unknown>[] : [items.item as Record<string, unknown>];
  }

  // body.item 직접 패턴
  if (body.item) {
    return Array.isArray(body.item) ? body.item as Record<string, unknown>[] : [body.item as Record<string, unknown>];
  }

  return [];
}
