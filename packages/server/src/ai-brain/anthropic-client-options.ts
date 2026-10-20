// OPS-11: Anthropic SDK 공통 옵션 — 요청 상한과 재시도 횟수를 서버가 정한다
import type { ClientOptions } from '@anthropic-ai/sdk';
import { config } from '../config/index.js';

export function anthropicClientOptions(): ClientOptions {
  return {
    apiKey: config.ANTHROPIC_API_KEY,
    timeout: config.ANTHROPIC_TIMEOUT_MS,
    maxRetries: config.ANTHROPIC_MAX_RETRIES,
  };
}
