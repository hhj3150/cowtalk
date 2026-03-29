// CowTalk 대화형 AI 서비스
// 사용자 질문 + 역할 + 관련 프로파일 → Claude 응답

import type { Role, ChatResponse } from '@cowtalk/shared';
import { callClaudeForChatJson, callClaudeForChat, type StreamCallbacks } from '../ai-brain/claude-client.js';
import { SYSTEM_PROMPT } from '../ai-brain/prompts/system-prompt.js';
import {
  buildConversationPrompt,
  type ConversationTurn,
} from '../ai-brain/prompts/conversation-prompt.js';
import { resolveContext } from './context-builder.js';
import { getRoleTone } from './role-tone.js';
import { logger } from '../lib/logger.js';
import { getLabelContextForEventType, formatLabelContext } from '../ai-brain/label-context.js';
import { saveChatConversation } from './chat-learner.js';

// ===========================
// 대화 메시지 (JSON 응답)
// ===========================

export interface ChatMessageRequest {
  readonly question: string;
  readonly role: Role;
  readonly farmId: string | null;
  readonly animalId: string | null;
  readonly userId?: string;
  readonly conversationHistory: readonly ConversationTurn[];
  readonly dashboardContext?: string;
}

export async function handleChatMessage(
  request: ChatMessageRequest,
): Promise<ChatResponse> {
  const { question, role, farmId, animalId, conversationHistory, dashboardContext } = request;

  // 1. 컨텍스트 해결
  const { context, detectedType } = await resolveContext(
    question, farmId, animalId, role, dashboardContext,
  );

  // 2. 레이블 컨텍스트 조회 (집단지성)
  let labelContext: string | undefined;
  if (context.type === 'animal' && context.profile.activeEvents.length > 0) {
    const primaryEvent = context.profile.activeEvents[0];
    if (primaryEvent) {
      const summary = await getLabelContextForEventType(primaryEvent.type, farmId);
      if (summary) {
        labelContext = formatLabelContext(summary, primaryEvent.type);
      }
    }
  }

  // 3. 프롬프트 빌드
  const prompt = buildConversationPrompt(
    question, role, context, conversationHistory, { labelContext },
  );

  // 3. 역할별 톤 설정
  const roleTone = getRoleTone(role);
  const systemPrompt = `${SYSTEM_PROMPT}\n\n## 톤 설정\n${roleTone.systemAddendum}\n\n## 환각 방지\n- 데이터에 포함되지 않은 수치를 절대 만들어내지 마세요.\n- 확인되지 않은 사항은 "데이터 없음"으로 명시하세요.\n- 모든 수치는 data_references에 출처를 반드시 기록하세요.`;

  // 4. Claude API 호출
  const result = await callClaudeForChatJson(systemPrompt, prompt);

  if (result) {
    const parsed = result.parsed;
    const answer = typeof parsed.answer === 'string' ? parsed.answer : '응답을 생성할 수 없습니다.';

    // 대화 저장 + 학습 신호 추출 (비동기, fire-and-forget)
    if (request.userId) {
      void saveChatConversation({
        userId: request.userId,
        role,
        animalId,
        farmId,
        question,
        answer,
        contextType: detectedType,
      });
    }

    return {
      answer,
      dataReferences: Array.isArray(parsed.data_references)
        ? parsed.data_references.filter((v): v is string => typeof v === 'string')
        : [],
      followUpSuggestions: Array.isArray(parsed.follow_up_suggestions)
        ? parsed.follow_up_suggestions.filter((v): v is string => typeof v === 'string')
        : [],
      role,
      context: detectedType,
    };
  }

  // fallback — API 키 없거나 호출 실패
  logger.warn('Claude API unavailable for chat — returning fallback');
  return buildFallbackResponse(question, role, detectedType);
}

// ===========================
// SSE 스트리밍 대화
// ===========================

export async function handleChatStream(
  request: ChatMessageRequest,
  callbacks: StreamCallbacks,
): Promise<void> {
  const { question, role, farmId, animalId, conversationHistory, dashboardContext } = request;

  const { context } = await resolveContext(
    question, farmId, animalId, role, dashboardContext,
  );

  // 레이블 컨텍스트 조회 — 개체 이벤트 기반 + 농장 단위 학습 데이터
  let labelContext: string | undefined;
  if (context.type === 'animal' && context.profile.activeEvents.length > 0) {
    const primaryEvent = context.profile.activeEvents[0];
    if (primaryEvent) {
      const summary = await getLabelContextForEventType(primaryEvent.type, farmId);
      if (summary) {
        labelContext = formatLabelContext(summary, primaryEvent.type);
      }
    }
  }

  // 농장 단위 최근 학습 패턴도 항상 주입 (팅커벨 진화 루프)
  if (!labelContext && farmId) {
    try {
      // 최근 가장 많이 발생한 이벤트 타입의 레이블 데이터
      const commonTypes = ['temperature_high', 'rumination_decrease', 'estrus', 'health_general'];
      for (const eventType of commonTypes) {
        const summary = await getLabelContextForEventType(eventType, farmId);
        if (summary) {
          labelContext = formatLabelContext(summary, eventType);
          break;
        }
      }
    } catch {
      // 레이블 데이터 없으면 무시 (비치명적)
    }
  }

  const prompt = buildConversationPrompt(
    question, role, context, conversationHistory, { streaming: true, labelContext },
  );

  const roleTone = getRoleTone(role);
  // 스트리밍: JSON 강제 제거, 자연어 텍스트 응답
  const basePrompt = SYSTEM_PROMPT.replace(
    /6\.\s*\*\*응답 형식\*\*.*?JSON 형식을 따르세요\./s,
    '6. **자연어 응답**: 사용자가 사용한 언어로 자연스럽게 답변하세요. 한국어 질문이면 한국어로, 영어면 영어로, 우즈벡어면 우즈벡어로, 러시아어면 러시아어로 답변합니다. JSON 형식으로 응답하지 마세요.',
  );
  const systemPrompt = `${basePrompt}\n\n## 톤 설정\n${roleTone.systemAddendum}\n\n## 환각 방지\n- 데이터에 포함되지 않은 수치를 절대 만들어내지 마세요.\n- 확인되지 않은 사항은 "데이터 없음"으로 명시하세요.`;

  // 스트리밍 답변을 모아서 학습에 활용
  const wrappedCallbacks: StreamCallbacks = {
    onText: (text: string) => {
      callbacks.onText(text);
    },
    onDone: (fullText: string) => {
      callbacks.onDone(fullText);
      // 대화 저장 + 학습 (비동기, fire-and-forget)
      if (request.userId) {
        void saveChatConversation({
          userId: request.userId,
          role,
          animalId,
          farmId,
          question,
          answer: fullText,
          contextType: context.type,
        });
      }
    },
    onError: callbacks.onError,
  };

  await callClaudeForChat(systemPrompt, prompt, wrappedCallbacks);
}

// ===========================
// Fallback 응답 생성
// ===========================

const FALLBACK_HINTS: Readonly<Record<string, readonly string[]>> = {
  farmer: [
    '대시보드에서 오늘의 할 일을 확인하세요.',
    '센서 장착률을 높이면 더 정확한 분석이 가능합니다.',
  ],
  veterinarian: [
    '긴급 진료 대상은 대시보드 상단에서 확인하세요.',
    '경합 해석(Decision Fusion)으로 발정/질병을 구분할 수 있습니다.',
  ],
  inseminator: [
    '발정 감지 이벤트를 대시보드에서 확인하세요.',
    '최적 수정 시간은 발정 감지 후 12~18시간입니다.',
  ],
  government_admin: [
    '관할 지역 현황은 대시보드에서 확인하세요.',
    'Top 경고 농장을 우선 점검하세요.',
  ],
  quarantine_officer: [
    '체온이상 클러스터를 대시보드에서 확인하세요.',
    '동시다발 발열은 전염병 가능성을 배제할 수 없습니다.',
  ],
  feed_company: [
    '반추이상 동물을 대시보드에서 확인하세요.',
    'pH 이상은 사료 급여 문제를 시사합니다.',
  ],
};

function buildFallbackResponse(
  _question: string,
  role: Role,
  detectedType: 'animal' | 'farm' | 'global' | 'general',
): ChatResponse {
  const hints = FALLBACK_HINTS[role] ?? [];
  const hintText = hints.length > 0
    ? `\n\n참고:\n${hints.map((h) => `• ${h}`).join('\n')}`
    : '';

  return {
    answer: `AI 엔진이 현재 사용 불가합니다. 대시보드의 데이터를 직접 확인해 주세요.${hintText}`,
    dataReferences: [],
    followUpSuggestions: ['대시보드 현황 확인', '센서 데이터 조회'],
    role,
    context: detectedType,
    isFallback: true,
  };
}

// ===========================
// 스트리밍 Fallback — 데이터 기반 응답
// ===========================

import type { ChatContext } from '../ai-brain/prompts/conversation-prompt.js';

export function buildStreamFallback(
  _question: string,
  role: Role,
  context: ChatContext,
): string {
  const lines: string[] = [];

  if (context.type === 'global' && context.globalContext) {
    const ctx = context.globalContext;
    lines.push(`📊 **CowTalk 실시간 현황** (AI 엔진 오프라인 — 데이터 직접 제공)`);
    lines.push(`\n• 관리 농장: **${String(ctx.totalFarms)}개** | 관리 두수: **${String(ctx.totalAnimals)}두**`);

    // 알람 요약
    const alarmTypes = ['calving', 'health_warning', 'temperature_warning', 'estrus', 'rumination_warning', 'activity_warning'] as const;
    const LABELS: Record<string, string> = { calving: '분만', health_warning: '건강경고', temperature_warning: '체온', estrus: '발정', rumination_warning: '반추', activity_warning: '활동' };
    const parts: string[] = [];
    for (const type of alarmTypes) {
      const animals = ctx.alarmsByType[type];
      if (animals && animals.length > 0) {
        parts.push(`${LABELS[type] ?? type} **${String(animals.length)}두**`);
      }
    }
    if (parts.length > 0) {
      lines.push(`\n**현재 알람:** ${parts.join(' | ')}`);
    }

    // 긴급 농장
    if (ctx.farmAlertRanking.length > 0) {
      lines.push(`\n**긴급 농장 TOP 5:**`);
      for (const f of ctx.farmAlertRanking.slice(0, 5)) {
        lines.push(`• ${f.farmName}: ${String(f.alertCount)}건`);
      }
    }
  } else if (context.type === 'farm' && context.profile) {
    lines.push(`📊 **${context.profile.name} 현황** (AI 엔진 오프라인)`);
    lines.push(`• 두수: ${String(context.profile.totalAnimals)}두 | 활성 알람: ${String(context.profile.activeSmaxtecEvents.length)}건`);
  } else if (context.type === 'animal' && context.profile) {
    const p = context.profile;
    lines.push(`🐄 **#${p.earTag} (${p.farmName})** (AI 엔진 오프라인)`);
    const s = p.latestSensor;
    if (s.temperature !== null) lines.push(`• 체온: ${String(s.temperature)}°C`);
    if (s.rumination !== null) lines.push(`• 반추: ${String(s.rumination)}분/일`);
    if (p.activeEvents.length > 0) {
      lines.push(`• 활성 알람: ${p.activeEvents.map((e) => e.type).join(', ')}`);
    }
  }

  if (lines.length === 0) {
    const hints = FALLBACK_HINTS[role] ?? [];
    lines.push('AI 엔진이 현재 오프라인입니다. 대시보드에서 실시간 데이터를 확인해주세요.');
    for (const h of hints) lines.push(`• ${h}`);
  }

  lines.push(`\n💡 AI 분석이 필요하면 잠시 후 다시 시도해 주세요.`);
  return lines.join('\n');
}
