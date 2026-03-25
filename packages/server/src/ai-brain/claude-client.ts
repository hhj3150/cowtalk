// Claude API 클라이언트 — Anthropic SDK 래퍼
// 이중 모델: Opus 4 (분석/해석) + Sonnet 4 (채팅/인사이트)
// 에러 시 null 반환 → fallback 트리거

import Anthropic from '@anthropic-ai/sdk';
import { config } from '../config/index.js';
import { logger } from '../lib/logger.js';
import { SYSTEM_PROMPT } from './prompts/system-prompt.js';

// ===========================
// 클라이언트 싱글톤
// ===========================

let client: Anthropic | null = null;

function getClient(): Anthropic | null {
  if (!config.ANTHROPIC_API_KEY) {
    return null;
  }
  if (!client) {
    client = new Anthropic({ apiKey: config.ANTHROPIC_API_KEY });
  }
  return client;
}

export function isClaudeAvailable(): boolean {
  return Boolean(config.ANTHROPIC_API_KEY);
}

// ===========================
// 분석용 호출 (JSON 응답)
// ===========================

export interface ClaudeAnalysisResult {
  readonly parsed: Record<string, unknown>;
  readonly rawText: string;
  readonly model: string;
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly durationMs: number;
}

export async function callClaudeForAnalysis(
  prompt: string,
  options?: { readonly useDeepModel?: boolean },
): Promise<ClaudeAnalysisResult | null> {
  const anthropic = getClient();
  if (!anthropic) {
    logger.warn('Claude API key not configured — skipping analysis');
    return null;
  }

  // 기본: Opus (깊은 임상 추론), useDeepModel=false 시 Sonnet
  const useDeep = options?.useDeepModel !== false;
  const model = useDeep ? config.ANTHROPIC_MODEL_DEEP : config.ANTHROPIC_MODEL;
  const startTime = Date.now();

  try {
    const response = await anthropic.messages.create({
      model,
      max_tokens: config.ANTHROPIC_MAX_TOKENS_ANALYSIS,
      temperature: 0.3,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: prompt }],
    });

    const durationMs = Date.now() - startTime;
    const rawText = extractTextContent(response);
    const parsed = parseJsonFromText(rawText);

    if (!parsed) {
      logger.error({ rawText: rawText.slice(0, 500) }, 'Failed to parse Claude JSON response');
      return null;
    }

    logger.info({
      model: response.model,
      engine: useDeep ? 'opus' : 'sonnet',
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
      durationMs,
    }, 'Claude analysis completed');

    return {
      parsed,
      rawText,
      model: response.model,
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
      durationMs,
    };
  } catch (error) {
    const durationMs = Date.now() - startTime;
    logger.error({ error, model, durationMs }, 'Claude API call failed');

    // Opus 실패 시 Sonnet으로 자동 폴백
    if (useDeep) {
      logger.warn('Opus failed — falling back to Sonnet');
      return callClaudeForAnalysis(prompt, { useDeepModel: false });
    }

    return null;
  }
}

// ===========================
// 대화용 호출 (스트리밍)
// ===========================

export interface StreamCallbacks {
  readonly onText: (text: string) => void;
  readonly onDone: (fullText: string) => void;
  readonly onError: (error: Error) => void;
}

export async function callClaudeForChat(
  systemPrompt: string,
  prompt: string,
  callbacks: StreamCallbacks,
): Promise<void> {
  const anthropic = getClient();
  if (!anthropic) {
    callbacks.onError(new Error('Claude API key not configured'));
    return;
  }

  try {
    const stream = anthropic.messages.stream({
      model: config.ANTHROPIC_MODEL,
      max_tokens: config.ANTHROPIC_MAX_TOKENS_CHAT,
      temperature: 0.7,
      system: systemPrompt,
      messages: [{ role: 'user', content: prompt }],
    });

    let fullText = '';

    // 30초 타임아웃 (무한 대기 방지)
    const timeout = setTimeout(() => {
      if (fullText.length === 0) {
        stream.abort();
        callbacks.onError(new Error('AI 응답 시간 초과 (30초)'));
      }
    }, 30000);

    stream.on('text', (text) => {
      fullText += text;
      callbacks.onText(text);
    });

    const finalMessage = await stream.finalMessage();
    clearTimeout(timeout);

    logger.info({
      model: finalMessage.model,
      inputTokens: finalMessage.usage.input_tokens,
      outputTokens: finalMessage.usage.output_tokens,
    }, 'Claude chat stream completed');

    callbacks.onDone(fullText);
  } catch (error) {
    logger.error({ error }, 'Claude chat stream failed');
    callbacks.onError(error instanceof Error ? error : new Error(String(error)));
  }
}

// ===========================
// 대화용 호출 (비스트리밍 — JSON)
// ===========================

export async function callClaudeForChatJson(
  systemPrompt: string,
  prompt: string,
): Promise<ClaudeAnalysisResult | null> {
  const anthropic = getClient();
  if (!anthropic) {
    logger.warn('Claude API key not configured — skipping chat');
    return null;
  }

  const startTime = Date.now();

  try {
    const response = await anthropic.messages.create({
      model: config.ANTHROPIC_MODEL,
      max_tokens: config.ANTHROPIC_MAX_TOKENS_CHAT,
      temperature: 0.7,
      system: systemPrompt,
      messages: [{ role: 'user', content: prompt }],
    });

    const durationMs = Date.now() - startTime;
    const rawText = extractTextContent(response);
    const parsed = parseJsonFromText(rawText);

    if (!parsed) {
      logger.error({ rawText: rawText.slice(0, 500) }, 'Failed to parse Claude chat JSON');
      return null;
    }

    return {
      parsed,
      rawText,
      model: response.model,
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
      durationMs,
    };
  } catch (error) {
    logger.error({ error, durationMs: Date.now() - startTime }, 'Claude chat API failed');
    return null;
  }
}

// ===========================
// 헬퍼
// ===========================

function extractTextContent(
  response: Anthropic.Messages.Message,
): string {
  return response.content
    .filter((block): block is Anthropic.Messages.TextBlock => block.type === 'text')
    .map((block) => block.text)
    .join('');
}

function parseJsonFromText(text: string): Record<string, unknown> | null {
  // 1차: ```json ... ``` 블록 추출
  const codeBlockMatch = /```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/.exec(text);
  if (codeBlockMatch?.[1]) {
    try {
      return JSON.parse(codeBlockMatch[1]) as Record<string, unknown>;
    } catch {
      // fallthrough
    }
  }

  // 2차: 전체 텍스트에서 JSON 파싱
  const trimmed = text.trim();
  try {
    return JSON.parse(trimmed) as Record<string, unknown>;
  } catch {
    // fallthrough
  }

  // 3차: { ... } 패턴 추출
  const jsonMatch = /\{[\s\S]*\}/.exec(trimmed);
  if (jsonMatch?.[0]) {
    try {
      return JSON.parse(jsonMatch[0]) as Record<string, unknown>;
    } catch {
      return null;
    }
  }

  return null;
}
