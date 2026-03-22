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

// ===========================
// 대화 메시지 (JSON 응답)
// ===========================

export interface ChatMessageRequest {
  readonly question: string;
  readonly role: Role;
  readonly farmId: string | null;
  readonly animalId: string | null;
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

  // 2. 프롬프트 빌드
  const prompt = buildConversationPrompt(
    question, role, context, conversationHistory,
  );

  // 3. 역할별 톤 설정
  const roleTone = getRoleTone(role);
  const systemPrompt = `${SYSTEM_PROMPT}\n\n## 톤 설정\n${roleTone.systemAddendum}\n\n## 환각 방지\n- 데이터에 포함되지 않은 수치를 절대 만들어내지 마세요.\n- 확인되지 않은 사항은 "데이터 없음"으로 명시하세요.\n- 모든 수치는 data_references에 출처를 반드시 기록하세요.`;

  // 4. Claude API 호출
  const result = await callClaudeForChatJson(systemPrompt, prompt);

  if (result) {
    const parsed = result.parsed;
    return {
      answer: typeof parsed.answer === 'string' ? parsed.answer : '응답을 생성할 수 없습니다.',
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

  const prompt = buildConversationPrompt(
    question, role, context, conversationHistory, { streaming: true },
  );

  const roleTone = getRoleTone(role);
  // 스트리밍: JSON 강제 제거, 자연어 텍스트 응답
  const basePrompt = SYSTEM_PROMPT.replace(
    /6\.\s*\*\*JSON 응답\*\*.*?JSON 외의 텍스트를 포함하지 마세요\./s,
    '6. **자연어 응답**: 사용자가 사용한 언어로 자연스럽게 답변하세요. 한국어 질문이면 한국어로, 영어면 영어로, 우즈벡어면 우즈벡어로, 러시아어면 러시아어로 답변합니다. JSON 형식으로 응답하지 마세요.',
  );
  const systemPrompt = `${basePrompt}\n\n## 톤 설정\n${roleTone.systemAddendum}\n\n## 환각 방지\n- 데이터에 포함되지 않은 수치를 절대 만들어내지 마세요.\n- 확인되지 않은 사항은 "데이터 없음"으로 명시하세요.`;

  await callClaudeForChat(systemPrompt, prompt, callbacks);
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
