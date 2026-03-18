// 채팅 훅 — SSE 스트리밍 + 대시보드 컨텍스트

import { useState, useCallback, useRef } from 'react';
import { useAuthStore } from '@web/stores/auth.store';
import { streamChat, sendChatMessage, type ChatMessageRequest } from '@web/api/chat.api';
import type { ChatResponse } from '@cowtalk/shared';

export interface ChatMessage {
  readonly id: string;
  readonly role: 'user' | 'assistant';
  readonly content: string;
  readonly timestamp: Date;
  readonly isStreaming: boolean;
  readonly dataReferences?: readonly string[];
  readonly followUpSuggestions?: readonly string[];
  readonly isFallback?: boolean;
}

export interface ChatOptions {
  readonly animalId?: string;
  readonly farmId?: string;
  readonly useStreaming?: boolean;
  readonly dashboardContext?: string;
}

export function useChat() {
  const [messages, setMessages] = useState<readonly ChatMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const cancelRef = useRef<(() => void) | null>(null);
  const user = useAuthStore((s) => s.user);

  const sendMessage = useCallback(
    async (question: string, options?: ChatOptions) => {
      const userMsg: ChatMessage = {
        id: `user-${Date.now()}`,
        role: 'user',
        content: question,
        timestamp: new Date(),
        isStreaming: false,
      };
      setMessages((prev) => [...prev, userMsg]);

      const request: ChatMessageRequest = {
        question,
        role: user?.role,
        farmId: options?.farmId,
        animalId: options?.animalId,
        dashboardContext: options?.dashboardContext,
        conversationHistory: messages.map((m) => ({
          role: m.role,
          content: m.content,
        })),
      };

      if (options?.useStreaming !== false) {
        // SSE 스트리밍
        setIsStreaming(true);
        const assistantId = `assistant-${Date.now()}`;
        let accumulated = '';

        setMessages((prev) => [
          ...prev,
          { id: assistantId, role: 'assistant', content: '', timestamp: new Date(), isStreaming: true },
        ]);

        cancelRef.current = streamChat(
          request,
          (chunk) => {
            accumulated += chunk;
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantId ? { ...m, content: accumulated } : m,
              ),
            );
          },
          () => {
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantId ? { ...m, isStreaming: false } : m,
              ),
            );
            setIsStreaming(false);
          },
          () => {
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantId
                  ? { ...m, content: accumulated || '응답을 생성할 수 없습니다.', isStreaming: false }
                  : m,
              ),
            );
            setIsStreaming(false);
          },
        );
      } else {
        // JSON 응답 (data references 포함)
        try {
          const response: ChatResponse = await sendChatMessage(request);
          setMessages((prev) => [
            ...prev,
            {
              id: `assistant-${Date.now()}`,
              role: 'assistant',
              content: response.answer,
              timestamp: new Date(),
              isStreaming: false,
              dataReferences: response.dataReferences,
              followUpSuggestions: response.followUpSuggestions,
              isFallback: response.isFallback,
            },
          ]);
        } catch {
          setMessages((prev) => [
            ...prev,
            {
              id: `assistant-${Date.now()}`,
              role: 'assistant',
              content: 'AI 응답을 받을 수 없습니다. 잠시 후 다시 시도해 주세요.',
              timestamp: new Date(),
              isStreaming: false,
              isFallback: true,
            },
          ]);
        }
      }
    },
    [messages, user?.role],
  );

  const cancelStream = useCallback(() => {
    if (cancelRef.current) {
      cancelRef.current();
      cancelRef.current = null;
    }
    setIsStreaming(false);
  }, []);

  const clearMessages = useCallback(() => {
    setMessages([]);
  }, []);

  return {
    messages,
    isStreaming,
    sendMessage,
    cancelStream,
    clearMessages,
  };
}
