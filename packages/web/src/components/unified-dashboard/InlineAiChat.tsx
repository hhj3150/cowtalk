// 통합 대시보드 — 인라인 AI 채팅 패널 (대시보드 내장형)

import React, { useState, useRef, useEffect } from 'react';
import { useAuthStore } from '@web/stores/auth.store';
import { useFarmStore } from '@web/stores/farm.store';
import axios from 'axios';

// ── 타입 ──

interface ChatMessage {
  readonly role: 'user' | 'assistant';
  readonly content: string;
}

// ── 상수 ──

const WELCOME_MESSAGE = '안녕하세요! 146개 농장의 모든 데이터를 기반으로 답변드립니다. 무엇이든 물어보세요.';

const SUGGESTED_QUESTIONS: readonly string[] = [
  '오늘 알람 요약',
  '긴급 농장은?',
  '체온 이상 소는?',
];

// ── SSE 스트리밍 응답 파싱 ──

interface StreamChunk {
  readonly type: string;
  readonly content: string;
}

function parseStreamLines(raw: string): string {
  const lines = raw.split('\n');
  let fullText = '';

  for (const line of lines) {
    if (!line.startsWith('data: ')) continue;
    try {
      const parsed = JSON.parse(line.slice(6)) as StreamChunk;
      if (parsed.type === 'done') {
        return parsed.content;
      }
      if (parsed.type === 'text') {
        fullText += parsed.content;
      }
    } catch {
      // 파싱 실패 무시
    }
  }

  return fullText;
}

function parseFinalText(raw: string): string {
  const lines = raw.split('\n');

  for (const line of lines) {
    if (!line.startsWith('data: ')) continue;
    try {
      const parsed = JSON.parse(line.slice(6)) as StreamChunk;
      if (parsed.type === 'done') {
        return parsed.content;
      }
    } catch {
      // 무시
    }
  }

  return '';
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
        className="max-w-[85%] rounded-xl px-4 py-3 text-sm"
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

// ── 로딩 인디케이터 ──

function StreamingIndicator(): React.JSX.Element {
  return (
    <div className="flex items-center gap-2 px-3 py-2">
      <div className="flex gap-1">
        <span
          className="h-2 w-2 rounded-full animate-pulse"
          style={{ background: 'var(--ct-primary)', animationDelay: '0ms' }}
        />
        <span
          className="h-2 w-2 rounded-full animate-pulse"
          style={{ background: 'var(--ct-primary)', animationDelay: '150ms' }}
        />
        <span
          className="h-2 w-2 rounded-full animate-pulse"
          style={{ background: 'var(--ct-primary)', animationDelay: '300ms' }}
        />
      </div>
      <span className="text-xs" style={{ color: 'var(--ct-text-secondary)' }}>분석 중...</span>
    </div>
  );
}

// ── 메인 컴포넌트 ──

export function InlineAiChat(): React.JSX.Element {
  const [messages, setMessages] = useState<readonly ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingText, setStreamingText] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const accessToken = useAuthStore((s) => s.accessToken);
  const selectedFarmId = useFarmStore((s) => s.selectedFarmId);

  // 스크롤 자동 하단 이동
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, streamingText]);

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
            const raw = (evt.event?.target as XMLHttpRequest | undefined)?.responseText ?? '';
            setStreamingText(parseStreamLines(raw));
          },
        },
      );

      const raw = response.data as string;
      let finalText = parseFinalText(raw);
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

  return (
    <div
      className="ct-card flex flex-col"
      style={{ borderRadius: '12px', minHeight: '500px', overflow: 'hidden' }}
    >
      {/* 헤더 */}
      <div
        className="flex items-center gap-2 px-4 py-3"
        style={{ borderBottom: '1px solid var(--ct-border)' }}
      >
        <h3
          className="font-semibold"
          style={{ fontSize: '13px', color: 'var(--ct-text)' }}
        >
          {'\uD83E\uDD16'} AI 어시스턴트
        </h3>
        <span
          className="rounded-full px-2 py-0.5 text-xs font-medium"
          style={{
            backgroundColor: 'var(--ct-ai-bg)',
            color: 'var(--ct-ai-border)',
            border: '1px solid var(--ct-ai-border)',
          }}
        >
          Claude
        </span>
      </div>

      {/* 메시지 영역 */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto p-4 space-y-3"
        style={{ background: 'var(--ct-bg)' }}
      >
        {/* 웰컴 메시지 + 추천 질문 */}
        {messages.length === 0 && !isStreaming && (
          <div>
            <div
              className="mb-4 rounded-xl px-4 py-3 text-sm"
              style={{
                background: 'var(--ct-card)',
                border: '1px solid var(--ct-border)',
                color: 'var(--ct-text)',
                lineHeight: 1.6,
              }}
            >
              {WELCOME_MESSAGE}
            </div>
            <div className="flex flex-wrap gap-2">
              {SUGGESTED_QUESTIONS.map((q) => (
                <button
                  key={q}
                  type="button"
                  onClick={() => handleSend(q)}
                  className="rounded-full border px-3 py-1.5 text-xs transition-all"
                  style={{
                    borderColor: 'var(--ct-border)',
                    color: 'var(--ct-text)',
                    background: 'var(--ct-card)',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = 'var(--ct-primary)';
                    e.currentTarget.style.color = 'var(--ct-primary)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = 'var(--ct-border)';
                    e.currentTarget.style.color = 'var(--ct-text)';
                  }}
                >
                  {q}
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
        {isStreaming && !streamingText && <StreamingIndicator />}
      </div>

      {/* 입력 영역 */}
      <div
        className="flex items-center gap-2 border-t px-4 py-3"
        style={{ borderColor: 'var(--ct-border)', background: 'var(--ct-card)' }}
      >
        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="무엇이든 물어보세요..."
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
