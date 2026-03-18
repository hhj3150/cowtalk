// AI 채팅 패널 — 대시보드 내장 질의응답
// "오늘 응급을 요하는 소는?" 등 자연어 질문 → DB 기반 AI 응답

import React, { useState, useRef, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiGet } from '@web/api/client';
import { useAuthStore } from '@web/stores/auth.store';
import { useFarmStore } from '@web/stores/farm.store';
import axios from 'axios';

// ── 타입 ──

interface ChatMessage {
  readonly role: 'user' | 'assistant';
  readonly content: string;
}

interface SuggestionsResponse {
  readonly suggestions: readonly string[];
  readonly aiAvailable: boolean;
}

// ── 메인 컴포넌트 ──

export function AiChatPanel(): React.JSX.Element {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<readonly ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingText, setStreamingText] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const accessToken = useAuthStore((s) => s.accessToken);
  const selectedFarmId = useFarmStore((s) => s.selectedFarmId);

  const { data: suggestionsData } = useQuery({
    queryKey: ['chat', 'suggestions'],
    queryFn: () => apiGet<SuggestionsResponse>('/chat/suggestions'),
    staleTime: 5 * 60 * 1000,
  });

  const suggestions = suggestionsData?.suggestions ?? [];

  // 스크롤 자동 하단 이동
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, streamingText]);

  // 열릴 때 입력에 포커스
  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen]);

  async function handleSend(question: string): Promise<void> {
    const trimmed = question.trim();
    if (!trimmed || isStreaming) return;

    const newMessages: readonly ChatMessage[] = [...messages, { role: 'user', content: trimmed }];
    setMessages(newMessages);
    setInput('');
    setIsStreaming(true);
    setStreamingText('');

    try {
      const response = await axios.post(
        '/api/chat/stream',
        {
          question: trimmed,
          farmId: selectedFarmId ?? undefined,
          conversationHistory: newMessages.slice(-10).map((m) => ({
            role: m.role,
            content: m.content,
          })),
        },
        {
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${accessToken}`,
          },
          responseType: 'text',
          onDownloadProgress: (evt) => {
            const raw = evt.event?.target?.responseText ?? '';
            const lines = raw.split('\n');
            let fullText = '';
            for (const line of lines) {
              if (!line.startsWith('data: ')) continue;
              try {
                const parsed = JSON.parse(line.slice(6)) as { type: string; content: string };
                if (parsed.type === 'done') {
                  fullText = parsed.content;
                } else if (parsed.type === 'text') {
                  fullText += parsed.content;
                }
              } catch {
                // 파싱 실패 무시
              }
            }
            setStreamingText(fullText);
          },
        },
      );

      // 완료 — 최종 텍스트 파싱
      const raw = response.data as string;
      const lines = raw.split('\n');
      let finalText = '';
      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        try {
          const parsed = JSON.parse(line.slice(6)) as { type: string; content: string };
          if (parsed.type === 'done') {
            finalText = parsed.content;
          }
        } catch {
          // 무시
        }
      }

      if (!finalText) finalText = streamingText || 'AI 응답을 받지 못했습니다.';

      setMessages([...newMessages, { role: 'assistant', content: finalText }]);
      setStreamingText('');
    } catch {
      setMessages([...newMessages, { role: 'assistant', content: '응답을 받지 못했습니다. 다시 시도해 주세요.' }]);
      setStreamingText('');
    } finally {
      setIsStreaming(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent): void {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend(input);
    }
  }

  // 닫힌 상태 — FAB 버튼
  if (!isOpen) {
    return (
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="fixed bottom-6 right-6 z-50 flex h-14 w-14 items-center justify-center rounded-full shadow-xl transition-all hover:scale-105"
        style={{ background: 'var(--ct-primary)', color: '#ffffff' }}
      >
        <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 2.25c5.385 0 9.75 4.365 9.75 9.75s-4.365 9.75-9.75 9.75S2.25 17.385 2.25 12 6.615 2.25 12 2.25z" />
        </svg>
      </button>
    );
  }

  // 열린 상태 — 채팅 패널
  return (
    <div
      className="fixed bottom-6 right-6 z-50 flex flex-col shadow-2xl"
      style={{
        width: 400,
        height: 520,
        borderRadius: 16,
        background: 'var(--ct-card)',
        border: '1px solid var(--ct-border)',
        overflow: 'hidden',
      }}
    >
      {/* 헤더 */}
      <div
        className="flex items-center justify-between px-4 py-3"
        style={{ background: 'var(--ct-primary)', color: '#ffffff' }}
      >
        <div className="flex items-center gap-2">
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
          </svg>
          <span className="text-sm font-semibold">CowTalk AI</span>
        </div>
        <button
          type="button"
          onClick={() => setIsOpen(false)}
          className="rounded-lg p-1 transition-colors hover:bg-white/20"
        >
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
          </svg>
        </button>
      </div>

      {/* 메시지 영역 */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3" style={{ background: 'var(--ct-bg)' }}>
        {/* 빈 상태 — 추천 질문 */}
        {messages.length === 0 && !isStreaming && (
          <div>
            <p className="mb-3 text-xs" style={{ color: 'var(--ct-text-secondary)' }}>
              데이터 기반으로 답변합니다. 무엇이든 물어보세요.
            </p>
            <div className="flex flex-wrap gap-2">
              {suggestions.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => handleSend(s)}
                  className="rounded-full border px-3 py-1.5 text-xs transition-all"
                  style={{
                    borderColor: 'var(--ct-border)',
                    color: 'var(--ct-text)',
                    background: 'var(--ct-card)',
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--ct-primary)'; e.currentTarget.style.color = 'var(--ct-primary)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--ct-border)'; e.currentTarget.style.color = 'var(--ct-text)'; }}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* 대화 메시지 */}
        {messages.map((msg, idx) => (
          <ChatBubble key={idx} role={msg.role} content={msg.content} />
        ))}

        {/* 스트리밍 중 */}
        {isStreaming && streamingText && (
          <ChatBubble role="assistant" content={streamingText} />
        )}
        {isStreaming && !streamingText && (
          <div className="flex items-center gap-2 px-3 py-2">
            <div className="flex gap-1">
              <span className="h-2 w-2 rounded-full animate-pulse" style={{ background: 'var(--ct-primary)', animationDelay: '0ms' }} />
              <span className="h-2 w-2 rounded-full animate-pulse" style={{ background: 'var(--ct-primary)', animationDelay: '150ms' }} />
              <span className="h-2 w-2 rounded-full animate-pulse" style={{ background: 'var(--ct-primary)', animationDelay: '300ms' }} />
            </div>
            <span className="text-xs" style={{ color: 'var(--ct-text-secondary)' }}>분석 중...</span>
          </div>
        )}
      </div>

      {/* 입력 영역 */}
      <div
        className="flex items-center gap-2 border-t px-3 py-3"
        style={{ borderColor: 'var(--ct-border)', background: 'var(--ct-card)' }}
      >
        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="오늘 응급을 요하는 소는?"
          disabled={isStreaming}
          className="flex-1 rounded-lg border px-3 py-2 text-sm outline-none transition-colors"
          style={{
            borderColor: 'var(--ct-border)',
            background: 'var(--ct-bg)',
            color: 'var(--ct-text)',
            opacity: isStreaming ? 0.5 : 1,
          }}
          onFocus={(e) => { e.target.style.borderColor = 'var(--ct-primary)'; }}
          onBlur={(e) => { e.target.style.borderColor = 'var(--ct-border)'; }}
        />
        <button
          type="button"
          onClick={() => handleSend(input)}
          disabled={isStreaming || !input.trim()}
          className="flex h-9 w-9 items-center justify-center rounded-lg transition-all"
          style={{
            background: input.trim() && !isStreaming ? 'var(--ct-primary)' : 'var(--ct-bg)',
            color: input.trim() && !isStreaming ? '#ffffff' : 'var(--ct-text-secondary)',
            cursor: input.trim() && !isStreaming ? 'pointer' : 'default',
          }}
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" />
          </svg>
        </button>
      </div>
    </div>
  );
}

// ── 채팅 말풍선 ──

function ChatBubble({
  role,
  content,
}: {
  readonly role: 'user' | 'assistant';
  readonly content: string;
}): React.JSX.Element {
  const isUser = role === 'user';

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div
        className="max-w-[85%] rounded-xl px-3 py-2 text-sm"
        style={{
          background: isUser ? 'var(--ct-primary)' : 'var(--ct-card)',
          color: isUser ? '#ffffff' : 'var(--ct-text)',
          border: isUser ? 'none' : '1px solid var(--ct-border)',
          whiteSpace: 'pre-wrap',
          lineHeight: 1.6,
        }}
      >
        {content}
      </div>
    </div>
  );
}
