// Claude API 클라이언트 — Anthropic SDK 래퍼
// 이중 모델: Opus 4 (분석/해석) + Sonnet 4 (채팅/인사이트)
// 에러 시 null 반환 → fallback 트리거

import Anthropic from '@anthropic-ai/sdk';
import { config } from '../config/index.js';
import { logger } from '../lib/logger.js';
import { SYSTEM_PROMPT } from './prompts/system-prompt.js';
import { TINKERBELL_TOOLS } from './tools/tool-definitions.js';
import { executeToolWithGateway, TOOL_DOMAIN_MAP, ROLE_TOOL_ACCESS, type ToolCallContext } from './tools/tool-gateway.js';

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
// Prompt Caching 헬퍼
// 시스템 프롬프트(~10K 토큰)을 캐시하면 반복 호출 시 비용 90%↓ + 지연 단축.
// TTL 기본 5분 (자동 연장).
// ===========================

function buildCachedSystem(systemPrompt: string): Anthropic.TextBlockParam[] {
  return [
    {
      type: 'text',
      text: systemPrompt,
      cache_control: { type: 'ephemeral' },
    },
  ];
}

// 도구 정의 캐싱 — 마지막 도구에만 cache_control 부착하면 전체 도구 배열이 캐시됨
function buildCachedTools(tools: readonly Anthropic.Messages.Tool[]): Anthropic.Messages.Tool[] {
  if (tools.length === 0) return [];
  const head = tools.slice(0, -1);
  const last = tools[tools.length - 1]!;
  return [
    ...head,
    { ...last, cache_control: { type: 'ephemeral' } } as Anthropic.Messages.Tool,
  ];
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
      system: buildCachedSystem(SYSTEM_PROMPT),
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

export interface ToolEvent {
  readonly phase: 'start' | 'result';
  readonly toolName: string;
  readonly toolDomain: string;
  readonly success?: boolean;
  readonly executionMs?: number;
}

export interface StreamCallbacks {
  readonly onText: (text: string) => void;
  readonly onDone: (fullText: string) => void;
  readonly onError: (error: Error) => void;
  readonly onToolEvent?: (event: ToolEvent) => void;
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
      temperature: config.ANTHROPIC_TEMPERATURE_CHAT,
      system: buildCachedSystem(systemPrompt),
      messages: [{ role: 'user', content: prompt }],
    });

    let fullText = '';

    // 60초 타임아웃 (도구 호출 포함 시 30초로는 부족)
    const timeout = setTimeout(() => {
      if (fullText.length === 0) {
        stream.abort();
        callbacks.onError(new Error('AI 응답 시간 초과 (60초)'));
      }
    }, 60000);

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

const MAX_TOOL_ROUNDS = 4;

// Extended Thinking 트리거 휴리스틱 — 진짜 깊은 추론이 필요한 케이스만
// 일상 대화·짧은 질문에는 절대 활성화하지 않음 (지연 2~5초 발생)
// 시연 D-4 — 보수적으로: 1~3% 케이스만 활성화
const DEEP_REASONING_KEYWORDS = [
  '감별진단', 'differential diagnosis',
  '확산 시뮬레이션', '확산 예측',
  '근교계수', '유전체 평가',
] as const;

export function shouldUseDeepThinking(userMessage: string): boolean {
  if (config.ANTHROPIC_THINKING_BUDGET <= 0) return false;
  // 매우 긴 질문(400자+)만 자동 활성화 — 농장주 일상 질문은 보통 100자 미만
  if (userMessage.length >= 400) return true;
  const lower = userMessage.toLowerCase();
  return DEEP_REASONING_KEYWORDS.some((kw) => lower.includes(kw.toLowerCase()));
}

export interface ChatToolOptions {
  readonly useDeepThinking?: boolean;
  /** Vision: 첨부 이미지를 첫 user message의 content blocks 앞에 image 블록으로 삽입 */
  readonly images?: readonly { data: string; mimeType: ImageMediaType }[];
  /** Files: 첨부 PDF — Claude 네이티브 document block (base64) */
  readonly pdfs?: readonly { data: string; filename?: string }[];
}

export async function callClaudeForChatWithTools(
  systemPrompt: string,
  prompt: string,
  callbacks: StreamCallbacks,
  toolContext?: ToolCallContext,
  options?: ChatToolOptions,
): Promise<void> {
  const anthropic = getClient();
  if (!anthropic) {
    callbacks.onError(new Error('Claude API key not configured'));
    return;
  }

  let fullText = '';

  // Vision + Files: 이미지·PDF가 있으면 content blocks 형태로 첫 user message 구성.
  // 순서: [document(pdf), document(pdf), ..., image, image, ..., text] — Anthropic 권장
  const hasImages = !!(options?.images && options.images.length > 0);
  const hasPdfs = !!(options?.pdfs && options.pdfs.length > 0);
  const initialUserContent: string | Anthropic.MessageParam['content'] =
    hasImages || hasPdfs
      ? [
          ...(options?.pdfs ?? []).map((pdf) => ({
            type: 'document' as const,
            source: { type: 'base64' as const, media_type: 'application/pdf' as const, data: pdf.data },
            ...(pdf.filename ? { title: pdf.filename } : {}),
          })),
          ...(options?.images ?? []).map((img) => ({
            type: 'image' as const,
            source: { type: 'base64' as const, media_type: img.mimeType, data: img.data },
          })),
          { type: 'text' as const, text: prompt },
        ]
      : prompt;

  const messages: Anthropic.MessageParam[] = [{ role: 'user', content: initialUserContent }];

  // 역할별 도구 필터링 — Claude에 허용된 도구만 전달 (토큰 절약 + 보안)
  const role = toolContext?.role ?? 'farmer';
  const allowedToolNames = ROLE_TOOL_ACCESS[role];
  const filteredTools = allowedToolNames
    ? TINKERBELL_TOOLS.filter((t) => allowedToolNames.includes(t.name))
    : [...TINKERBELL_TOOLS];

  // Extended Thinking 활성화 여부 (감별진단 등 복잡 추론용)
  const useThinking = options?.useDeepThinking === true && config.ANTHROPIC_THINKING_BUDGET > 0;
  const thinkingParam: { thinking?: { type: 'enabled'; budget_tokens: number } } = useThinking
    ? { thinking: { type: 'enabled', budget_tokens: config.ANTHROPIC_THINKING_BUDGET } }
    : {};

  logger.info({
    role,
    toolCount: filteredTools.length,
    total: TINKERBELL_TOOLS.length,
    model: config.ANTHROPIC_MODEL,
    thinking: useThinking ? config.ANTHROPIC_THINKING_BUDGET : 0,
  }, '[ToolUse] 역할별 도구 필터링');

  try {
    for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
      const response = await anthropic.messages.create({
        model: config.ANTHROPIC_MODEL,
        max_tokens: config.ANTHROPIC_MAX_TOKENS_CHAT,
        // Extended Thinking 사용 시 temperature는 1로 강제됨 (Anthropic 제약)
        temperature: useThinking ? 1 : config.ANTHROPIC_TEMPERATURE_CHAT,
        ...thinkingParam,
        system: buildCachedSystem(systemPrompt),
        messages,
        tools: buildCachedTools(filteredTools),
      });

      // 응답 content blocks 처리
      const toolUseBlocks: Anthropic.Messages.ToolUseBlock[] = [];
      let roundTextLen = 0;

      for (const block of response.content) {
        if (block.type === 'text') {
          fullText += block.text;
          roundTextLen += block.text.length;
          callbacks.onText(block.text);
        } else if (block.type === 'tool_use') {
          toolUseBlocks.push(block);
        }
      }

      logger.info({
        round: round + 1,
        stopReason: response.stop_reason,
        blocks: response.content.length,
        roundTextLen,
        toolCalls: toolUseBlocks.length,
      }, '[ToolUse] 라운드 응답');

      // tool_use 없으면 완료
      if (response.stop_reason !== 'tool_use' || toolUseBlocks.length === 0) {
        logger.info({
          model: response.model,
          rounds: round + 1,
          inputTokens: response.usage.input_tokens,
          outputTokens: response.usage.output_tokens,
          fullTextLen: fullText.length,
        }, '[ToolUse] 대화 완료');

        // 빈 응답 방어 — Claude가 도구도 안 부르고 텍스트도 없이 종료한 경우
        if (fullText.length === 0) {
          const reason = `Claude가 빈 응답을 반환했습니다 (stop_reason=${response.stop_reason}, model=${response.model}). 잠시 후 다시 시도해 주세요.`;
          logger.warn({ stopReason: response.stop_reason, usage: response.usage }, '[ToolUse] 빈 응답 감지 — onError로 전환');
          callbacks.onError(new Error(reason));
          return;
        }
        callbacks.onDone(fullText);
        return;
      }

      // tool_use 실행
      // assistant 메시지 추가 (tool_use blocks 포함)
      messages.push({ role: 'assistant', content: response.content });

      // 각 tool 병렬 실행 — 한 라운드의 도구들은 모두 독립적이므로 동시 호출 가능
      // (직렬 실행 시 도구 13개×2.5s=32s → 병렬 시 가장 느린 하나의 시간만 소요)
      const gatewayContext: ToolCallContext = toolContext ?? { role: 'farmer' };

      // 모든 도구 시작 이벤트를 먼저 발사 (UI 표시 즉시 가능)
      for (const toolBlock of toolUseBlocks) {
        const domain = TOOL_DOMAIN_MAP[toolBlock.name] ?? 'unknown';
        callbacks.onToolEvent?.({ phase: 'start', toolName: toolBlock.name, toolDomain: domain });
        logger.info({ tool: toolBlock.name, input: toolBlock.input }, '[ToolUse] 도구 실행 (병렬)');
      }

      // Promise.all로 병렬 실행
      const settled = await Promise.all(
        toolUseBlocks.map((toolBlock) =>
          executeToolWithGateway(
            toolBlock.name,
            toolBlock.input as Record<string, unknown>,
            gatewayContext,
          ),
        ),
      );

      // 결과 이벤트 발사 + tool_result 블록 생성
      const toolResults: Anthropic.Messages.ToolResultBlockParam[] = [];
      for (let i = 0; i < toolUseBlocks.length; i++) {
        const toolBlock = toolUseBlocks[i]!;
        const gatewayResult = settled[i]!;
        const domain = TOOL_DOMAIN_MAP[toolBlock.name] ?? 'unknown';

        callbacks.onToolEvent?.({
          phase: 'result',
          toolName: toolBlock.name,
          toolDomain: domain,
          success: gatewayResult.success,
          executionMs: gatewayResult.executionMs,
        });

        toolResults.push({
          type: 'tool_result',
          tool_use_id: toolBlock.id,
          content: gatewayResult.result,
        });
      }

      messages.push({ role: 'user', content: toolResults });
    }

    // 최대 라운드 초과 — 도구 없이 한 번 더 호출해 강제로 텍스트 답변 생성
    // (특히 영어/우즈벡어/몽골어 응답에서 Claude가 도구 호출에 갇혀 빈 응답을 내는 케이스 방지)
    logger.warn({ rounds: MAX_TOOL_ROUNDS, fullTextLen: fullText.length }, '[ToolUse] 최대 도구 호출 초과 — 도구 없이 final round 시도');
    try {
      // 명시적 wrap-up 지시 추가 — Claude가 더 이상 도구를 부르지 않고 답변하도록 강제
      const wrapUpMessages: Anthropic.MessageParam[] = [
        ...messages,
        {
          role: 'user',
          content: '위 도구 결과들을 바탕으로 최종 답변을 지금 작성해 주세요. 더 이상 도구를 호출하지 마세요. 사용자 질문에 대한 직접적이고 완전한 답변만 자연어로 작성하세요.',
        },
      ];
      const finalResponse = await anthropic.messages.create({
        model: config.ANTHROPIC_MODEL,
        max_tokens: config.ANTHROPIC_MAX_TOKENS_CHAT,
        temperature: config.ANTHROPIC_TEMPERATURE_CHAT_FINAL,
        system: buildCachedSystem(systemPrompt),
        messages: wrapUpMessages,
        // tools 미전달 → 강제 텍스트 응답
      });

      let finalRoundLen = 0;
      for (const block of finalResponse.content) {
        if (block.type === 'text') {
          fullText += block.text;
          finalRoundLen += block.text.length;
          callbacks.onText(block.text);
        }
      }
      logger.info({
        rounds: MAX_TOOL_ROUNDS + 1,
        finalRoundLen,
        fullTextLen: fullText.length,
        stopReason: finalResponse.stop_reason,
      }, '[ToolUse] final round 완료');
    } catch (finalErr) {
      logger.error({ err: finalErr }, '[ToolUse] final round 실패');
    }

    if (fullText.length === 0) {
      callbacks.onError(new Error(`도구 호출 ${MAX_TOOL_ROUNDS}회 + final round 후에도 답변이 생성되지 않았습니다. 질문을 단순화해 주세요.`));
      return;
    }
    callbacks.onDone(fullText);
  } catch (error) {
    // Anthropic SDK 에러는 status/message 상세 포함
    const errObj = error as { status?: number; message?: string; name?: string; error?: unknown };
    logger.error({
      error,
      status: errObj.status,
      message: errObj.message,
      name: errObj.name,
      model: config.ANTHROPIC_MODEL,
    }, '[ToolUse] 대화 실패');
    const detail = errObj.status
      ? `[Claude ${errObj.status}] ${errObj.message ?? 'unknown'} (model=${config.ANTHROPIC_MODEL})`
      : errObj.message ?? String(error);
    callbacks.onError(error instanceof Error ? error : new Error(detail));
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
      temperature: config.ANTHROPIC_TEMPERATURE_CHAT,
      system: buildCachedSystem(systemPrompt),
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
