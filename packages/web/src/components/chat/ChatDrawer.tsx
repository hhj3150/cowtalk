// 글로벌 AI 채팅 드로어 — CowTalk 디자인 + 음성 + 대시보드 컨텍스트

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useChat } from '@web/hooks/useChat';
import type { ChatOptions } from '@web/hooks/useChat';
import { ChatMessage } from './ChatMessage';
import { SuggestedQuestions } from './SuggestedQuestions';
import { VoiceInput } from './VoiceInput';
import { useDashboard } from '@web/hooks/useDashboard';

interface Props {
  readonly isOpen: boolean;
  readonly onClose: () => void;
}

// 대시보드 KPI를 텍스트 요약으로 변환
function buildDashboardSummary(data: { kpis: readonly { label: string; value: string | number; unit?: string }[] } | null | undefined): string | undefined {
  if (!data?.kpis || data.kpis.length === 0) return undefined;
  const lines = data.kpis.map((k) => `${k.label}: ${String(k.value)}${k.unit ?? ''}`);
  return `현재 대시보드 KPI:\n${lines.join('\n')}`;
}

export function ChatDrawer({ isOpen, onClose }: Props): React.JSX.Element | null {
  const [input, setInput] = useState('');
  const { messages, isStreaming, sendMessage, cancelStream, clearMessages } = useChat();
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const { data: dashboardData } = useDashboard();

  // 새 메시지 시 스크롤
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  // 열릴 때 입력 포커스
  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen]);

  // ESC로 닫기
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent): void {
      if (e.key === 'Escape') onClose();
    }
    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown);
      return () => document.removeEventListener('keydown', handleKeyDown);
    }
    return undefined;
  }, [isOpen, onClose]);

  const doSend = useCallback(
    (question: string) => {
      const trimmed = question.trim();
      if (!trimmed || isStreaming) return;

      const options: ChatOptions = {
        dashboardContext: buildDashboardSummary(dashboardData),
      };

      sendMessage(trimmed, options);
    },
    [isStreaming, sendMessage, dashboardData],
  );

  if (!isOpen) return null;

  function handleSubmit(e: React.FormEvent): void {
    e.preventDefault();
    doSend(input);
    setInput('');
  }

  function handleSuggestion(question: string): void {
    doSend(question);
  }

  function handleVoiceResult(text: string): void {
    setInput(text);
  }

  return (
    <>
      {/* 오버레이 (모바일) */}
      <div
        className="fixed inset-0 z-40 bg-black/20 sm:hidden"
        onClick={onClose}
        role="presentation"
      />

      {/* 드로어 패널 */}
      <div
        className="fixed bottom-0 right-0 top-0 z-50 flex w-full flex-col shadow-2xl sm:w-[400px]"
        style={{
          background: 'var(--ct-bg)',
          borderLeft: '1px solid var(--ct-border)',
        }}
      >
        {/* 헤더 */}
        <div
          className="flex items-center justify-between px-4 py-3"
          style={{
            background: 'var(--ct-card)',
            borderBottom: '1px solid var(--ct-border)',
          }}
        >
          <div className="flex items-center gap-2.5">
            <div
              className="flex h-8 w-8 items-center justify-center rounded-lg"
              style={{ background: 'var(--ct-ai-bg)' }}
            >
              <svg className="h-4 w-4" style={{ color: 'var(--ct-primary)' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
              </svg>
            </div>
            <div>
              <h3 className="text-sm font-semibold" style={{ color: 'var(--ct-text)' }}>
                CowTalk AI
              </h3>
              <p className="text-[10px]" style={{ color: 'var(--ct-text-secondary)' }}>
                {isStreaming ? '응답 생성 중...' : '데이터 기반 AI 어시스턴트'}
              </p>
            </div>
          </div>
          <div className="flex gap-1">
            {messages.length > 0 && (
              <button
                type="button"
                onClick={clearMessages}
                className="rounded-lg p-2 transition-colors"
                style={{ color: 'var(--ct-text-secondary)' }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = 'var(--ct-border)'; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
                aria-label="대화 지우기"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg p-2 transition-colors"
              style={{ color: 'var(--ct-text-secondary)' }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = 'var(--ct-border)'; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
              aria-label="닫기"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* 메시지 목록 */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3">
          {messages.length === 0 ? (
            <SuggestedQuestions onSelect={handleSuggestion} />
          ) : (
            messages.map((msg) => (
              <ChatMessage
                key={msg.id}
                message={msg}
                onFollowUp={handleSuggestion}
              />
            ))
          )}
        </div>

        {/* 스트리밍 중단 버튼 */}
        {isStreaming && (
          <div className="flex justify-center pb-2">
            <button
              type="button"
              onClick={cancelStream}
              className="rounded-full px-3 py-1 text-xs font-medium transition-colors"
              style={{
                background: 'var(--ct-border)',
                color: 'var(--ct-text-secondary)',
              }}
            >
              ■ 생성 중단
            </button>
          </div>
        )}

        {/* 입력 영역 */}
        <form
          onSubmit={handleSubmit}
          className="p-3"
          style={{
            background: 'var(--ct-card)',
            borderTop: '1px solid var(--ct-border)',
          }}
        >
          <div className="flex items-center gap-2">
            <VoiceInput onResult={handleVoiceResult} />
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="질문을 입력하세요..."
              disabled={isStreaming}
              className="flex-1 rounded-lg px-3 py-2.5 text-sm transition-colors"
              style={{
                background: 'var(--ct-bg)',
                color: 'var(--ct-text)',
                border: '1px solid var(--ct-border)',
                outline: 'none',
              }}
              onFocus={(e) => { (e.target as HTMLElement).style.borderColor = 'var(--ct-primary)'; }}
              onBlur={(e) => { (e.target as HTMLElement).style.borderColor = 'var(--ct-border)'; }}
            />
            <button
              type="submit"
              disabled={!input.trim() || isStreaming}
              className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg transition-opacity disabled:opacity-40"
              style={{ background: 'var(--ct-primary)', color: '#FFFFFF' }}
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" />
              </svg>
            </button>
          </div>
        </form>
      </div>
    </>
  );
}
