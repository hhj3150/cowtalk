// Claude API 클라이언트 — Anthropic SDK 래퍼
// 이중 모델: Opus 4 (분석/해석) + Sonnet 4 (채팅/인사이트)
// 에러 시 null 반환 → fallback 트리거

import Anthropic from '@anthropic-ai/sdk';
import { config } from '../config/index.js';
import { logger } from '../lib/logger.js';
import { SYSTEM_PROMPT } from './prompts/system-prompt.js';
import { TINKERBELL_TOOLS } from './tools/tool-definitions.js';
import { executeTool } from './tools/tool-executor.js';

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

    stream.on('error', (err: Error) => {
      clearTimeout(timeout);
      logger.error({ error: err }, 'Claude chat stream error event');
      callbacks.onError(err);
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
// 대화용 호출 (스트리밍 + Tool Use)
// ===========================

const MAX_TOOL_ROUNDS = 3;

export async function callClaudeForChatWithTools(
  systemPrompt: string,
  prompt: string,
  callbacks: StreamCallbacks,
): Promise<void> {
  const anthropic = getClient();
  if (!anthropic) {
    callbacks.onError(new Error('Claude API key not configured'));
    return;
  }

  let fullText = '';
  const messages: Anthropic.MessageParam[] = [{ role: 'user', content: prompt }];

  try {
    for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
      const response = await anthropic.messages.create({
        model: config.ANTHROPIC_MODEL,
        max_tokens: config.ANTHROPIC_MAX_TOKENS_CHAT,
        temperature: 0.7,
        system: systemPrompt,
        messages,
        tools: [...TINKERBELL_TOOLS],
      });

      // 응답 content blocks 처리
      const toolUseBlocks: Anthropic.Messages.ToolUseBlock[] = [];

      for (const block of response.content) {
        if (block.type === 'text') {
          fullText += block.text;
          callbacks.onText(block.text);
        } else if (block.type === 'tool_use') {
          toolUseBlocks.push(block);
        }
      }

      // tool_use 없으면 완료
      if (response.stop_reason !== 'tool_use' || toolUseBlocks.length === 0) {
        logger.info({
          model: response.model,
          rounds: round + 1,
          inputTokens: response.usage.input_tokens,
          outputTokens: response.usage.output_tokens,
        }, '[ToolUse] 대화 완료');
        callbacks.onDone(fullText);
        return;
      }

      // tool_use 실행
      callbacks.onText('\n\n🔍 데이터 조회 중...\n\n');
      fullText += '\n\n🔍 데이터 조회 중...\n\n';

      // assistant 메시지 추가 (tool_use blocks 포함)
      messages.push({ role: 'assistant', content: response.content });

      // 각 tool 실행 후 결과 추가
      const toolResults: Anthropic.Messages.ToolResultBlockParam[] = [];
      for (const toolBlock of toolUseBlocks) {
        logger.info({ tool: toolBlock.name, input: toolBlock.input }, '[ToolUse] 도구 실행');
        const result = await executeTool(
          toolBlock.name,
          toolBlock.input as Record<string, unknown>,
        );
        toolResults.push({
          type: 'tool_result',
          tool_use_id: toolBlock.id,
          content: result,
        });
      }

      messages.push({ role: 'user', content: toolResults });
    }

    // 최대 라운드 초과
    logger.warn({ rounds: MAX_TOOL_ROUNDS }, '[ToolUse] 최대 도구 호출 횟수 초과');
    callbacks.onDone(fullText);
  } catch (error) {
    logger.error({ error }, '[ToolUse] 대화 실패');
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

const EAR_TAG_VISION_PROMPT = `이 사진에서 소의 귀에 달린 노란색 이표(ear tag)의 숫자를 읽어주세요.

사진 유형: 소 머리 전체, 소 옆모습, 또는 이표 클로즈업 모두 가능합니다.
이표가 작게 보여도 최대한 확대하여 숫자를 읽어주세요.

한국 소 이표 구조:
- 노란색 플라스틱 이표가 귀에 달려 있음
- 이표 하단에 9자리 큰 숫자가 2줄로 적혀 있음 (예: 상단 "1791" + 하단 "70780")
- 이 9자리를 이어붙이고 앞에 "002"를 추가하면 12자리 이력제번호가 됨
- 예: "179170780" → "002179170780"

읽기 우선순위:
1. 이표 하단의 큰 숫자 9자리 (가장 중요)
2. 이표 상단의 작은 바코드 아래 숫자 (보조)
3. 양쪽 귀에 이표가 있으면 더 선명한 쪽을 읽으세요

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

  // 연속 9~10자리 숫자 (이표 하단 번호) — 002가 아닌 것만
  const contiguousPattern = /\b(\d{9,10})\b/g;
  let m2a = contiguousPattern.exec(text);
  while (m2a) {
    const digits = m2a[1]!;
    if (!digits.startsWith('002')) {
      numbers.push(digits);
      if (digits.length === 9) numbers.push(`002${digits}`);
    }
    m2a = contiguousPattern.exec(text);
  }

  // 공백으로 분리된 9자리 패턴 (예: "1791 70780", "1791 7078 0")
  const splitPattern = /\b(\d{4})\s+(\d{4,5})\s*(\d?)\b/g;
  let m2b = splitPattern.exec(text);
  while (m2b) {
    const joined = (m2b[1] ?? '') + (m2b[2] ?? '') + (m2b[3] ?? '');
    const digits = joined.replace(/\s/g, '');
    if (digits.length >= 8 && digits.length <= 10 && !digits.startsWith('002')) {
      numbers.push(digits);
      if (digits.length === 9) numbers.push(`002${digits}`);
    }
    m2b = splitPattern.exec(text);
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
