// 채팅 메시지 — 마크다운 렌더링 + 데이터 근거 표시 + 개체번호 클릭 링크

import React from 'react';
import { useNavigate } from 'react-router-dom';
import type { ChatMessage as ChatMessageType } from '@web/hooks/useChat';

interface Props {
  readonly message: ChatMessageType;
  readonly onFollowUp?: (question: string) => void;
}

// 간이 마크다운 → JSX 변환 (외부 라이브러리 없이)
function renderMarkdown(text: string, navigate?: (path: string) => void): React.JSX.Element {
  const lines = text.split('\n');
  const elements: React.JSX.Element[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? '';
    const key = `line-${i}`;

    // 빈 줄
    if (line.trim() === '') {
      elements.push(<br key={key} />);
      continue;
    }

    // 헤딩 (### → h4, ## → h3)
    const headingMatch = /^(#{2,3})\s+(.+)$/.exec(line);
    if (headingMatch) {
      const level = headingMatch[1]?.length ?? 2;
      const headingText = headingMatch[2] ?? '';
      elements.push(
        <p
          key={key}
          className={level === 2 ? 'font-bold text-sm mt-1' : 'font-semibold text-[13px] mt-0.5'}
          style={{ color: 'var(--ct-text)' }}
        >
          {renderInline(headingText, navigate)}
        </p>,
      );
      continue;
    }

    // 리스트
    if (/^[-•]\s/.test(line)) {
      elements.push(
        <div key={key} className="flex gap-1.5 pl-1">
          <span className="flex-shrink-0" style={{ color: 'var(--ct-primary)' }}>•</span>
          <span>{renderInline(line.replace(/^[-•]\s/, ''), navigate)}</span>
        </div>,
      );
      continue;
    }

    // 번호 리스트
    if (/^\d+[.)]\s/.test(line)) {
      const num = line.match(/^(\d+)[.)]/)?.[1] ?? '';
      elements.push(
        <div key={key} className="flex gap-1.5 pl-1">
          <span className="flex-shrink-0 font-medium" style={{ color: 'var(--ct-primary)' }}>{num}.</span>
          <span>{renderInline(line.replace(/^\d+[.)]\s/, ''), navigate)}</span>
        </div>,
      );
      continue;
    }

    // 일반 텍스트
    elements.push(<p key={key}>{renderInline(line, navigate)}</p>);
  }

  return <>{elements}</>;
}

// 인라인 마크다운: **bold**, `code`, #123/123번 → 개체 링크
function renderInline(text: string, navigate?: (path: string) => void): React.ReactNode {
  const parts: React.ReactNode[] = [];
  let remaining = text;
  let idx = 0;

  while (remaining.length > 0) {
    // **bold**
    const boldMatch = /\*\*(.+?)\*\*/.exec(remaining);
    // `code`
    const codeMatch = /`([^`]+)`/.exec(remaining);
    // 귀표번호 패턴: #423, #1234, 423번
    const earTagMatch = /(?:#(\d{1,6})\b|(\d{1,6})번)/.exec(remaining);

    const matches = [
      boldMatch ? { match: boldMatch, type: 'bold' as const } : null,
      codeMatch ? { match: codeMatch, type: 'code' as const } : null,
      earTagMatch ? { match: earTagMatch, type: 'earTag' as const } : null,
    ]
      .filter((m): m is NonNullable<typeof m> => m !== null)
      .sort((a, b) => (a.match.index ?? 0) - (b.match.index ?? 0));

    if (matches.length === 0) {
      parts.push(remaining);
      break;
    }

    const first = matches[0];
    if (!first) {
      parts.push(remaining);
      break;
    }

    const matchIndex = first.match.index ?? 0;
    if (matchIndex > 0) {
      parts.push(remaining.slice(0, matchIndex));
    }

    if (first.type === 'bold') {
      parts.push(
        <strong key={`b-${idx}`} className="font-semibold" style={{ color: 'var(--ct-text)' }}>
          {first.match[1]}
        </strong>,
      );
    } else if (first.type === 'earTag') {
      const earTag = first.match[1] ?? first.match[2] ?? '';
      parts.push(
        <button
          key={`et-${idx}`}
          type="button"
          onClick={() => navigate?.(`/cow/${earTag}`)}
          className="inline font-semibold underline decoration-dotted underline-offset-2"
          style={{ color: 'var(--ct-primary)', background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontSize: 'inherit' }}
        >
          {first.match[0]}
        </button>,
      );
    } else {
      parts.push(
        <code
          key={`c-${idx}`}
          className="rounded px-1 py-0.5 text-[11px]"
          style={{ background: 'var(--ct-border)', color: 'var(--ct-primary)' }}
        >
          {first.match[1]}
        </code>,
      );
    }

    remaining = remaining.slice(matchIndex + (first.match[0]?.length ?? 0));
    idx++;
  }

  return parts.length === 1 ? parts[0] : <>{parts}</>;
}

export function ChatMessage({ message, onFollowUp }: Props): React.JSX.Element {
  const navigate = useNavigate();
  const isUser = message.role === 'user';
  const refs = message.dataReferences ?? [];
  const followUps = message.followUpSuggestions ?? [];

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div
        className="max-w-[85%] rounded-xl px-3.5 py-2.5 text-sm"
        style={
          isUser
            ? { background: 'var(--ct-primary)', color: '#FFFFFF' }
            : { background: 'var(--ct-ai-bg)', color: 'var(--ct-text)', border: '1px solid var(--ct-border)' }
        }
      >
        {/* 메시지 본문 (마크다운 + 개체번호 링크) */}
        <div className="whitespace-pre-wrap leading-relaxed">
          {isUser ? message.content : renderMarkdown(message.content, navigate)}
        </div>

        {/* 스트리밍 표시 */}
        {message.isStreaming && (
          <span className="mt-1 inline-flex items-center gap-1 text-xs opacity-60">
            <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full" style={{ background: 'var(--ct-primary)' }} />
            생성 중...
          </span>
        )}

        {/* Fallback 표시 */}
        {message.isFallback && !isUser && (
          <div
            className="mt-2 flex items-center gap-1.5 rounded px-2 py-1 text-[10px]"
            style={{ background: 'var(--ct-border)', color: 'var(--ct-text-secondary)' }}
          >
            <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
            </svg>
            오프라인 응답
          </div>
        )}

        {/* 데이터 근거 (data references) */}
        {refs.length > 0 && !isUser && (
          <div className="mt-2 border-t pt-2" style={{ borderColor: 'var(--ct-border)' }}>
            <p className="mb-1 text-[10px] font-medium" style={{ color: 'var(--ct-text-secondary)' }}>
              📊 근거 데이터
            </p>
            <div className="flex flex-wrap gap-1">
              {refs.map((ref, i) => (
                <span
                  key={`ref-${i}`}
                  className="rounded px-1.5 py-0.5 text-[10px]"
                  style={{ background: 'var(--ct-primary-light)', color: 'var(--ct-primary)' }}
                >
                  {ref}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* 후속 질문 제안 */}
        {followUps.length > 0 && !isUser && onFollowUp && (
          <div className="mt-2 flex flex-wrap gap-1">
            {followUps.map((q, i) => (
              <button
                key={`fu-${i}`}
                type="button"
                onClick={() => onFollowUp(q)}
                className="rounded-full px-2 py-0.5 text-[10px] transition-colors"
                style={{
                  border: '1px solid var(--ct-border)',
                  color: 'var(--ct-primary)',
                  background: 'transparent',
                }}
              >
                {q}
              </button>
            ))}
          </div>
        )}

        {/* 시간 */}
        <p
          className="mt-1.5 text-[10px]"
          style={{ color: isUser ? 'rgba(255,255,255,0.6)' : 'var(--ct-text-secondary)' }}
        >
          {message.timestamp.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}
        </p>
      </div>
    </div>
  );
}
