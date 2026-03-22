// 지니 (Genie) — CowTalk 음성 AI 어시스턴트
// "지니야" 호출 → 음성 입력 → Claude AI 해석 → 음성 응답
// 현장 축산인을 위한 hands-free 인터페이스

import React, { useState, useRef, useCallback, useEffect } from 'react';
import { useAuthStore } from '@web/stores/auth.store';
import { useFarmStore } from '@web/stores/farm.store';
import { useIsMobile } from '@web/hooks/useIsMobile';
import axios from 'axios';

// ── 타입 ──

interface GeniMessage {
  readonly role: 'user' | 'assistant';
  readonly content: string;
  readonly timestamp: Date;
}

type GeniState = 'idle' | 'listening' | 'thinking' | 'speaking';

interface StreamChunk {
  readonly type: string;
  readonly content: string;
}

// ── 음성 합성 (TTS) ──

function speak(text: string, onEnd?: () => void): void {
  if (!('speechSynthesis' in window)) {
    onEnd?.();
    return;
  }

  window.speechSynthesis.cancel();

  const cleanText = text
    .replace(/[#*_`>\-|]/g, '')
    .replace(/\d+\.\s/g, ', ')
    .replace(/\n{2,}/g, '. ')
    .replace(/\n/g, ', ')
    .replace(/\s{2,}/g, ' ')
    .replace(/\.{2,}/g, '.')
    .slice(0, 400);

  const utterance = new SpeechSynthesisUtterance(cleanText);
  utterance.lang = 'ko-KR';
  utterance.rate = 0.95;
  utterance.pitch = 1.05;

  const voices = window.speechSynthesis.getVoices();
  const koVoice = voices.find((v) => v.lang.startsWith('ko'));
  if (koVoice) utterance.voice = koVoice;

  utterance.onend = () => onEnd?.();
  utterance.onerror = () => onEnd?.();

  window.speechSynthesis.speak(utterance);
}

function stopSpeaking(): void {
  if ('speechSynthesis' in window) {
    window.speechSynthesis.cancel();
  }
}

// ── 맥락 인식 추천 질문 ──

interface DashboardContext {
  readonly totalAlarms: number;
  readonly criticalCount: number;
  readonly healthIssues: number;
  readonly farmCount: number;
  readonly animalCount: number;
}

function getContextualSuggestions(ctx?: DashboardContext): readonly string[] {
  const base: string[] = [];

  if (ctx) {
    if (ctx.criticalCount > 0) {
      base.push(`긴급 알람 ${ctx.criticalCount}건 상세 알려줘`);
    }
    if (ctx.healthIssues > 0) {
      base.push(`건강 이상 ${ctx.healthIssues}두 원인 분석해줘`);
    }
    base.push('오늘 가장 먼저 해야 할 일은?');
    base.push('번식성적 어때?');
    base.push('발정 감지된 소 알려줘');
  } else {
    base.push('오늘 긴급한 소 알려줘');
    base.push('전체 농장 현황 요약');
    base.push('번식성적 분석해줘');
  }

  return base.slice(0, 4);
}

// ── 메인 컴포넌트 ──

interface GeniVoiceAssistantProps {
  readonly dashboardContext?: DashboardContext;
}

export function GeniVoiceAssistant({
  dashboardContext,
}: GeniVoiceAssistantProps): React.JSX.Element {
  const [state, setState] = useState<GeniState>('idle');
  const [isOpen, setIsOpen] = useState(false);
  const isMobile = useIsMobile();
  const [messages, setMessages] = useState<readonly GeniMessage[]>([]);
  const [transcript, setTranscript] = useState('');
  const [inputText, setInputText] = useState('');
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const transcriptRef = useRef('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const user = useAuthStore((s) => s.user);
  const selectedFarmId = useFarmStore((s) => s.selectedFarmId);

  const suggestions = getContextualSuggestions(dashboardContext);

  // 음성 인식 지원 여부
  const hasSpeechRecognition = typeof window !== 'undefined' &&
    ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window);

  // 스크롤
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // TTS 보이스 로드
  useEffect(() => {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.getVoices();
    }
  }, []);

  // AI에 질문 전송
  const askGeni = useCallback(async (question: string) => {
    const userMsg: GeniMessage = { role: 'user', content: question, timestamp: new Date() };
    setMessages((prev) => [...prev, userMsg]);
    setState('thinking');

    try {
      const token = useAuthStore.getState().accessToken;
      const response = await axios.post<string>(
        '/api/chat/stream',
        {
          question: `[음성 대화 모드] 물어본 것에만 간결하게 3문장 이내로 답변해주세요. 불필요한 부연설명 없이 핵심만 말해주세요.\n\n질문: ${question}`,
          role: user?.role ?? 'farm_owner',
          farmId: selectedFarmId ?? undefined,
          dashboardContext: dashboardContext
            ? `현재 대시보드: 총 알람 ${dashboardContext.totalAlarms}건, 긴급 ${dashboardContext.criticalCount}건, 건강이상 ${dashboardContext.healthIssues}두, ${dashboardContext.farmCount}개 농장, ${dashboardContext.animalCount}두 관리 중`
            : undefined,
          conversationHistory: messages.slice(-6).map((m) => ({
            role: m.role,
            content: m.content,
          })),
        },
        {
          headers: { Authorization: `Bearer ${token}` },
          responseType: 'text',
        },
      );

      const raw = typeof response.data === 'string' ? response.data : '';
      const lines = raw.split('\n');
      let fullText = '';

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        try {
          const parsed = JSON.parse(line.slice(6)) as StreamChunk;
          if (parsed.type === 'done') {
            fullText = parsed.content;
            break;
          }
          if (parsed.type === 'text') {
            fullText += parsed.content;
          }
        } catch {
          // skip
        }
      }

      const answer = fullText || '응답을 생성할 수 없습니다.';
      const assistantMsg: GeniMessage = { role: 'assistant', content: answer, timestamp: new Date() };
      setMessages((prev) => [...prev, assistantMsg]);

      setState('speaking');
      speak(answer, () => setState('idle'));
    } catch {
      const errorMsg: GeniMessage = {
        role: 'assistant',
        content: '네트워크 오류가 발생했습니다. 다시 시도해주세요.',
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, errorMsg]);
      setState('idle');
    }
  }, [messages, user?.role, selectedFarmId, dashboardContext]);

  // 음성 인식 시작
  const startListening = useCallback(() => {
    if (!hasSpeechRecognition) return;

    stopSpeaking();

    const SpeechRecognitionClass = window.SpeechRecognition || window.webkitSpeechRecognition;
    const recognition = new SpeechRecognitionClass();
    recognition.lang = 'ko-KR';
    recognition.continuous = false;
    recognition.interimResults = true;

    recognition.onstart = () => {
      setState('listening');
      setTranscript('');
      transcriptRef.current = '';
    };

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      let interim = '';
      let finalText = '';
      for (let i = 0; i < event.results.length; i++) {
        const result = event.results[i];
        if (result && result[0]) {
          if (result.isFinal) {
            finalText += result[0].transcript;
          } else {
            interim += result[0].transcript;
          }
        }
      }
      const text = finalText || interim;
      setTranscript(text);
      transcriptRef.current = text;
    };

    recognition.onend = () => {
      const finalText = transcriptRef.current.trim();
      if (finalText) {
        askGeni(finalText);
      } else {
        setState('idle');
      }
      transcriptRef.current = '';
    };

    recognition.onerror = () => {
      setState('idle');
      setTranscript('');
      transcriptRef.current = '';
    };

    recognitionRef.current = recognition;
    recognition.start();
  }, [hasSpeechRecognition, transcript, askGeni]);

  // 음성 인식 중지
  const stopListening = useCallback(() => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
    }
  }, []);

  // 텍스트 입력 전송
  const handleTextSubmit = useCallback(() => {
    const text = inputText.trim();
    if (!text) return;
    setInputText('');
    askGeni(text);
  }, [inputText, askGeni]);

  // 상태별 색상
  const stateColors: Record<GeniState, string> = {
    idle: '#22c55e',
    listening: '#ef4444',
    thinking: '#f97316',
    speaking: '#3b82f6',
  };

  const stateLabels: Record<GeniState, string> = {
    idle: '지니',
    listening: '듣는 중...',
    thinking: '생각 중...',
    speaking: '말하는 중...',
  };

  const color = stateColors[state];

  // ── 플로팅 버튼 (닫힌 상태) ──
  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        style={{
          position: 'fixed',
          bottom: 24,
          right: 24,
          width: 60,
          height: 60,
          borderRadius: '50%',
          background: `linear-gradient(135deg, ${color}, ${color}dd)`,
          border: 'none',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: `0 4px 20px ${color}40`,
          transition: 'all 0.3s ease',
          zIndex: 9999,
          animation: state !== 'idle' ? 'geni-pulse 2s ease-in-out infinite' : undefined,
        }}
        title="지니 AI 어시스턴트"
      >
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
          <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
          <line x1="12" y1="19" x2="12" y2="23" />
          <line x1="8" y1="23" x2="16" y2="23" />
        </svg>

        <style>{`
          @keyframes geni-pulse {
            0%, 100% { box-shadow: 0 4px 20px ${color}40; transform: scale(1); }
            50% { box-shadow: 0 4px 30px ${color}60; transform: scale(1.05); }
          }
        `}</style>
      </button>
    );
  }

  // ── 열린 상태 (채팅 패널) ──
  return (
    <div style={{
      position: 'fixed',
      bottom: isMobile ? 0 : 24,
      right: isMobile ? 0 : 24,
      left: isMobile ? 0 : undefined,
      width: isMobile ? '100%' : 400,
      maxHeight: isMobile ? '85vh' : '70vh',
      borderRadius: isMobile ? '16px 16px 0 0' : 16,
      background: 'var(--ct-card, #1e293b)',
      border: '1px solid var(--ct-border, #334155)',
      boxShadow: '0 8px 40px rgba(0,0,0,0.4)',
      display: 'flex',
      flexDirection: 'column',
      zIndex: 9999,
      overflow: 'hidden',
    }}>
      {/* 헤더 */}
      <div style={{
        padding: '14px 16px',
        borderBottom: '1px solid var(--ct-border, #334155)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        background: `linear-gradient(135deg, ${color}15, transparent)`,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 32,
            height: 32,
            borderRadius: '50%',
            background: `linear-gradient(135deg, ${color}, ${color}dd)`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            animation: state !== 'idle' ? 'geni-pulse-sm 1.5s ease-in-out infinite' : undefined,
          }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
              <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
            </svg>
          </div>
          <div>
            <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--ct-text, #f1f5f9)' }}>
              지니 <span style={{ fontSize: 10, color, fontWeight: 600 }}>{stateLabels[state]}</span>
            </div>
            <div style={{ fontSize: 10, color: 'var(--ct-text-muted, #94a3b8)' }}>
              CowTalk AI 어시스턴트
            </div>
          </div>
        </div>
        <button
          onClick={() => { stopSpeaking(); setIsOpen(false); }}
          style={{
            background: 'none',
            border: 'none',
            color: 'var(--ct-text-muted, #94a3b8)',
            cursor: 'pointer',
            fontSize: 18,
            padding: 4,
          }}
        >
          ✕
        </button>
      </div>

      {/* 메시지 영역 */}
      <div style={{
        flex: 1,
        overflowY: 'auto',
        padding: '12px 16px',
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
        minHeight: 200,
        maxHeight: '45vh',
      }}>
        {messages.length === 0 && (
          <div style={{ textAlign: 'center', padding: '20px 0' }}>
            <div style={{ fontSize: 32, marginBottom: 8 }}>🧞</div>
            <div style={{ fontSize: 13, color: 'var(--ct-text-muted, #94a3b8)', marginBottom: 16 }}>
              안녕하세요! 저는 <strong style={{ color }}>지니</strong>입니다.<br />
              음성 또는 텍스트로 무엇이든 물어보세요.
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, justifyContent: 'center' }}>
              {suggestions.map((q) => (
                <button
                  key={q}
                  onClick={() => askGeni(q)}
                  style={{
                    background: 'rgba(255,255,255,0.05)',
                    border: '1px solid var(--ct-border, #334155)',
                    borderRadius: 20,
                    padding: '6px 12px',
                    fontSize: 11,
                    color: 'var(--ct-text-secondary, #cbd5e1)',
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = `${color}20`;
                    e.currentTarget.style.borderColor = color;
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'rgba(255,255,255,0.05)';
                    e.currentTarget.style.borderColor = 'var(--ct-border, #334155)';
                  }}
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg, idx) => (
          <div
            key={idx}
            style={{
              alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start',
              maxWidth: '85%',
            }}
          >
            <div style={{
              padding: '10px 14px',
              borderRadius: msg.role === 'user' ? '14px 14px 4px 14px' : '14px 14px 14px 4px',
              background: msg.role === 'user'
                ? `linear-gradient(135deg, ${color}, ${color}cc)`
                : 'rgba(255,255,255,0.06)',
              color: msg.role === 'user' ? 'white' : 'var(--ct-text, #f1f5f9)',
              fontSize: 13,
              lineHeight: 1.5,
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
            }}>
              {msg.content}
            </div>
            <div style={{
              fontSize: 9,
              color: 'var(--ct-text-muted, #64748b)',
              marginTop: 3,
              textAlign: msg.role === 'user' ? 'right' : 'left',
            }}>
              {msg.timestamp.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}
            </div>
          </div>
        ))}

        {state === 'listening' && transcript && (
          <div style={{
            alignSelf: 'flex-end',
            maxWidth: '85%',
            padding: '10px 14px',
            borderRadius: '14px 14px 4px 14px',
            background: `${color}30`,
            color: 'var(--ct-text, #f1f5f9)',
            fontSize: 13,
            fontStyle: 'italic',
            border: `1px dashed ${color}`,
          }}>
            {transcript}...
          </div>
        )}

        {state === 'thinking' && (
          <div style={{
            alignSelf: 'flex-start',
            padding: '10px 14px',
            borderRadius: '14px 14px 14px 4px',
            background: 'rgba(255,255,255,0.06)',
            display: 'flex',
            gap: 4,
          }}>
            <span style={{ animation: 'geni-dot 1.4s infinite', animationDelay: '0s' }}>●</span>
            <span style={{ animation: 'geni-dot 1.4s infinite', animationDelay: '0.2s' }}>●</span>
            <span style={{ animation: 'geni-dot 1.4s infinite', animationDelay: '0.4s' }}>●</span>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* 입력 영역 */}
      <div style={{
        padding: '12px 16px',
        borderTop: '1px solid var(--ct-border, #334155)',
        display: 'flex',
        gap: 8,
        alignItems: 'center',
      }}>
        {/* 마이크 버튼 */}
          <button
            onClick={() => {
              if (!hasSpeechRecognition) {
                askGeni('오늘 긴급한 소 알려줘');
                return;
              }
              if (state === 'listening') { stopListening(); } else { startListening(); }
            }}
            disabled={state === 'thinking'}
            style={{
              width: 40,
              height: 40,
              borderRadius: '50%',
              background: state === 'listening' ? '#ef4444' : 'rgba(255,255,255,0.08)',
              border: state === 'listening' ? '2px solid #ef4444' : '1px solid var(--ct-border, #334155)',
              cursor: state === 'thinking' ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
              transition: 'all 0.2s',
              animation: state === 'listening' ? 'geni-pulse-mic 1s ease-in-out infinite' : undefined,
            }}
            title={state === 'listening' ? '듣기 중지' : '음성으로 질문하기'}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
              stroke={state === 'listening' ? 'white' : 'var(--ct-text-muted, #94a3b8)'}
              strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
            >
              <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
              <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
              <line x1="12" y1="19" x2="12" y2="23" />
            </svg>
          </button>

        {/* 텍스트 입력 */}
        <input
          type="text"
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleTextSubmit(); } }}
          placeholder={state === 'listening' ? '듣는 중...' : '지니에게 물어보세요...'}
          disabled={state === 'thinking' || state === 'listening'}
          style={{
            flex: 1,
            background: 'rgba(255,255,255,0.06)',
            border: '1px solid var(--ct-border, #334155)',
            borderRadius: 20,
            padding: '10px 16px',
            fontSize: 13,
            color: 'var(--ct-text, #f1f5f9)',
            outline: 'none',
          }}
        />

        {/* 전송 버튼 */}
        <button
          onClick={handleTextSubmit}
          disabled={!inputText.trim() || state === 'thinking'}
          style={{
            width: 40,
            height: 40,
            borderRadius: '50%',
            background: inputText.trim() ? color : 'rgba(255,255,255,0.06)',
            border: 'none',
            cursor: inputText.trim() ? 'pointer' : 'default',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
            transition: 'all 0.2s',
          }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="22" y1="2" x2="11" y2="13" />
            <polygon points="22 2 15 22 11 13 2 9 22 2" />
          </svg>
        </button>

        {/* 말하는 중 → 중지 버튼 */}
        {state === 'speaking' && (
          <button
            onClick={() => { stopSpeaking(); setState('idle'); }}
            style={{
              width: 40,
              height: 40,
              borderRadius: '50%',
              background: '#3b82f6',
              border: 'none',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
            title="음성 중지"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="white">
              <rect x="6" y="4" width="4" height="16" />
              <rect x="14" y="4" width="4" height="16" />
            </svg>
          </button>
        )}
      </div>

      {/* 애니메이션 */}
      <style>{`
        @keyframes geni-pulse-sm {
          0%, 100% { box-shadow: 0 0 0 0 ${color}40; }
          50% { box-shadow: 0 0 10px 3px ${color}30; }
        }
        @keyframes geni-pulse-mic {
          0%, 100% { box-shadow: 0 0 0 0 rgba(239,68,68,0.4); }
          50% { box-shadow: 0 0 15px 5px rgba(239,68,68,0.2); }
        }
        @keyframes geni-dot {
          0%, 80%, 100% { opacity: 0.3; transform: scale(0.8); }
          40% { opacity: 1; transform: scale(1.2); }
        }
      `}</style>
    </div>
  );
}
