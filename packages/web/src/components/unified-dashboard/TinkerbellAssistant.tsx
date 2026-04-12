// 팅커벨 (Tinkerbell) — CowTalk 목장 전담 AI 요정
// 클로드 전체 지식 + 카우톡 데이터베이스 + 소버린 학습 지식 = 통합 AI 어시스턴트
// 음성 입력 → Claude AI 해석 → 음성 응답 + 소버린 학습 현황 통합

import React, { useState, useRef, useCallback, useEffect } from 'react';
import { useAuthStore } from '@web/stores/auth.store';
import { useFarmStore } from '@web/stores/farm.store';
import { useIsMobile } from '@web/hooks/useIsMobile';
import { getSovereignStats } from '@web/api/label-chat.api';
import type { SovereignAiStats } from '@cowtalk/shared';
// ── 타입 ──

interface TinkerbellMessage {
  readonly role: 'user' | 'assistant';
  readonly content: string;
  readonly timestamp: Date;
}

// ── 경량 Markdown 렌더러 ──
// 외부 라이브러리 없이 핵심 패턴만 지원
function MarkdownText({ text }: { text: string }): React.JSX.Element {
  // 코드블록 보호: ```...``` → 플레이스홀더로 치환 후 처리
  const codeBlocks: string[] = [];
  const protected1 = text.replace(/```[\s\S]*?```/g, (match) => {
    codeBlocks.push(match.slice(3, -3).replace(/^\w*\n/, ''));
    return `\x00CODE${codeBlocks.length - 1}\x00`;
  });

  // 단락 분리: 연속 줄바꿈 → 단락
  const paragraphs = protected1.split(/\n{2,}/);

  const renderInline = (s: string): React.ReactNode => {
    // **bold** → <strong>
    // *italic* → <em>
    // `code` → <code>
    const parts = s.split(/(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`|\x00CODE\d+\x00)/);
    return parts.map((part, i) => {
      if (part.startsWith('**') && part.endsWith('**')) {
        return <strong key={i}>{part.slice(2, -2)}</strong>;
      }
      if (part.startsWith('*') && part.endsWith('*')) {
        return <em key={i}>{part.slice(1, -1)}</em>;
      }
      if (part.startsWith('`') && part.endsWith('`')) {
        return (
          <code key={i} style={{
            background: 'rgba(255,255,255,0.1)',
            padding: '1px 5px',
            borderRadius: 3,
            fontSize: '0.9em',
            fontFamily: 'monospace',
          }}>
            {part.slice(1, -1)}
          </code>
        );
      }
      // 코드블록 플레이스홀더 복원
      const codeMatch = /\x00CODE(\d+)\x00/.exec(part);
      if (codeMatch) {
        const code = codeBlocks[Number(codeMatch[1])] ?? '';
        return (
          <pre key={i} style={{
            background: 'rgba(0,0,0,0.3)',
            padding: '8px 10px',
            borderRadius: 6,
            fontSize: '0.85em',
            fontFamily: 'monospace',
            overflowX: 'auto',
            margin: '4px 0',
            whiteSpace: 'pre-wrap',
          }}>
            {code}
          </pre>
        );
      }
      return part;
    });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {paragraphs.map((para, pIdx) => {
        const trimmed = para.trim();
        if (!trimmed) return null;

        // 제목: # , ## , ###
        const headingMatch = /^(#{1,3})\s+(.+)/.exec(trimmed);
        if (headingMatch) {
          const level = headingMatch[1]!.length;
          const headingText = headingMatch[2] ?? '';
          const sz = level === 1 ? 15 : level === 2 ? 13 : 12;
          return (
            <div key={pIdx} style={{ fontSize: sz, fontWeight: 800, color: 'var(--ct-text, #f1f5f9)', marginTop: 4 }}>
              {renderInline(headingText)}
            </div>
          );
        }

        // 목록: - item 또는 • item 또는 1. item
        const lines = trimmed.split('\n');
        const isList = lines.some((l) => /^[-•*]\s/.test(l) || /^\d+\.\s/.test(l));
        if (isList) {
          return (
            <ul key={pIdx} style={{ margin: 0, paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 2 }}>
              {lines.map((line, lIdx) => {
                const bulletMatch = /^[-•*]\s+(.+)/.exec(line);
                const numMatch = /^\d+\.\s+(.+)/.exec(line);
                const content = bulletMatch?.[1] ?? numMatch?.[1];
                if (!content) return null;
                return (
                  <li key={lIdx} style={{ fontSize: 13, color: 'var(--ct-text, #f1f5f9)', lineHeight: 1.55 }}>
                    {renderInline(content)}
                  </li>
                );
              })}
            </ul>
          );
        }

        // 일반 단락 (줄바꿈 보존)
        return (
          <p key={pIdx} style={{ margin: 0, fontSize: 13, lineHeight: 1.6, color: 'var(--ct-text, #f1f5f9)' }}>
            {lines.map((line, lIdx) => (
              <React.Fragment key={lIdx}>
                {renderInline(line)}
                {lIdx < lines.length - 1 && <br />}
              </React.Fragment>
            ))}
          </p>
        );
      })}
    </div>
  );
}

type TinkerbellState = 'idle' | 'listening' | 'thinking' | 'speaking';

interface StreamChunk {
  readonly type: string;
  readonly content: string;
  // tool_event 전용 필드
  readonly phase?: 'start' | 'result';
  readonly toolName?: string;
  readonly toolDomain?: string;
  readonly success?: boolean;
  readonly executionMs?: number;
}

interface ToolActivity {
  readonly toolName: string;
  readonly toolDomain: string;
  readonly phase: 'start' | 'result';
  readonly success?: boolean;
  readonly executionMs?: number;
}

const TOOL_LABELS: Record<string, string> = {
  query_animal: '개체 조회',
  query_animal_events: '이벤트 조회',
  query_farm_summary: '농장 요약',
  query_breeding_stats: '번식 통계',
  query_sensor_data: '센서 데이터',
  query_traceability: '이력제 조회',
  record_insemination: '수정 기록',
  record_pregnancy_check: '임신감정',
  recommend_insemination_window: '수정적기 추천',
  record_treatment: '치료 기록',
  get_farm_kpis: '농장 KPI',
  query_conception_stats: '수태율 통계',
  query_grade: '등급판정 조회',
  query_auction_prices: '경락가격 조회',
  query_sire_info: '씨수소 정보',
  query_weather: '기상/THI 조회',
  query_quarantine_dashboard: '방역 대시보드',
  query_national_situation: '전국 방역 현황',
};

const DOMAIN_ICONS: Record<string, string> = {
  sensor: '📡',
  repro: '🐄',
  farm: '🏠',
  public_data: '📋',
  genetics: '🧬',
  report: '📊',
  action: '⚡',
};

// ── 음성 합성 (TTS) ──

// iOS Safari에서 TTS를 사용하려면 사용자 제스처 직후에 한 번 호출해야 함
function unlockTts(): void {
  if (!('speechSynthesis' in window)) return;
  const dummy = new SpeechSynthesisUtterance('');
  dummy.volume = 0;
  window.speechSynthesis.speak(dummy);
}

// Chrome TTS 15초 끊김 방지: 문장 단위로 분할하여 순차 재생
function splitIntoChunks(text: string, maxLen = 150): readonly string[] {
  const sentences = text.split(/(?<=[.!?。]\s)/);
  const chunks: string[] = [];
  let current = '';
  for (const s of sentences) {
    if ((current + s).length > maxLen && current.length > 0) {
      chunks.push(current.trim());
      current = s;
    } else {
      current += s;
    }
  }
  if (current.trim()) chunks.push(current.trim());
  return chunks.length > 0 ? chunks : [text];
}

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
    .slice(0, 800);

  // 텍스트에서 언어 자동 감지 (비율 기반 — 주 언어 판별)
  const letters = cleanText.replace(/[^a-zA-Z가-힣а-яА-ЯЁё]/g, '');
  const koCount = (letters.match(/[가-힣]/g) ?? []).length;
  const cyCount = (letters.match(/[а-яА-ЯЁё]/g) ?? []).length;
  const enCount = (letters.match(/[a-zA-Z]/g) ?? []).length;
  const total = koCount + cyCount + enCount || 1;

  let detectedLang = 'en-US';
  if (koCount / total > 0.3) detectedLang = 'ko-KR';
  else if (cyCount / total > 0.3) detectedLang = 'ru-RU';

  const utterance = new SpeechSynthesisUtterance(cleanText);
  utterance.lang = detectedLang;
  utterance.rate = detectedLang === 'ko-KR' ? 0.95 : 0.9;
  utterance.pitch = 1.05;

  // 여성 음성 우선 선택 (청량한 음성)
  const voices = window.speechSynthesis.getVoices();
  const langPrefix = detectedLang.split('-')[0]!;
  const langVoices = voices.filter((v) => v.lang.startsWith(langPrefix));

  // 1순위: 해당 언어 + 여성 음성 (이름에 female/woman/여 포함 또는 이름 패턴)
  const femaleKeywords = /female|woman|여|yuna|siri|samantha|karen|victoria|tessa|milena|anna|elena|google.*female/i;
  const maleKeywords = /male|man|남|daniel|alex|thomas|jorge|ivan|dmitri|google.*male/i;
  const femaleVoice = langVoices.find((v) => femaleKeywords.test(v.name) && !maleKeywords.test(v.name));

  // 2순위: 남성 키워드가 없는 음성 (대부분 기본 여성)
  const nonMaleVoice = langVoices.find((v) => !maleKeywords.test(v.name));

  // 3순위: 아무 해당 언어 음성
  let selectedVoice = femaleVoice ?? nonMaleVoice ?? langVoices[0];

  // 해당 언어 음성이 없으면 → 영어 여성 음성으로 fallback
  if (!selectedVoice && langVoices.length === 0) {
    const enVoices = voices.filter((v) => v.lang.startsWith('en'));
    selectedVoice = enVoices.find((v) => femaleKeywords.test(v.name) && !maleKeywords.test(v.name))
      ?? enVoices.find((v) => !maleKeywords.test(v.name))
      ?? enVoices[0];
    if (selectedVoice) utterance.lang = 'en-US';
  }

  // 문장 분할 재생 (Chrome TTS 15초 끊김 방지)
  const chunks = splitIntoChunks(cleanText);

  function speakChunk(index: number): void {
    if (index >= chunks.length) {
      onEnd?.();
      return;
    }
    const chunk = chunks[index]!;
    const utt = new SpeechSynthesisUtterance(chunk);
    utt.lang = detectedLang;
    utt.rate = utterance.rate;
    utt.pitch = utterance.pitch;
    if (selectedVoice) utt.voice = selectedVoice;
    utt.onend = () => speakChunk(index + 1);
    utt.onerror = () => speakChunk(index + 1);
    window.speechSynthesis.speak(utt);
  }

  speakChunk(0);
}

function stopSpeaking(): void {
  if ('speechSynthesis' in window) {
    window.speechSynthesis.cancel();
  }
}

// ── 소버린 학습 현황 요약 ──

function formatSovereignContext(stats: SovereignAiStats): string {
  const verdictTotal = stats.confirmedCount + stats.falsePositiveCount + stats.modifiedCount + stats.missedCount;
  return [
    `[팅커벨 학습 현황]`,
    `총 레이블: ${stats.totalLabels}건`,
    `정확도: ${stats.accuracyRate.toFixed(1)}% (30일 변화: ${stats.improvementRate > 0 ? '+' : ''}${stats.improvementRate.toFixed(1)}%)`,
    `판정 분포: 정확 ${stats.confirmedCount}, 오탐 ${stats.falsePositiveCount}, 수정 ${stats.modifiedCount}, 미탐 ${stats.missedCount} (총 ${verdictTotal}건)`,
    stats.topMisclassifications.length > 0
      ? `주요 오분류: ${stats.topMisclassifications.map((m) => `${m.predictedType}→${m.actualType}(${m.count}건)`).join(', ')}`
      : '',
  ].filter(Boolean).join('\n');
}

// ── 맥락 인식 추천 질문 ──

interface DashboardContext {
  readonly totalAlarms: number;
  readonly criticalCount: number;
  readonly healthIssues: number;
  readonly farmCount: number;
  readonly animalCount: number;
}

function getContextualSuggestions(ctx?: DashboardContext, role?: string): readonly string[] {
  // 방역관 전용 suggestions
  if (role === 'quarantine_officer') {
    return [
      '전국 발열 현황 알려줘',
      '위험 농장 TOP 5',
      '오늘 방역 조치 대기 건수',
      '클러스터 발생 현황',
    ];
  }

  const base: string[] = [];

  if (ctx) {
    if (ctx.criticalCount > 0) {
      base.push(`긴급 알람 ${ctx.criticalCount}건 상세 알려줘`);
    }
    if (ctx.healthIssues > 0) {
      base.push(`건강 이상 ${ctx.healthIssues}두 원인 분석해줘`);
    }
    base.push('오늘 가장 먼저 해야 할 일은?');
    base.push('팅커벨 학습 현황 알려줘');
    base.push('발정 감지된 소 알려줘');
  } else {
    base.push('오늘 긴급한 소 알려줘');
    base.push('전체 농장 현황 요약');
    base.push('팅커벨 학습 현황 알려줘');
  }

  return base.slice(0, 4);
}

// ── 메인 컴포넌트 ──

interface TinkerbellAssistantProps {
  readonly dashboardContext?: DashboardContext;
  /** 이 값이 바뀌면 패널을 자동 열고 해당 내용으로 즉시 질문 전송 */
  readonly openTrigger?: string;
  /** Claude AI처럼 항상 하단 고정 채팅창 모드 */
  readonly alwaysOpen?: boolean;
}

export function TinkerbellAssistant({
  dashboardContext,
  openTrigger,
  alwaysOpen = false,
}: TinkerbellAssistantProps): React.JSX.Element {
  const [state, setState] = useState<TinkerbellState>('idle');
  const [isOpen, setIsOpen] = useState(alwaysOpen);
  const [isExpanded, setIsExpanded] = useState(false); // alwaysOpen 모드: 메시지 영역 펼침
  const [isMinimized, setIsMinimized] = useState(false);
  const isMobile = useIsMobile();
  const [messages, setMessages] = useState<readonly TinkerbellMessage[]>(() => {
    try {
      const saved = sessionStorage.getItem('tinkerbell-messages');
      if (!saved) return [];
      const parsed = JSON.parse(saved) as Array<{ role: string; content: string; timestamp: string }>;
      return parsed.map((m) => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
        timestamp: new Date(m.timestamp),
      }));
    } catch {
      return [];
    }
  });
  const [streamText, setStreamText] = useState(''); // 실시간 스트리밍 중인 텍스트
  const [toolActivities, setToolActivities] = useState<readonly ToolActivity[]>([]); // 도구 호출 상태
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);

  // (사이드 패널 — 고정 위치, 드래그/리사이즈 불필요)
  const [transcript, setTranscript] = useState('');
  const [inputText, setInputText] = useState('');
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const transcriptRef = useRef('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const lastTriggerRef = useRef<string | undefined>(undefined);
  const pendingAskRef = useRef<string | undefined>(undefined);
  // 개체 분석 모드 — trigger로 진입 시 개체 데이터를 컨텍스트로 유지
  const [animalContext, setAnimalContext] = useState<string | null>(null);
  const [animalIdForChat, setAnimalIdForChat] = useState<string | null>(null);
  const [farmIdForChat, setFarmIdForChat] = useState<string | null>(null);
  // 소버린 학습 현황 캐시
  const [sovereignStats, setSovereignStats] = useState<SovereignAiStats | null>(null);
  const user = useAuthStore((s) => s.user);
  const selectedFarmId = useFarmStore((s) => s.selectedFarmId);

  const isQuarantineMode = user?.role === 'quarantine_officer';
  const suggestions = animalContext
    ? ['이 소 지금 수정해도 돼?', '체온이 왜 높아?', '다음에 뭘 해야 해?', '이 소 번식 이력 분석해줘']
    : getContextualSuggestions(dashboardContext, user?.role);

  // 음성 인식 지원 여부
  const hasSpeechRecognition = typeof window !== 'undefined' &&
    ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window);

  // 스크롤 + alwaysOpen 모드에서 메시지 추가 시 자동 펼침
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    if (alwaysOpen && messages.length > 0) setIsExpanded(true);
  }, [messages, alwaysOpen]);

  // TTS 보이스 로드 (일부 브라우저는 비동기 로드)
  useEffect(() => {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.getVoices();
      // Chrome/Safari: voiceschanged 이벤트 후 보이스 사용 가능
      window.speechSynthesis.onvoiceschanged = () => {
        window.speechSynthesis.getVoices();
      };
    }
  }, []);

  // messages → sessionStorage 동기화 (대화 지속성)
  useEffect(() => {
    try {
      if (messages.length === 0) {
        sessionStorage.removeItem('tinkerbell-messages');
      } else {
        sessionStorage.setItem('tinkerbell-messages', JSON.stringify(
          messages.map((m) => ({ role: m.role, content: m.content, timestamp: m.timestamp.toISOString() }))
        ));
      }
    } catch { /* sessionStorage 비활성화 시 무시 */ }
  }, [messages]);

  // 패널 열릴 때 소버린 통계 로드
  useEffect(() => {
    if (!isOpen) return;
    getSovereignStats()
      .then((stats) => setSovereignStats(stats))
      .catch(() => { /* 통계 로드 실패는 무시 */ });
  }, [isOpen]);

  // AI에 질문 전송 (fetch ReadableStream 실시간 스트리밍)
  const askTinkerbell = useCallback(async (question: string) => {
    const userMsg: TinkerbellMessage = { role: 'user', content: question, timestamp: new Date() };
    setMessages((prev) => [...prev, userMsg]);
    setState('thinking');
    setStreamText('');
    setToolActivities([]);

    // 학습 현황 질문 감지 → 소버린 통계 컨텍스트 주입
    const isLearningQuery = /학습|배웠|소버린|정확도|오탐|레이블|지식.*강화/i.test(question);
    const sovereignContext = isLearningQuery && sovereignStats
      ? `\n\n${formatSovereignContext(sovereignStats)}`
      : '';

    try {
      const token = useAuthStore.getState().accessToken;
      const payload = {
        question: animalContext
          ? `[팅커벨 AI — 개체 전담 모드]\n이 개체의 센서·알람·번식·건강 데이터를 기반으로 답하세요.\n\n응답 규칙:\n- 자연스러운 대화체로 답하세요. ASCII 차트·표 금지.\n- 수치는 문장으로 설명하세요 ("체온 38.7°C로 정상" 처럼).\n- 일반 축산 질문은 전문 지식으로 자유롭게 답하세요.\n- **bold**, - 목록 등 마크다운 활용 가능.\n\n${animalContext}\n\n사용자 질문: ${question}`
          : `[대화 모드] 당신은 목장 전담 AI 요정 "팅커벨"입니다.\n핵심만 명확하게 답하되, **bold**, - 목록 등 마크다운으로 가독성을 높이세요.\nASCII 차트·표 금지.${sovereignContext}\n\n질문: ${question}`,
        role: user?.role ?? 'farm_owner',
        farmId: farmIdForChat ?? selectedFarmId ?? undefined,
        animalId: animalIdForChat ?? undefined,
        dashboardContext: animalContext
          ? `${animalContext}`
          : dashboardContext
            ? `현재 대시보드: 총 알람 ${dashboardContext.totalAlarms}건, 긴급 ${dashboardContext.criticalCount}건, 건강이상 ${dashboardContext.healthIssues}두, ${dashboardContext.farmCount}개 농장, ${dashboardContext.animalCount}두 관리 중`
            : undefined,
        conversationHistory: messages.slice(-6).map((m) => ({ role: m.role, content: m.content })),
      };

      // 90초 타임아웃 (도구 호출 + Claude 응답 대기)
      const controller = new AbortController();
      const fetchTimeout = setTimeout(() => controller.abort(), 90_000);

      const res = await fetch('/api/chat/stream', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token ?? ''}`,
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      clearTimeout(fetchTimeout);

      if (!res.ok || !res.body) {
        throw new Error(`HTTP ${res.status}`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let fullText = '';
      let errorText = '';
      const startedAt = new Date();
      let firstChunk = true;

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          try {
            const parsed = JSON.parse(line.slice(6)) as StreamChunk;
            if (parsed.type === 'done') {
              if (parsed.content) fullText = parsed.content;
              break;
            }
            if (parsed.type === 'text') {
              fullText += parsed.content;
              setStreamText(fullText);
              if (firstChunk) { setState('speaking'); firstChunk = false; }
            }
            if (parsed.type === 'error') {
              errorText = parsed.content;
            }
            if (parsed.type === 'tool_event' && parsed.toolName && parsed.phase) {
              setToolActivities((prev) => {
                if (parsed.phase === 'start') {
                  return [...prev, {
                    toolName: parsed.toolName!,
                    toolDomain: parsed.toolDomain ?? 'unknown',
                    phase: 'start',
                  }];
                }
                // result: 기존 start를 result로 업데이트
                return prev.map((a) =>
                  a.toolName === parsed.toolName && a.phase === 'start'
                    ? { ...a, phase: 'result' as const, success: parsed.success, executionMs: parsed.executionMs }
                    : a,
                );
              });
            }
          } catch {
            // skip malformed SSE line
          }
        }
      }

      const answer = fullText || (errorText ? `⚠️ AI 오류: ${errorText}` : '서버로부터 응답을 받지 못했습니다. 잠시 후 다시 시도해 주세요.');
      setStreamText('');
      setToolActivities([]);
      setMessages((prev) => [...prev, { role: 'assistant', content: answer, timestamp: startedAt }]);
      setState('speaking');
      speak(answer, () => setState('idle'));
    } catch (err) {
      setStreamText('');
      const fetchErr = err as { message?: string; name?: string };
      const isAbort = fetchErr.name === 'AbortError';
      const isNetworkError = fetchErr.message?.includes('Failed to fetch') || fetchErr.message?.includes('NetworkError');
      const errorContent = isAbort
        ? 'AI 응답이 지연되고 있습니다. 질문을 다시 시도해 주세요.'
        : isNetworkError
        ? '인터넷 연결을 확인해 주세요. 네트워크 오류가 발생했습니다.'
        : '서버 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.';

      const errorMsg: TinkerbellMessage = {
        role: 'assistant',
        content: errorContent,
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, errorMsg]);
      setState('idle');
    }
  }, [messages, user?.role, selectedFarmId, farmIdForChat, dashboardContext, animalContext, animalIdForChat, sovereignStats]);

  // openTrigger가 바뀌면 패널 열고 이전 대화 초기화 후 자동 질문 예약
  useEffect(() => {
    if (!openTrigger || openTrigger === lastTriggerRef.current) return;
    lastTriggerRef.current = openTrigger;

    // 개체 분석 trigger면 컨텍스트 저장 (이후 대화에도 유지)
    if (openTrigger.startsWith('[팅커벨 AI') || openTrigger.startsWith('[소버린 AI')) {
      setAnimalContext(openTrigger);
      // trigger에서 animalId 추출 (여러 패턴 지원)
      const idMatch = /\[개체ID\]\s*([a-f0-9-]{36})/i.exec(openTrigger)
        ?? /animalId[=:]\s*([a-f0-9-]{36})/i.exec(openTrigger)
        ?? /개체\]\s*#(\S+),/.exec(openTrigger);
      setAnimalIdForChat(idMatch?.[1] ?? null);
      // trigger에서 farmId 추출
      const farmMatch = /\[농장ID\]\s*([a-f0-9-]{36})/i.exec(openTrigger);
      setFarmIdForChat(farmMatch?.[1] ?? null);
      // 자동 질문 없음 — 사용자가 물어보면 답하는 대화형
    } else {
      setAnimalContext(null);
      setAnimalIdForChat(null);
      setFarmIdForChat(null);
      pendingAskRef.current = openTrigger;
    }

    setIsOpen(true);
    setMessages([]);
  }, [openTrigger]);

  // messages가 [] 로 초기화된 직후 pendingAsk 실행
  useEffect(() => {
    const pending = pendingAskRef.current;
    if (!pending || messages.length !== 0 || state !== 'idle') return;
    pendingAskRef.current = undefined;
    void askTinkerbell(pending);
  }, [messages, state, askTinkerbell]);

  // 음성 인식 시작 (권한 체크 + 에러 메시지 포함)
  const startListening = useCallback(async () => {
    setVoiceError(null);

    if (!hasSpeechRecognition) {
      setVoiceError('이 브라우저는 음성 인식을 지원하지 않습니다. Chrome/Edge를 사용해 주세요.');
      return;
    }

    // HTTPS 체크 (localhost는 예외)
    if (typeof window !== 'undefined' && !window.isSecureContext) {
      const host = window.location.hostname;
      if (host !== 'localhost' && host !== '127.0.0.1') {
        setVoiceError('음성 인식은 HTTPS 연결이 필요합니다.');
        return;
      }
    }

    stopSpeaking();
    // iOS Safari: 사용자 제스처 직후에 TTS 잠금 해제
    unlockTts();

    // 마이크 권한 사전 확인 — denied면 바로 안내, prompt면 getUserMedia로 요청
    try {
      const permApi = (navigator as { permissions?: { query: (p: { name: PermissionName }) => Promise<PermissionStatus> } }).permissions;
      if (permApi?.query) {
        const status = await permApi.query({ name: 'microphone' as PermissionName });
        if (status.state === 'denied') {
          setVoiceError('마이크 권한이 차단되어 있습니다. 주소창의 자물쇠 아이콘을 눌러 마이크를 허용으로 바꿔주세요.');
          return;
        }
      }
    } catch {
      // permissions API 미지원 — 무시하고 진행
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      for (const track of stream.getTracks()) track.stop();
    } catch (err) {
      const name = (err as { name?: string })?.name ?? '';
      if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
        setVoiceError('마이크 권한을 허용해야 음성으로 질문할 수 있습니다.');
      } else if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
        setVoiceError('마이크를 찾을 수 없습니다. 장치 연결을 확인해 주세요.');
      } else {
        setVoiceError('마이크 접근 중 오류가 발생했습니다.');
      }
      return;
    }

    const SpeechRecognitionClass = window.SpeechRecognition || window.webkitSpeechRecognition;
    const recognition = new SpeechRecognitionClass();
    // 다국어 음성 인식: 브라우저 언어 기반 + 한국어 우선
    const browserLang = navigator.language ?? 'ko-KR';
    recognition.lang = browserLang.startsWith('ko') ? 'ko-KR' : browserLang;
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
        askTinkerbell(finalText);
      } else {
        setState('idle');
      }
      transcriptRef.current = '';
    };

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      setState('idle');
      setTranscript('');
      transcriptRef.current = '';
      switch (event.error) {
        case 'not-allowed':
        case 'service-not-allowed':
          setVoiceError('마이크 권한이 차단되어 있습니다. 브라우저 설정에서 허용해 주세요.');
          break;
        case 'no-speech':
          setVoiceError('음성이 감지되지 않았습니다. 다시 말씀해 주세요.');
          break;
        case 'audio-capture':
          setVoiceError('마이크를 찾을 수 없습니다.');
          break;
        case 'network':
          setVoiceError('음성 인식 서버에 연결할 수 없습니다. 인터넷을 확인해 주세요.');
          break;
        case 'aborted':
          // 사용자 취소 — 메시지 없음
          break;
        default:
          setVoiceError('음성 인식 중 오류가 발생했습니다.');
      }
    };

    recognitionRef.current = recognition;
    try {
      recognition.start();
    } catch (err) {
      const name = (err as { name?: string })?.name ?? '';
      if (name !== 'InvalidStateError') {
        setVoiceError('음성 인식을 시작할 수 없습니다.');
      }
    }
  }, [hasSpeechRecognition, askTinkerbell]);

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
    // iOS Safari: 사용자 제스처 직후에 TTS 잠금 해제
    unlockTts();
    askTinkerbell(text);
  }, [inputText, askTinkerbell]);

  // 상태별 색상 — 팅커벨 테마 (요정의 빛)
  const stateColors: Record<TinkerbellState, string> = {
    idle: '#a78bfa',      // 보라빛 (요정 대기)
    listening: '#ef4444',
    thinking: '#f59e0b',  // 골드 (생각 중)
    speaking: '#38bdf8',  // 하늘빛 (말하는 중)
  };

  const stateLabels: Record<TinkerbellState, string> = {
    idle: '팅커벨',
    listening: '듣는 중...',
    thinking: '생각 중...',
    speaking: '말하는 중...',
  };

  const color = stateColors[state];

  // ── alwaysOpen 모드 — Claude AI처럼 항상 하단 고정 ──
  if (alwaysOpen) {
    const bottomOffset = isMobile ? 60 : 0;

    return (
      <>
        <style>{`
          @keyframes tinkerbell-dot { 0%,80%,100%{opacity:0.2}40%{opacity:1} }
          @keyframes tb-slide-up { from{opacity:0;transform:translateY(8px)} to{opacity:1;transform:translateY(0)} }
        `}</style>

        {/* 하단 고정 채팅창 */}
        <div style={{
          position: 'fixed',
          bottom: bottomOffset,
          left: 0,
          right: 0,
          zIndex: 9990,
          background: 'var(--ct-card, #1e293b)',
          borderTop: `1px solid ${color}40`,
          boxShadow: '0 -4px 24px rgba(0,0,0,0.3)',
        }}>

          {/* 메시지 영역 — 펼쳐졌을 때만 표시 */}
          {isExpanded && (
            <div style={{
              maxHeight: isMobile ? '40dvh' : '45vh',
              overflowY: 'auto',
              padding: '12px 16px 4px',
              display: 'flex',
              flexDirection: 'column',
              gap: 8,
              animation: 'tb-slide-up 0.2s ease',
            }}>
              {messages.length === 0 && (
                <div style={{ textAlign: 'center', padding: '12px 0', color: 'var(--ct-text-muted, #94a3b8)', fontSize: 12 }}>
                  🧚 이 개체에 대해 무엇이든 물어보세요
                </div>
              )}
              {messages.map((msg, idx) => (
                <div key={idx} style={{
                  alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start',
                  maxWidth: '88%',
                }}>
                  <div style={{
                    padding: '9px 13px',
                    borderRadius: msg.role === 'user' ? '14px 14px 4px 14px' : '14px 14px 14px 4px',
                    background: msg.role === 'user'
                      ? `linear-gradient(135deg, ${color}, ${color}cc)`
                      : 'rgba(255,255,255,0.07)',
                    color: msg.role === 'user' ? 'white' : 'var(--ct-text, #f1f5f9)',
                    wordBreak: 'break-word',
                  }}>
                    {msg.role === 'assistant'
                      ? <MarkdownText text={msg.content} />
                      : <span style={{ fontSize: 13, lineHeight: 1.55 }}>{msg.content}</span>
                    }
                  </div>
                  <div style={{ fontSize: 9, color: 'var(--ct-text-muted, #64748b)', marginTop: 2, display: 'flex', alignItems: 'center', gap: 6, justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start' }}>
                    <span>{msg.timestamp.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}</span>
                    {msg.role === 'assistant' && (
                      <button type="button"
                        onClick={() => { void navigator.clipboard.writeText(msg.content); setCopiedIdx(idx); setTimeout(() => setCopiedIdx(null), 2000); }}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '0 2px', color: copiedIdx === idx ? '#34d399' : 'var(--ct-text-muted, #64748b)', fontSize: 10, lineHeight: 1 }}
                        title="복사"
                      >
                        {copiedIdx === idx ? '✓' : '⎘'}
                      </button>
                    )}
                  </div>
                </div>
              ))}
              {/* 도구 호출 활동 카드 */}
              {toolActivities.length > 0 && (
                <div style={{ alignSelf: 'flex-start', maxWidth: '88%', display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {toolActivities.map((act, i) => (
                    <div key={`${act.toolName}-${String(i)}`} style={{
                      padding: '6px 10px',
                      borderRadius: 8,
                      background: act.phase === 'start' ? 'rgba(59,130,246,0.15)' : act.success ? 'rgba(34,197,94,0.12)' : 'rgba(239,68,68,0.12)',
                      border: `1px solid ${act.phase === 'start' ? 'rgba(59,130,246,0.3)' : act.success ? 'rgba(34,197,94,0.25)' : 'rgba(239,68,68,0.25)'}`,
                      fontSize: 11,
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                    }}>
                      <span>{DOMAIN_ICONS[act.toolDomain] ?? '🔧'}</span>
                      <span style={{ color: 'rgba(255,255,255,0.85)' }}>
                        {TOOL_LABELS[act.toolName] ?? act.toolName}
                      </span>
                      {act.phase === 'start' && (
                        <span style={{ color, animation: 'tinkerbell-dot 1s infinite', fontSize: 10 }}>조회중...</span>
                      )}
                      {act.phase === 'result' && (
                        <span style={{ color: act.success ? '#22c55e' : '#ef4444', fontSize: 10 }}>
                          {act.success ? '완료' : '실패'}{act.executionMs != null ? ` ${String(act.executionMs)}ms` : ''}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              )}
              {/* 실시간 스트리밍 버블 */}
              {streamText && (
                <div style={{ alignSelf: 'flex-start', maxWidth: '88%' }}>
                  <div style={{
                    padding: '9px 13px',
                    borderRadius: '14px 14px 14px 4px',
                    background: 'rgba(255,255,255,0.07)',
                    wordBreak: 'break-word',
                  }}>
                    <MarkdownText text={streamText} />
                    <span style={{ display: 'inline-block', width: 6, height: 13, background: color, borderRadius: 1, marginLeft: 2, animation: 'tinkerbell-dot 0.8s infinite' }} />
                  </div>
                </div>
              )}
              {state === 'listening' && transcript && (
                <div style={{ alignSelf: 'flex-end', padding: '9px 13px', borderRadius: '14px 14px 4px 14px', background: `${color}30`, color: 'var(--ct-text, #f1f5f9)', fontSize: 13, fontStyle: 'italic', border: `1px dashed ${color}` }}>
                  {transcript}...
                </div>
              )}
              {state === 'thinking' && !streamText && (
                <div style={{ alignSelf: 'flex-start', padding: '10px 14px', borderRadius: '14px 14px 14px 4px', background: 'rgba(255,255,255,0.06)', display: 'flex', gap: 4 }}>
                  <span style={{ animation: 'tinkerbell-dot 1.4s infinite', animationDelay: '0s', color }}>✦</span>
                  <span style={{ animation: 'tinkerbell-dot 1.4s infinite', animationDelay: '0.2s', color }}>✦</span>
                  <span style={{ animation: 'tinkerbell-dot 1.4s infinite', animationDelay: '0.4s', color }}>✦</span>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>
          )}

          {/* 추천 질문 — 메시지 없을 때 + 펼쳐진 상태 */}
          {isExpanded && messages.length === 0 && state === 'idle' && (
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', padding: '0 16px 8px' }}>
              {suggestions.map((q) => (
                <button key={q} type="button"
                  onClick={() => { unlockTts(); void askTinkerbell(q); }}
                  style={{ background: 'rgba(255,255,255,0.05)', border: `1px solid ${color}40`, borderRadius: 20, padding: '5px 11px', fontSize: 11, color: 'var(--ct-text-secondary, #cbd5e1)', cursor: 'pointer' }}>
                  {q}
                </button>
              ))}
            </div>
          )}

          {/* 음성 인식 에러 배너 */}
          {voiceError && (
            <div
              role="alert"
              onClick={() => setVoiceError(null)}
              style={{
                margin: '0 14px',
                padding: '8px 12px',
                borderRadius: 8,
                background: 'rgba(239,68,68,0.1)',
                border: '1px solid rgba(239,68,68,0.3)',
                color: '#ef4444',
                fontSize: 12,
                lineHeight: 1.4,
                cursor: 'pointer',
              }}
            >
              {voiceError}
              <span style={{ opacity: 0.7, marginLeft: 6, fontSize: 10 }}>(클릭해서 닫기)</span>
            </div>
          )}

          {/* 입력 바 — 항상 표시 (Claude 스타일) */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '10px 14px 10px',
          }}>
            {/* 팅커벨 아이콘 + 상태 표시 (클릭 시 메시지 토글) */}
            <button type="button"
              onClick={() => setIsExpanded((v) => !v)}
              style={{
                width: 34, height: 34, borderRadius: '50%', flexShrink: 0,
                background: `linear-gradient(135deg, #a78bfa, #7c3aed)`,
                border: 'none', cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                boxShadow: `0 2px 10px ${color}50`,
              }}
              title={isExpanded ? '대화창 접기' : '대화창 펼치기'}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="white" stroke="none">
                <path d="M12 2 L13.5 8.5 L20 10 L13.5 11.5 L12 18 L10.5 11.5 L4 10 L10.5 8.5 Z" />
              </svg>
            </button>

            {/* 마이크 버튼 */}
            <button type="button"
              onClick={() => {
                if (!hasSpeechRecognition) { setVoiceError('이 브라우저는 음성 인식을 지원하지 않습니다.'); return; }
                if (state === 'listening') { stopListening(); } else { unlockTts(); void startListening(); }
              }}
              disabled={state === 'thinking'}
              style={{
                width: 34, height: 34, borderRadius: '50%', flexShrink: 0,
                background: state === 'listening' ? '#ef4444' : 'rgba(255,255,255,0.07)',
                border: state === 'listening' ? '2px solid #ef4444' : '1px solid var(--ct-border, #334155)',
                cursor: state === 'thinking' ? 'not-allowed' : 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                transition: 'all 0.2s',
              }}
              title={state === 'listening' ? '듣기 중지' : '음성 질문'}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none"
                stroke={state === 'listening' ? 'white' : 'var(--ct-text-muted, #94a3b8)'}
                strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
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
              onFocus={() => setIsExpanded(true)}
              placeholder={
                state === 'listening' ? '듣는 중...' :
                state === 'thinking' ? '답변 생성 중...' :
                isQuarantineMode ? '방역 현황을 질문하세요...' :
                animalContext ? '이 개체에 대해 질문하세요...' : '팅커벨에게 물어보세요...'
              }
              disabled={state === 'thinking' || state === 'listening'}
              style={{
                flex: 1,
                background: 'rgba(255,255,255,0.06)',
                border: '1px solid var(--ct-border, #334155)',
                borderRadius: 24,
                padding: '9px 16px',
                fontSize: 13,
                color: 'var(--ct-text, #f1f5f9)',
                outline: 'none',
              }}
            />

            {/* 전송 버튼 */}
            <button type="button"
              onClick={handleTextSubmit}
              disabled={!inputText.trim() || state === 'thinking'}
              style={{
                width: 34, height: 34, borderRadius: '50%', flexShrink: 0,
                background: inputText.trim() && state !== 'thinking' ? color : 'rgba(255,255,255,0.06)',
                border: 'none',
                cursor: inputText.trim() && state !== 'thinking' ? 'pointer' : 'default',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                transition: 'all 0.2s',
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="22" y1="2" x2="11" y2="13" />
                <polygon points="22 2 15 22 11 13 2 9 22 2" />
              </svg>
            </button>

            {/* 말하는 중 중지 */}
            {state === 'speaking' && (
              <button type="button"
                onClick={() => { stopSpeaking(); setState('idle'); }}
                style={{ width: 34, height: 34, borderRadius: '50%', flexShrink: 0, background: '#ef444420', border: '1px solid #ef4444', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                title="말하기 중지"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="#ef4444" stroke="none"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>
              </button>
            )}
          </div>
        </div>

        {/* 하단 채팅창 높이만큼 페이지 하단 여백 확보 */}
        <div style={{ height: isMobile ? (isExpanded ? 'calc(40vh + 60px)' : '70px') : (isExpanded ? 'calc(45vh + 65px)' : '65px'), pointerEvents: 'none' }} />
      </>
    );
  }

  // ── 플로팅 버튼 (닫힌 상태) — 요정 지팡이 아이콘 ──
  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        style={{
          position: 'fixed',
          bottom: isMobile ? 76 : 24,
          right: isMobile ? 16 : 24,
          width: 60,
          height: 60,
          borderRadius: '50%',
          background: `linear-gradient(135deg, #a78bfa, #7c3aed)`,
          border: 'none',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: `0 4px 20px rgba(167,139,250,0.4)`,
          transition: 'all 0.3s ease',
          zIndex: 9999,
          animation: state !== 'idle' ? 'tinkerbell-pulse 2s ease-in-out infinite' : 'tinkerbell-sparkle 3s ease-in-out infinite',
        }}
        title="팅커벨 AI 어시스턴트"
      >
        {/* 요정 별 아이콘 */}
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          {/* 별 (sparkle) */}
          <path d="M12 2 L13.5 8.5 L20 10 L13.5 11.5 L12 18 L10.5 11.5 L4 10 L10.5 8.5 Z" fill="white" stroke="none" />
          {/* 작은 별 */}
          <circle cx="18" cy="4" r="1" fill="white" />
          <circle cx="6" cy="16" r="0.8" fill="white" opacity="0.7" />
          {/* 지팡이 */}
          <line x1="14" y1="14" x2="20" y2="20" strokeWidth="2" />
        </svg>

        <style>{`
          @keyframes tinkerbell-pulse {
            0%, 100% { box-shadow: 0 4px 20px rgba(167,139,250,0.4); transform: scale(1); }
            50% { box-shadow: 0 4px 30px rgba(167,139,250,0.6); transform: scale(1.05); }
          }
          @keyframes tinkerbell-sparkle {
            0%, 100% { box-shadow: 0 4px 20px rgba(167,139,250,0.3); }
            50% { box-shadow: 0 4px 25px rgba(167,139,250,0.5), 0 0 40px rgba(167,139,250,0.15); }
          }
        `}</style>
      </button>
    );
  }

  // ── 열린 상태 (데스크톱: 우측 사이드패널, 모바일: 하단 팝업) ──
  return (
    <div style={{
      position: 'fixed',
      ...(isMobile
        ? { bottom: 60, left: 0, right: 0, width: '100%', maxHeight: 'calc(100dvh - 80px)', borderRadius: '16px 16px 0 0' }
        : { top: 0, right: 0, width: isMinimized ? 48 : 'min(33vw, 420px)', height: '100dvh', borderRadius: 0 }),
      background: 'var(--ct-card, #1e293b)',
      borderLeft: isMobile ? 'none' : '1px solid var(--ct-border, #334155)',
      border: isMobile ? '1px solid var(--ct-border, #334155)' : undefined,
      boxShadow: isMobile ? '0 8px 40px rgba(0,0,0,0.4)' : '-4px 0 20px rgba(0,0,0,0.3)',
      display: 'flex',
      flexDirection: isMobile ? 'column' : isMinimized ? 'column' : 'column',
      zIndex: 9999,
      overflow: 'hidden',
      transition: 'width 0.2s ease',
    }}>
      {/* 헤더 */}
      <div
        onDoubleClick={() => !isMobile && setIsMinimized((v) => !v)}
        style={{
          padding: isMinimized && !isMobile ? '10px 8px' : '10px 14px',
          borderBottom: isMinimized ? 'none' : '1px solid var(--ct-border, #334155)',
          display: 'flex',
          alignItems: isMinimized && !isMobile ? 'center' : 'center',
          justifyContent: isMinimized && !isMobile ? 'center' : 'space-between',
          background: `linear-gradient(135deg, ${color}15, transparent)`,
          userSelect: 'none',
          flexShrink: 0,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 32,
            height: 32,
            borderRadius: '50%',
            background: `linear-gradient(135deg, #a78bfa, #7c3aed)`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            animation: state !== 'idle' ? 'tinkerbell-pulse-sm 1.5s ease-in-out infinite' : undefined,
          }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 2 L13.5 8.5 L20 10 L13.5 11.5 L12 18 L10.5 11.5 L4 10 L10.5 8.5 Z" fill="white" stroke="none" />
              <line x1="14" y1="14" x2="19" y2="19" strokeWidth="2" />
            </svg>
          </div>
          <div>
            <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--ct-text, #f1f5f9)' }}>
              {isQuarantineMode ? '🛡️ 팅커벨 방역' : '🧚 팅커벨 AI'} <span style={{ fontSize: 10, color, fontWeight: 600 }}>{stateLabels[state]}</span>
            </div>
            <div style={{ fontSize: 10, color: isQuarantineMode ? '#f97316' : animalContext ? '#a78bfa' : 'var(--ct-text-muted, #94a3b8)' }}>
              {isQuarantineMode ? '방역 모니터링 모드' : animalContext ? '이 개체 전담 요정 모드' : '목장 전담 AI 요정'}
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          {messages.length > 0 && (
            <button
              type="button"
              onClick={() => { setMessages([]); setAnimalContext(null); setAnimalIdForChat(null); setFarmIdForChat(null); }}
              style={{ background: 'none', border: 'none', color: 'var(--ct-text-muted, #94a3b8)', cursor: 'pointer', fontSize: 13, padding: 4, lineHeight: 1 }}
              title="대화 초기화"
            >
              ↺
            </button>
          )}
          {!isMobile && (
            <button
              onClick={() => setIsMinimized((v) => !v)}
              style={{ background: 'none', border: 'none', color: 'var(--ct-text-muted, #94a3b8)', cursor: 'pointer', fontSize: 16, padding: 4 }}
              title={isMinimized ? '펼치기' : '최소화'}
            >
              {isMinimized ? '□' : '—'}
            </button>
          )}
          <button
            onClick={() => { stopSpeaking(); setIsOpen(false); setIsMinimized(false); setAnimalContext(null); setAnimalIdForChat(null); setFarmIdForChat(null); }}
            style={{ background: 'none', border: 'none', color: 'var(--ct-text-muted, #94a3b8)', cursor: 'pointer', fontSize: 18, padding: 4 }}
          >
            ✕
          </button>
        </div>
      </div>

      {/* 메시지 영역 */}
      {!isMinimized && <div style={{
        flex: 1,
        overflowY: 'auto',
        padding: '12px 16px',
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
        minHeight: 100,
      }}>
        {messages.length === 0 && (
          <div style={{ textAlign: 'center', padding: '20px 0' }}>
            <div style={{ fontSize: 32, marginBottom: 8 }}>{isQuarantineMode ? '🛡️' : '🧚'}</div>
            <div style={{ fontSize: 13, color: 'var(--ct-text-muted, #94a3b8)', marginBottom: 16 }}>
              {isQuarantineMode
                ? <><strong style={{ color: '#f97316' }}>팅커벨 방역</strong> 모드입니다.<br />전국 역학 데이터 기반으로 답변합니다.</>
                : animalContext
                  ? <>이 개체의 <strong style={{ color: '#a78bfa' }}>팅커벨 AI</strong> 전담 요정입니다.<br />센서·알람·번식이력 기반으로 답변합니다.</>
                  : <>안녕하세요! <strong style={{ color: '#a78bfa' }}>팅커벨</strong>이에요.<br />목장 데이터로 무엇이든 답변합니다.</>
              }
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, justifyContent: 'center' }}>
              {suggestions.map((q) => (
                <button
                  key={q}
                  onClick={() => { unlockTts(); askTinkerbell(q); }}
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
              wordBreak: 'break-word',
            }}>
              {msg.role === 'assistant'
                ? <MarkdownText text={msg.content} />
                : <span style={{ fontSize: 13, lineHeight: 1.5, color: 'white' }}>{msg.content}</span>
              }
            </div>
            <div style={{
              fontSize: 9,
              color: 'var(--ct-text-muted, #64748b)',
              marginTop: 3,
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start',
            }}>
              <span>{msg.timestamp.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}</span>
              {msg.role === 'assistant' && (
                <button
                  type="button"
                  onClick={() => { void navigator.clipboard.writeText(msg.content); setCopiedIdx(idx); setTimeout(() => setCopiedIdx(null), 2000); }}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '0 2px', color: copiedIdx === idx ? '#34d399' : 'var(--ct-text-muted, #64748b)', fontSize: 10, lineHeight: 1 }}
                  title="복사"
                >
                  {copiedIdx === idx ? '✓' : '⎘'}
                </button>
              )}
            </div>
          </div>
        ))}

        {/* 도구 호출 활동 카드 */}
        {toolActivities.length > 0 && (
          <div style={{ alignSelf: 'flex-start', maxWidth: '85%', display: 'flex', flexDirection: 'column', gap: 4 }}>
            {toolActivities.map((act, i) => (
              <div key={`${act.toolName}-${String(i)}`} style={{
                padding: '6px 10px',
                borderRadius: 8,
                background: act.phase === 'start' ? 'rgba(59,130,246,0.15)' : act.success ? 'rgba(34,197,94,0.12)' : 'rgba(239,68,68,0.12)',
                border: `1px solid ${act.phase === 'start' ? 'rgba(59,130,246,0.3)' : act.success ? 'rgba(34,197,94,0.25)' : 'rgba(239,68,68,0.25)'}`,
                fontSize: 12,
                display: 'flex',
                alignItems: 'center',
                gap: 6,
              }}>
                <span>{DOMAIN_ICONS[act.toolDomain] ?? '🔧'}</span>
                <span style={{ color: 'rgba(255,255,255,0.85)' }}>
                  {TOOL_LABELS[act.toolName] ?? act.toolName}
                </span>
                {act.phase === 'start' && (
                  <span style={{ color, animation: 'tinkerbell-dot 1s infinite', fontSize: 11 }}>조회중...</span>
                )}
                {act.phase === 'result' && (
                  <span style={{ color: act.success ? '#22c55e' : '#ef4444', fontSize: 11 }}>
                    {act.success ? '완료' : '실패'}{act.executionMs != null ? ` ${String(act.executionMs)}ms` : ''}
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
        {/* 실시간 스트리밍 버블 */}
        {streamText && (
          <div style={{ alignSelf: 'flex-start', maxWidth: '85%' }}>
            <div style={{
              padding: '10px 14px',
              borderRadius: '14px 14px 14px 4px',
              background: 'rgba(255,255,255,0.06)',
              wordBreak: 'break-word',
            }}>
              <MarkdownText text={streamText} />
              <span style={{
                display: 'inline-block', width: 7, height: 14,
                background: color, borderRadius: 1, marginLeft: 2,
                animation: 'tinkerbell-dot 0.8s infinite',
                verticalAlign: 'middle',
              }} />
            </div>
          </div>
        )}

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

        {state === 'thinking' && !streamText && (
          <div style={{
            alignSelf: 'flex-start',
            padding: '10px 14px',
            borderRadius: '14px 14px 14px 4px',
            background: 'rgba(255,255,255,0.06)',
            display: 'flex',
            gap: 4,
          }}>
            <span style={{ animation: 'tinkerbell-dot 1.4s infinite', animationDelay: '0s' }}>✦</span>
            <span style={{ animation: 'tinkerbell-dot 1.4s infinite', animationDelay: '0.2s' }}>✦</span>
            <span style={{ animation: 'tinkerbell-dot 1.4s infinite', animationDelay: '0.4s' }}>✦</span>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>}

      {/* 음성 인식 에러 배너 (모바일 floating) */}
      {!isMinimized && voiceError && (
        <div
          role="alert"
          onClick={() => setVoiceError(null)}
          style={{
            margin: '0 16px',
            padding: '8px 12px',
            borderRadius: 8,
            background: 'rgba(239,68,68,0.1)',
            border: '1px solid rgba(239,68,68,0.3)',
            color: '#ef4444',
            fontSize: 12,
            lineHeight: 1.4,
            cursor: 'pointer',
          }}
        >
          {voiceError}
          <span style={{ opacity: 0.7, marginLeft: 6, fontSize: 10 }}>(클릭해서 닫기)</span>
        </div>
      )}

      {/* 입력 영역 */}
      {!isMinimized && (
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
                setVoiceError('이 브라우저는 음성 인식을 지원하지 않습니다.');
                return;
              }
              if (state === 'listening') { stopListening(); } else { void startListening(); }
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
              animation: state === 'listening' ? 'tinkerbell-pulse-mic 1s ease-in-out infinite' : undefined,
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
          placeholder={state === 'listening' ? '듣는 중...' : '팅커벨에게 물어보세요...'}
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
      )}

      {/* 애니메이션 */}
      <style>{`
        @keyframes tinkerbell-pulse-sm {
          0%, 100% { box-shadow: 0 0 0 0 ${color}40; }
          50% { box-shadow: 0 0 10px 3px ${color}30; }
        }
        @keyframes tinkerbell-pulse-mic {
          0%, 100% { box-shadow: 0 0 0 0 rgba(239,68,68,0.4); }
          50% { box-shadow: 0 0 15px 5px rgba(239,68,68,0.2); }
        }
        @keyframes tinkerbell-dot {
          0%, 80%, 100% { opacity: 0.3; transform: scale(0.8); }
          40% { opacity: 1; transform: scale(1.2); }
        }
      `}</style>
    </div>
  );
}
