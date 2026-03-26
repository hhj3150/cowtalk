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
// Vision 호출 (이표 번호 인식)
// ===========================

export interface VisionResult {
  readonly numbers: readonly string[];
  readonly confidence: 'high' | 'medium' | 'low';
  readonly rawText: string;
  readonly model: string;
  readonly durationMs: number;
}

const EAR_TAG_VISION_PROMPT = `이 사진에서 노란색 소 이표(ear tag)의 숫자를 읽어주세요.

중요: 왼쪽 귀의 노란 이표 하단에 큰 숫자가 있습니다. 예: "1791" 위에 "7078 0" 아래.
이 숫자들을 모두 이어 붙이고 앞에 "002"를 추가하세요.
예: 하단이 "1791" + "70780" → "002179170780"

JSON으로만 응답하세요:
{"numbers":["002179170780"],"confidence":"high"}`;

type ImageMediaType = 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp';

export async function callClaudeForVision(
  base64Image: string,
  mimeType: string,
): Promise<VisionResult | null> {
  const anthropic = getClient();
  if (!anthropic) {
    logger.warn('Claude API key not configured — skipping vision');
    return null;
  }

  const startTime = Date.now();

  try {
    const response = await anthropic.messages.create({
      model: config.ANTHROPIC_MODEL, // Sonnet (비용 효율 + Vision 충분)
      max_tokens: 500,
      temperature: 0.1, // 정확도 최우선
      messages: [{
        role: 'user',
        content: [
          {
            type: 'image',
            source: {
              type: 'base64',
              media_type: mimeType as ImageMediaType,
              data: base64Image,
            },
          },
          {
            type: 'text',
            text: EAR_TAG_VISION_PROMPT,
          },
        ],
      }],
    });

    const durationMs = Date.now() - startTime;
    const rawText = extractTextContent(response);

    logger.info({ rawText: rawText.slice(0, 500) }, 'Claude Vision raw response');

    const parsed = parseJsonFromText(rawText);

    let numbers = Array.isArray(parsed?.numbers)
      ? (parsed.numbers as string[]).map((n) => String(n).replace(/[\s-]/g, ''))
      : [];

    // JSON 파싱 실패 시 → 원문에서 숫자 패턴 직접 추출 (폴백)
    if (numbers.length === 0) {
      numbers = extractNumbersFromText(rawText);
      logger.info({ fallbackNumbers: numbers }, 'Vision JSON parse failed, using text fallback');
    }

    const confidence = (['high', 'medium', 'low'] as const).includes(
      parsed?.confidence as 'high' | 'medium' | 'low',
    )
      ? (parsed!.confidence as 'high' | 'medium' | 'low')
      : numbers.length > 0 ? 'medium' : 'low';

    logger.info({
      model: response.model,
      numbers,
      confidence,
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
      durationMs,
    }, 'Claude Vision ear tag scan completed');

    return { numbers, confidence, rawText, model: response.model, durationMs };
  } catch (error) {
    logger.error({ error, durationMs: Date.now() - startTime }, 'Claude Vision API failed');
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

/** Vision 응답 텍스트에서 숫자 패턴 직접 추출 (JSON 파싱 실패 시 폴백) */
function extractNumbersFromText(text: string): string[] {
  const numbers: string[] = [];

  // 12자리 이력제번호 패턴 (002로 시작)
  const tracePattern = /002\d{9}/g;
  let match = tracePattern.exec(text);
  while (match) {
    numbers.push(match[0]);
    match = tracePattern.exec(text);
  }

  // 9자리 숫자 (하단 번호, 002 없이) — 자동으로 002 접두사 추가
  const nineDigitPattern = /\b(\d{4})\s*(\d{4,5})\s*(\d?)\b/g;
  let m2 = nineDigitPattern.exec(text);
  while (m2) {
    const joined = (m2[1] ?? '') + (m2[2] ?? '') + (m2[3] ?? '');
    const digits = joined.replace(/\s/g, '');
    if (digits.length >= 8 && digits.length <= 10) {
      numbers.push(digits);
      // 9자리면 002 추가
      if (digits.length === 9) {
        numbers.push(`002${digits}`);
      }
    }
    m2 = nineDigitPattern.exec(text);
  }

  // 관리번호 패턴 (영문+숫자, 예: G5, A12)
  const mgmtPattern = /\b([A-Z]\d{1,3})\b/g;
  let m3 = mgmtPattern.exec(text);
  while (m3) {
    numbers.push(m3[1]!);
    m3 = mgmtPattern.exec(text);
  }

  // 중복 제거
  return [...new Set(numbers)];
}
