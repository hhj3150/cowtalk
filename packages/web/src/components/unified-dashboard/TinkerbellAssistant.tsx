// 팅커벨 (Tinkerbell) — CowTalk 목장 전담 AI 요정
// 클로드 전체 지식 + 카우톡 데이터베이스 + 소버린 학습 지식 = 통합 AI 어시스턴트
// 음성 입력 → Claude AI 해석 → 음성 응답 + 소버린 학습 현황 통합

import React, { useState, useRef, useCallback, useEffect } from 'react';
import { useAuthStore } from '@web/stores/auth.store';
import { useFarmStore } from '@web/stores/farm.store';
import { useIsMobile } from '@web/hooks/useIsMobile';
import { getSovereignStats } from '@web/api/label-chat.api';
import type { SovereignAiStats } from '@cowtalk/shared';
import { useVoiceOutput } from '@web/hooks/useVoiceOutput';
import { useWakeWord } from '@web/hooks/useWakeWord';
import { useT, useLang, type TFunction } from '@web/i18n/useT';
import { LangSwitcher } from '@web/i18n/LangSwitcher';
import { transcribeAudio } from '@web/api/audio.api';

// iOS Safari 감지 — Web Speech API가 불안정하므로 MediaRecorder + Whisper STT로 우회
function isIOSDevice(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent;
  if (/iPad|iPhone|iPod/.test(ua)) return true;
  // iPadOS 13+ 는 platform이 MacIntel + 멀티터치
  if (navigator.platform === 'MacIntel' && (navigator as { maxTouchPoints?: number }).maxTouchPoints && (navigator as { maxTouchPoints: number }).maxTouchPoints > 1) return true;
  return false;
}
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
    // \x00 = 코드블록 sentinel (사용자 입력에 등장 불가능한 NULL 바이트)
    // eslint-disable-next-line no-control-regex
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
      // eslint-disable-next-line no-control-regex
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

// iOS Safari/Android Chrome에서 음성 재생을 위한 사용자 제스처 잠금 해제.
// 두 가지를 모두 unlock 해야 함:
//   1) window.speechSynthesis (브라우저 TTS fallback)
//   2) HTMLAudioElement (OpenAI Nova MP3 재생) — iOS Safari가 자동재생 차단
// 한 번 unlock되면 같은 페이지 세션 동안 유지됨.
let __audioUnlocked = false;
let __silentAudio: HTMLAudioElement | null = null;
function unlockTts(): void {
  // SpeechSynthesis unlock
  if ('speechSynthesis' in window) {
    try {
      const dummy = new SpeechSynthesisUtterance('');
      dummy.volume = 0;
      window.speechSynthesis.speak(dummy);
    } catch { /* ignore */ }
  }
  // HTMLAudioElement unlock — 1프레임짜리 무음 MP3를 같은 제스처 안에서 재생
  if (!__audioUnlocked) {
    try {
      // 1프레임 무음 MP3 (base64). 길이 ~0.05초, 용량 ~100바이트
      const SILENT_MP3 = 'data:audio/mpeg;base64,SUQzAwAAAAAAJlRYWFgAAAAcAAAATGF2ZjU3LjU2LjEwMQBUUE9TAAAABQAAADAAAAD/+5DEAAAAAAAAAAAAAAAAAAAAAABYaW5nAAAADwAAAAEAAAEgAEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQAAAAAA8TEFNRTMuMTAwAaUAAAAALDoAABRGJAJEQQAB9AAAASBO2sLZAAAAAP/7kMQAA8AAAaQAAAAgAAA0gAAABExBTUUzLjEwMFVVVVVVVVVV';
      __silentAudio = new Audio(SILENT_MP3);
      __silentAudio.volume = 0;
      const p = __silentAudio.play();
      if (p && typeof p.then === 'function') {
        p.then(() => { __audioUnlocked = true; }).catch(() => { /* ignore */ });
      } else {
        __audioUnlocked = true;
      }
    } catch { /* ignore */ }
  }
}

// 짧은 인사말 즉시 발화 — 외부 API 없이 브라우저 SpeechSynthesis로 0ms 시작.
// Wake word 인식 직후 사용자에게 즉각 "듣고 있어요" 신호.
function speakImmediate(text: string, lang: string, onEnd?: () => void): void {
  if (!('speechSynthesis' in window)) { onEnd?.(); return; }
  try { window.speechSynthesis.cancel(); } catch { /* ignore */ }

  const utt = new SpeechSynthesisUtterance(text);
  utt.lang = lang;
  utt.rate = 1.1;
  utt.pitch = 1.1;
  utt.volume = 1.0;

  // 해당 언어 음성 선택 (여성 우선)
  try {
    const voices = window.speechSynthesis.getVoices();
    const prefix = (lang.split('-')[0] ?? '').toLowerCase();
    const langVoices = voices.filter((v) => v.lang.toLowerCase().startsWith(prefix));
    if (langVoices.length > 0) {
      const female = /female|woman|여|yuna|siri|samantha|karen|victoria|tessa|milena|anna|elena|google.*female/i;
      const male = /male|man|남|daniel|alex|thomas|jorge|ivan|dmitri|google.*male/i;
      utt.voice = langVoices.find((v) => female.test(v.name) && !male.test(v.name))
        ?? langVoices.find((v) => !male.test(v.name))
        ?? langVoices[0]!;
    }
  } catch { /* ignore */ }

  let ended = false;
  const fire = (): void => { if (!ended) { ended = true; onEnd?.(); } };
  utt.onend = fire;
  utt.onerror = fire;
  // 안전망: 2.5초 안에 onend가 안 와도 다음으로 진행
  window.setTimeout(fire, 2500);

  try { window.speechSynthesis.speak(utt); } catch { fire(); }
}

// STT 결과 정규화 — 사용자 발음이 엉키거나 반복돼도 의도를 보존.
// 1) 연속 공백 압축
// 2) 같은 단어 즉시 반복 ("팅커벨 팅커벨 팅커벨" → "팅커벨")
// 3) 같은 음절 길게 반복 ("아아아아 그게" → "아 그게")
// 4) 발화 끝의 잡음 문자 제거
export function cleanSttTranscript(raw: string): string {
  if (!raw) return raw;
  let s = raw.replace(/\s+/g, ' ').trim();

  // 같은 단어 즉시 반복 (3회 이상이면 1회로) — 한/영/우즈벡 라틴 모두 적용
  // 예: "the the the cow" → "the cow", "이 이 이 개체" → "이 개체"
  s = s.replace(/\b(\S+)(\s+\1\b){1,}/giu, '$1');

  // 한 글자 모음 반복 ("아아아", "어어어") — 한 글자로 압축
  s = s.replace(/([가-힣])\1{2,}/g, '$1');
  // 라틴 모음 길게 반복 ("aaaa", "ooooo") — 1글자 (단, "oo", "ee"는 단어로 유효할 수 있어 3개 이상만)
  s = s.replace(/([aeiouAEIOU])\1{2,}/g, '$1');

  // 끝의 마침표/물음표/쉼표 외 잡문자 정리
  s = s.replace(/[^\S\r\n]+$/, '');

  return s.trim();
}

// Wake 인사말 — uiLang 기반 다국어 (사용자 호칭: 하원장님)
const WAKE_GREETINGS: Readonly<Record<string, { text: string; lang: string }>> = {
  ko: { text: '네, 하원장님', lang: 'ko-KR' },
  uz: { text: "Xo'p, doktor Ha", lang: 'uz-UZ' },
  en: { text: 'Yes, Doctor Ha', lang: 'en-US' },
  ru: { text: 'Да, доктор Ха', lang: 'ru-RU' },
  mn: { text: 'За, доктор Ха', lang: 'mn-MN' },
};

// (THINKING_FILLERS 제거 — 사용자 피드백: "잠시만요" 필러가 어색하고 응답이 늦으면 더 부각됨)

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
  // 5개 지원: ko / en / ru / mn(키릴 + Өө/Үү) / uz(라틴 + 아포스트로피·특유 단어)
  const letters = cleanText.replace(/[^a-zA-Z가-힣а-яА-ЯЁёӨөҮү]/g, '');
  const koCount = (letters.match(/[가-힣]/g) ?? []).length;
  const cyCount = (letters.match(/[а-яА-ЯЁё]/g) ?? []).length;
  const enCount = (letters.match(/[a-zA-Z]/g) ?? []).length;
  const mnSpecific = (cleanText.match(/[ӨөҮү]/g) ?? []).length; // 몽골어 특유 모음
  const total = koCount + cyCount + enCount || 1;

  // 우즈벡어 라틴 표기 시그널: 아포스트로피(o' g' 등) + 특유 어휘
  const uzbekSignal = /(\bo'|\bg'|sigir|qoramol|veterinar|ferma|so'g'|bo'g')/i.test(cleanText);

  let detectedLang = 'en-US';
  if (koCount / total > 0.3) detectedLang = 'ko-KR';
  else if (cyCount / total > 0.3) {
    // 키릴인데 Ө/Ү 포함이면 몽골어, 아니면 러시아어
    detectedLang = mnSpecific > 0 ? 'mn-MN' : 'ru-RU';
  } else if (uzbekSignal) {
    detectedLang = 'uz-UZ';
  }

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

function getContextualSuggestions(
  t: TFunction,
  ctx?: DashboardContext,
  role?: string,
): readonly string[] {
  // 방역관 전용 suggestions
  if (role === 'quarantine_officer') {
    return [
      t('tb.sugg.quarantine.fever_status'),
      t('tb.sugg.quarantine.top5_risk'),
      t('tb.sugg.quarantine.actions_pending'),
      t('tb.sugg.quarantine.cluster_status'),
    ];
  }

  const base: string[] = [];

  if (ctx) {
    if (ctx.criticalCount > 0) {
      base.push(t('tb.sugg.dyn.critical_count', { count: ctx.criticalCount }));
    }
    if (ctx.healthIssues > 0) {
      base.push(t('tb.sugg.dyn.health_count', { count: ctx.healthIssues }));
    }
    base.push(t('tb.sugg.general.first_action'));
    base.push(t('tb.sugg.general.tb_learning'));
    base.push(t('tb.sugg.general.estrus_detected'));
  } else {
    base.push(t('tb.sugg.general.urgent_today'));
    base.push(t('tb.sugg.general.farm_summary'));
    base.push(t('tb.sugg.general.tb_learning'));
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
  const [isExpanded, setIsExpanded] = useState(false); // alwaysOpen 모드 모바일: 메시지 영역 펼침
  const [isMinimized, setIsMinimized] = useState(false);
  // 데스크탑 alwaysOpen 모드에서 사이드바 표시 여부 — 기본 닫힘, 호출/클릭 시 열림
  const [desktopSidebarOpen, setDesktopSidebarOpen] = useState(false);
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

  // OpenAI Nova 음성 출력 (브라우저 TTS 대체) — 기본 ON, 토글 가능
  const voiceOutput = useVoiceOutput({
    voice: 'nova',
    maxChars: 500,
    initialVoiceMode: true,
    storageKey: 'cowtalk:tinkerbell:voice-mode',
  });

  const t = useT();
  const { lang: uiLang } = useLang();
  const isQuarantineMode = user?.role === 'quarantine_officer';
  const suggestions = animalContext
    ? [
        t('tb.sugg.animal.inseminate_now'),
        t('tb.sugg.animal.why_fever'),
        t('tb.sugg.animal.next_action'),
        t('tb.sugg.animal.breeding_history'),
      ]
    : getContextualSuggestions(t, dashboardContext, user?.role);

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

    // (필러 제거됨 — 응답이 곧장 오는 게 자연스럽다는 사용자 피드백)

    // 학습 현황 질문 감지 → 소버린 통계 컨텍스트 주입
    const isLearningQuery = /학습|배웠|소버린|정확도|오탐|레이블|지식.*강화/i.test(question);
    const sovereignContext = isLearningQuery && sovereignStats
      ? `\n\n${formatSovereignContext(sovereignStats)}`
      : '';

    // 다층 타임아웃 변수 — try/catch 양쪽에서 정리 필요
    let fetchTimeout: ReturnType<typeof setTimeout> | undefined;
    let heartbeat: ReturnType<typeof setInterval> | undefined;

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
        uiLang,
      };

      // 다층 타임아웃: 전체 90초 + 첫 바이트 30초 + 무응답 45초 (시연 중 빠른 실패 처리)
      const controller = new AbortController();
      const TOTAL_TIMEOUT_MS = 90_000;
      const FIRST_BYTE_TIMEOUT_MS = 30_000;
      const STALL_TIMEOUT_MS = 45_000;
      fetchTimeout = setTimeout(() => controller.abort(), TOTAL_TIMEOUT_MS);
      let lastDataAt = Date.now();
      let firstByteReceived = false;
      heartbeat = setInterval(() => {
        const idleMs = Date.now() - lastDataAt;
        const limit = firstByteReceived ? STALL_TIMEOUT_MS : FIRST_BYTE_TIMEOUT_MS;
        if (idleMs > limit) controller.abort();
      }, 5_000);

      // 스트리밍: Netlify 프록시 타임아웃 회피를 위해 Railway 직접 호출 지원
      // VITE_API_BASE_URL 설정되어 있으면 절대 URL, 아니면 상대 경로(기존 방식)
      const apiBase = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace(/\/$/, '') ?? '';
      const streamUrl = `${apiBase}/api/chat/stream`;

      const res = await fetch(streamUrl, {
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

      // Netlify Edge가 timeout 시 'Inactivity Timeout' HTML을 캐시해서 SSE 응답으로 반환하는
      // 케이스 방어. content-type이 HTML이거나 응답이 '<'로 시작하면 캐시된 가짜 응답.
      const contentType = res.headers.get('content-type') ?? '';
      const cacheStatus = res.headers.get('cache-status') ?? '';
      if (contentType.includes('html') || cacheStatus.includes('hit')) {
        throw new Error(`SSE 캐시 충돌 (content-type=${contentType}, cache=${cacheStatus}) — 잠시 후 재시도해 주세요`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let fullText = '';
      let errorText = '';
      const startedAt = new Date();
      let firstChunk = true;
      // 진단용 카운터 — 빈 응답 시 어디까지 왔는지 역추적
      let dataLineCount = 0;
      let textEventCount = 0;
      let toolEventCount = 0;
      let doneReceived = false;
      let rawBytes = 0;
      let firstByteChecked = false;

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        rawBytes += value.byteLength;
        lastDataAt = Date.now();
        firstByteReceived = true;

        // 첫 byte가 '<'면 HTML 응답 (Netlify Edge timeout HTML) — 즉시 throw
        if (!firstByteChecked && value.byteLength > 0) {
          firstByteChecked = true;
          if (value[0] === 0x3C /* '<' */) {
            throw new Error('SSE 응답이 HTML입니다 (Netlify Edge 캐시 충돌) — 잠시 후 다시 시도해 주세요');
          }
        }

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          dataLineCount++;
          try {
            const parsed = JSON.parse(line.slice(6)) as StreamChunk;
            if (parsed.type === 'done') {
              doneReceived = true;
              if (parsed.content) fullText = parsed.content;
              break;
            }
            if (parsed.type === 'text') {
              textEventCount++;
              fullText += parsed.content;
              setStreamText(fullText);
              if (firstChunk) { setState('speaking'); firstChunk = false; }
            }
            if (parsed.type === 'error') {
              errorText = parsed.content;
            }
            if (parsed.type === 'tool_event' && parsed.toolName && parsed.phase) {
              toolEventCount++;
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

      clearInterval(heartbeat);
      clearTimeout(fetchTimeout);
      const elapsedMs = Date.now() - startedAt.getTime();

      // 빈 응답 진단 — 어디서 끊겼는지 정확히 표시
      const emptyDiag = `스트림 ${(elapsedMs/1000).toFixed(1)}초 후 종료 — 데이터 ${dataLineCount}개/텍스트 ${textEventCount}개/도구 ${toolEventCount}개/바이트 ${rawBytes}${doneReceived ? '/done 수신' : '/done 미수신'}`;
      if (!fullText && !errorText) {
        console.warn('[Tinkerbell] 빈 응답:', emptyDiag);
      }

      const answer = fullText
        || (errorText ? `⚠️ ${t('common.error')}: ${errorText}` : `${t('tb.err.no_response')}\n(${emptyDiag})`);
      setStreamText('');
      setToolActivities([]);
      setMessages((prev) => [...prev, { role: 'assistant', content: answer, timestamp: startedAt }]);
      setState('speaking');

      // 음성 출력: voiceMode가 ON이면 OpenAI Nova 사용, 실패 시 브라우저 TTS fallback.
      // OFF면 무음 (사용자가 명시적으로 끔).
      // 에러는 Console에만 기록 — 사용자 화면에 배너는 노출하지 않음
      // (브라우저 TTS로 자동 fallback되어 소리는 나오므로 배너는 혼란만 야기)
      if (voiceOutput.voiceMode) {
        voiceOutput.speakText(answer)
          .then(() => setState('idle'))
          .catch((err) => {
            const msg = err instanceof Error ? err.message : String(err);
            console.warn('[Tinkerbell TTS] OpenAI 실패, 브라우저 TTS로 대체:', msg);
            speak(answer, () => setState('idle'));
          });
      } else {
        setState('idle');
      }
    } catch (err) {
      clearInterval(heartbeat);
      clearTimeout(fetchTimeout);
      setStreamText('');
      const fetchErr = err as { message?: string; name?: string };
      const isAbort = fetchErr.name === 'AbortError';
      const isCacheConflict = fetchErr.message?.includes('캐시 충돌') || fetchErr.message?.includes('HTML');
      const isNetworkError = fetchErr.message?.includes('Failed to fetch') || fetchErr.message?.includes('NetworkError');
      const errorContent = isAbort
        ? t('tb.err.no_response')
        : isCacheConflict
        ? t('tb.err.cache_conflict')
        : isNetworkError
        ? t('tb.err.network')
        : t('tb.err.server');

      const errorMsg: TinkerbellMessage = {
        role: 'assistant',
        content: errorContent,
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, errorMsg]);
      setState('idle');
    }
  }, [messages, user?.role, selectedFarmId, farmIdForChat, dashboardContext, animalContext, animalIdForChat, sovereignStats, t, uiLang]);

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

  // iOS Whisper 경로용 — MediaRecorder 상태 추적
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaChunksRef = useRef<Blob[]>([]);
  const mediaStreamRef = useRef<MediaStream | null>(null);

  // iOS Safari: MediaRecorder + Whisper STT 경로
  // Web Speech API가 iOS에서 불안정한 문제를 우회. 녹음 → 서버 업로드 → 텍스트 반환.
  // 단계별 콘솔 로그 + 시각 진단 메시지를 강화 (개발자도구 없이도 사용자가 원인 파악 가능).
  const startListeningWhisper = useCallback(async () => {
    setVoiceError(null);
    stopSpeaking();
    unlockTts();
    console.log('[Whisper] 1) 시작 — getUserMedia 요청');

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      console.log('[Whisper] 2) 스트림 획득 — tracks:', stream.getTracks().length);
      mediaStreamRef.current = stream;

      // iOS Safari MediaRecorder는 'audio/mp4' 만 지원, Android는 'audio/webm' 선호.
      // iOS Safari 16+ 는 isTypeSupported('audio/mp4')=true 인데 실제로 빈 파일을 생성하는 버그가 있음.
      // → 명시 mimeType 없이 기본값으로 두면 iOS가 가장 안정적인 포맷을 자동 선택.
      let mimeType = '';
      const preferred = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'];
      for (const m of preferred) {
        if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(m)) {
          mimeType = m;
          break;
        }
      }
      console.log('[Whisper] 3) MediaRecorder mimeType:', mimeType || '(브라우저 기본)');
      const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;
      mediaChunksRef.current = [];

      recorder.ondataavailable = (e: BlobEvent) => {
        if (e.data && e.data.size > 0) {
          mediaChunksRef.current.push(e.data);
          console.log('[Whisper] 4) chunk 도착:', e.data.size, 'bytes (총', mediaChunksRef.current.length, ')');
        }
      };

      recorder.onstop = async () => {
        console.log('[Whisper] 5) recorder.onstop fired');
        if (mediaStreamRef.current) {
          for (const track of mediaStreamRef.current.getTracks()) track.stop();
          mediaStreamRef.current = null;
        }
        const chunks = mediaChunksRef.current;
        mediaChunksRef.current = [];
        console.log('[Whisper] 6) 총 chunk:', chunks.length, 'bytes:', chunks.reduce((s, c) => s + c.size, 0));
        if (chunks.length === 0) {
          setState('idle');
          setVoiceError('녹음 데이터 없음 — iOS MediaRecorder 호환성 문제일 수 있습니다. Safari 새로고침 또는 Android 권장.');
          return;
        }
        const blob = new Blob(chunks, { type: recorder.mimeType || 'audio/webm' });
        if (blob.size < 800) {
          setState('idle');
          setVoiceError(`녹음 너무 짧음 (${blob.size} bytes). 마이크 버튼 누른 후 1초 이상 말씀해 주세요.`);
          return;
        }
        setState('thinking');
        console.log('[Whisper] 7) Whisper 전사 요청 — blob:', blob.size, 'bytes,', blob.type);
        try {
          const result = await transcribeAudio(blob, uiLang);
          console.log('[Whisper] 8) 전사 완료 — text:', result.text);
          const text = (result.text ?? '').trim();
          if (text) {
            const cleaned = cleanSttTranscript(text);
            askTinkerbell(cleaned);
          } else {
            setState('idle');
            setVoiceError('음성을 인식하지 못했습니다 (빈 텍스트). 다시 시도해 주세요.');
          }
        } catch (err) {
          const e = err as { response?: { status?: number; data?: { error?: { code?: string; message?: string } } }; message?: string };
          const status = e?.response?.status;
          const apiErr = e?.response?.data?.error;
          const detail = apiErr ? `${apiErr.code ?? ''} ${apiErr.message ?? ''}`.trim() : (e?.message ?? '');
          console.warn('[Whisper] 8) 전사 실패:', { status, blobType: blob.type, blobSize: blob.size, detail });
          setState('idle');
          setVoiceError(`음성 인식 실패 (${status ?? 'NET'}): ${detail.slice(0, 200)}`);
        }
      };

      // iOS Safari는 timeslice 없으면 ondataavailable이 onstop 때만 호출됨.
      // 1초 timeslice로 chunk가 도착하는지 실시간 확인 가능 + 데이터 손실 방지.
      recorder.start(1000);
      console.log('[Whisper] 4) recorder.start(1000) — state:', recorder.state);
      setState('listening');
      setTranscript('');

      // 1.5초 안에 ondataavailable이 안 오면 MediaRecorder가 깨진 것.
      window.setTimeout(() => {
        if (mediaChunksRef.current.length === 0 && recorder.state === 'recording') {
          console.warn('[Whisper] 4!) 1.5초 chunk 0개 — MediaRecorder 호환성 문제 가능');
        }
      }, 1500);

      // 자동 정지: 6초 후 (사용자가 다시 마이크 누르면 stopListening이 즉시 정지)
      window.setTimeout(() => {
        if (recorder.state === 'recording') {
          console.log('[Whisper] 4.5) 6초 자동 정지');
          try { recorder.stop(); } catch { /* ignore */ }
        }
      }, 6000);
    } catch (err) {
      const name = (err as { name?: string })?.name ?? '';
      if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
        setVoiceError('마이크 권한을 허용해야 음성으로 질문할 수 있습니다.');
      } else if (name === 'NotFoundError') {
        setVoiceError('마이크를 찾을 수 없습니다.');
      } else {
        setVoiceError('마이크 접근 중 오류가 발생했습니다.');
      }
      setState('idle');
    }
  }, [uiLang, askTinkerbell]);

  // 음성 인식 시작 (권한 체크 + 에러 메시지 포함)
  // iOS Safari 중요: await 체인이 사용자 제스처 컨텍스트를 끊으므로
  // recognition.start()를 동기적으로 먼저 호출해야 한다. 권한 거부는 onerror로 잡힌다.
  const startListening = useCallback(() => {
    // iOS는 Web Speech API 불안정 → MediaRecorder + Whisper로 우회
    if (isIOSDevice()) {
      void startListeningWhisper();
      return;
    }

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
    unlockTts();

    const SpeechRecognitionClass = window.SpeechRecognition || window.webkitSpeechRecognition;
    const recognition = new SpeechRecognitionClass();
    // 다국어 음성 인식: 사용자 UI 언어(uiLang) 우선 → 브라우저 언어 → 한국어
    const UI_LANG_TO_STT: Record<string, string> = {
      ko: 'ko-KR',
      en: 'en-US',
      uz: 'uz-UZ',
      ru: 'ru-RU',
      mn: 'mn-MN',
    };
    const sttLang = UI_LANG_TO_STT[uiLang] ?? (navigator.language || 'ko-KR');
    recognition.lang = sttLang;
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
      const rawText = transcriptRef.current.trim();
      if (rawText) {
        // 발음 엉킴·반복 정규화 — 한국어/우즈벡어 음성 인식이 자주 만드는 잡음 제거
        const cleaned = cleanSttTranscript(rawText);
        askTinkerbell(cleaned);
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
  }, [hasSpeechRecognition, askTinkerbell, uiLang]);

  // 음성 인식 중지 — Web Speech API + MediaRecorder 양쪽 대응
  const stopListening = useCallback(() => {
    if (recognitionRef.current) {
      try { recognitionRef.current.stop(); } catch { /* ignore */ }
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      try { mediaRecorderRef.current.stop(); } catch { /* ignore */ }
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

  // ── Wake Word "팅커벨" — Siri/Alexa 스타일 상시 청취 ──
  // alwaysOpen 모드 + 사용자가 wake 활성화 시: 마이크가 항상 듣고 있다가
  // "팅커벨" 호출 → 자동으로 본격 음성 입력 모드 진입
  const [wakeEnabled, setWakeEnabled] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('cowtalk:tinkerbell:wake-enabled');
      return saved === null ? true : saved === '1'; // 기본 ON
    } catch {
      return true;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem('cowtalk:tinkerbell:wake-enabled', wakeEnabled ? '1' : '0');
    } catch {
      // ignore
    }
  }, [wakeEnabled]);

  // onboarding 카드에서 권한을 막 받으면 wake word 즉시 활성화
  useEffect(() => {
    const onOnboarded = () => setWakeEnabled(true);
    window.addEventListener('tinkerbell:onboarded', onOnboarded);
    return () => window.removeEventListener('tinkerbell:onboarded', onOnboarded);
  }, []);

  // iOS Safari: 페이지 어느 곳이든 첫 사용자 제스처 시 TTS·Audio 자동 잠금해제.
  // 사용자가 "팅커벨"이라 외쳤을 때 인사말과 응답 음성이 무음이 되지 않도록 사전 준비.
  useEffect(() => {
    let unlocked = false;
    const onFirstGesture = (): void => {
      if (unlocked) return;
      unlocked = true;
      try { unlockTts(); } catch { /* ignore */ }
      document.removeEventListener('touchstart', onFirstGesture);
      document.removeEventListener('click', onFirstGesture);
      document.removeEventListener('keydown', onFirstGesture);
    };
    document.addEventListener('touchstart', onFirstGesture, { once: true, passive: true });
    document.addEventListener('click', onFirstGesture, { once: true });
    document.addEventListener('keydown', onFirstGesture, { once: true });
    return () => {
      document.removeEventListener('touchstart', onFirstGesture);
      document.removeEventListener('click', onFirstGesture);
      document.removeEventListener('keydown', onFirstGesture);
    };
  }, []);

  // 짧은 효과음 (Web Audio API — 외부 파일 없이 즉시 발생)
  const playWakeChime = useCallback(() => {
    try {
      const AC = window.AudioContext || (window as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (AC) {
        const ctx = new AC();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.frequency.setValueAtTime(880, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(1320, ctx.currentTime + 0.1);
        gain.gain.setValueAtTime(0.0001, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.18, ctx.currentTime + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.2);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + 0.22);
      }
    } catch {
      // 효과음 실패해도 본 흐름엔 영향 없음
    }
  }, []);

  // wake 인사("네, 하원장님")는 세션당 1회만. 인사말과 듣기는 병렬로 — 인사말이 끝날 때까지
  // 기다리면 사용자가 인사 도중 말한 첫 단어를 놓쳐 답변이 엉키므로, 듣기를 즉시 시작.
  const wakeGreetedRef = useRef(false);
  const handleWakeDetected = useCallback(() => {
    // 이미 본격 마이크가 듣고 있으면 무시 (마이크 충돌 방지)
    if (state === 'listening') return;
    // 답변 중·생각 중이면 먼저 끊기 (Siri 식 barge-in)
    if (state === 'speaking' || state === 'thinking') {
      try { voiceOutput.stopSpeaking(); } catch { /* ignore */ }
      try { stopSpeaking(); } catch { /* ignore */ }
    }
    // 데스크탑에서 호명 시 사이드바 자동 펼침
    if (!isMobile) setDesktopSidebarOpen(true);
    playWakeChime();

    // 첫 호명일 때만 인사말 발화 (병렬 — 듣기를 블로킹하지 않음)
    if (!wakeGreetedRef.current) {
      wakeGreetedRef.current = true;
      const greeting = WAKE_GREETINGS[uiLang] ?? WAKE_GREETINGS.ko!;
      speakImmediate(greeting.text, greeting.lang);
    }

    // 듣기는 항상 즉시 시작 — 인사 끝날 때까지 기다리지 않음
    void startListening();
  }, [state, startListening, playWakeChime, voiceOutput, uiLang, isMobile]);

  // "조용히 해" / "그만" / "stop" 등 — 답변만 끊고 새 질문 모드로 가지 않음
  const handleInterruptDetected = useCallback(() => {
    if (state === 'speaking' || state === 'thinking') {
      try { voiceOutput.stopSpeaking(); } catch { /* ignore */ }
      try { stopSpeaking(); } catch { /* ignore */ }
      setState('idle');
    }
  }, [state, voiceOutput]);

  // wake word는 alwaysOpen + wake 활성화 + (본격 입력 아닐 때) 청취
  // 답변 중·생각 중에도 listening 상태가 아니면 wake/interrupt 청취 가능
  const wakeShouldListen = alwaysOpen && wakeEnabled && state !== 'listening';
  const { listening: wakeListening, supported: wakeSupported, platformLimitation } = useWakeWord({
    enabled: wakeShouldListen,
    onWake: handleWakeDetected,
    onInterrupt: handleInterruptDetected,
    lang: 'ko-KR',
  });

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

  // ── alwaysOpen 모드 — Claude AI처럼 항상 고정 (데스크탑=우측 사이드바, 모바일=하단 바) ──
  const SIDEBAR_WIDTH = 380;

  // 데스크탑 alwaysOpen + 사이드바 열림 시에만 본문 우측 여백 확보
  useEffect(() => {
    if (!alwaysOpen || isMobile || !desktopSidebarOpen) return;
    const prev = document.body.style.paddingRight;
    document.body.style.paddingRight = `${SIDEBAR_WIDTH}px`;
    return () => { document.body.style.paddingRight = prev; };
  }, [alwaysOpen, isMobile, desktopSidebarOpen]);

  if (alwaysOpen) {
    // 데스크탑: 사이드바 닫힘 상태면 플로팅 버튼만 표시
    if (!isMobile && !desktopSidebarOpen) {
      return (
        <button
          type="button"
          onClick={() => setDesktopSidebarOpen(true)}
          aria-label="팅커벨 열기"
          title="팅커벨에게 물어보기 (또는 '팅커벨' 호명)"
          style={{
            position: 'fixed',
            bottom: 24,
            right: 24,
            width: 56,
            height: 56,
            borderRadius: '50%',
            background: `linear-gradient(135deg, ${color}, #7c3aed)`,
            border: 'none',
            cursor: 'pointer',
            boxShadow: `0 6px 20px ${color}60`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9990,
            transition: 'transform 0.2s',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.transform = 'scale(1.06)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.transform = 'scale(1)'; }}
        >
          <svg width="26" height="26" viewBox="0 0 24 24" fill="white" stroke="none">
            <path d="M12 2 L13.5 8.5 L20 10 L13.5 11.5 L12 18 L10.5 11.5 L4 10 L10.5 8.5 Z" />
          </svg>
        </button>
      );
    }

    const bottomOffset = isMobile ? 60 : 0;
    // 데스크탑 사이드바 열림: 항상 펼침 / 모바일: isExpanded 토글
    const sidebarExpanded = isMobile ? isExpanded : true;

    // 컨테이너 위치·크기 — 데스크탑 우측 사이드바 vs 모바일 하단 바
    const containerStyle: React.CSSProperties = isMobile
      ? {
          position: 'fixed',
          bottom: bottomOffset,
          left: 0,
          right: 0,
          zIndex: 9990,
          background: 'var(--ct-card, #1e293b)',
          borderTop: `1px solid ${color}40`,
          boxShadow: '0 -4px 24px rgba(0,0,0,0.3)',
          boxSizing: 'border-box',
          maxWidth: '100vw',
          overflowX: 'hidden',
        }
      : {
          position: 'fixed',
          top: 0,
          right: 0,
          bottom: 0,
          width: SIDEBAR_WIDTH,
          zIndex: 9990,
          background: 'var(--ct-card, #1e293b)',
          borderLeft: `1px solid ${color}40`,
          boxShadow: '-4px 0 24px rgba(0,0,0,0.3)',
          boxSizing: 'border-box',
          display: 'flex',
          flexDirection: 'column',
        };

    return (
      <>
        <style>{`
          @keyframes tinkerbell-dot { 0%,80%,100%{opacity:0.2}40%{opacity:1} }
          @keyframes tb-slide-up { from{opacity:0;transform:translateY(8px)} to{opacity:1;transform:translateY(0)} }
        `}</style>

        {/* 채팅 패널 — 데스크탑: 우측 사이드바 / 모바일: 하단 바 */}
        <div style={containerStyle}>
          {/* 데스크탑 사이드바 헤더 — 제목 + 언어 선택 + 닫기 */}
          {!isMobile && (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '10px 14px',
              borderBottom: '1px solid rgba(255,255,255,0.06)',
              flexShrink: 0,
              background: `linear-gradient(135deg, ${color}15, transparent)`,
              gap: 8,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                <span style={{ fontSize: 16 }}>🧚</span>
                <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--ct-text, #f1f5f9)', whiteSpace: 'nowrap' }}>
                  팅커벨 AI
                </span>
                <span style={{ fontSize: 10, color, fontWeight: 600, whiteSpace: 'nowrap' }}>{stateLabels[state]}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                <LangSwitcher compact />
                <button
                  type="button"
                  onClick={() => setDesktopSidebarOpen(false)}
                  aria-label="팅커벨 닫기"
                  title="닫기"
                  style={{
                    background: 'none',
                    border: 'none',
                    color: 'var(--ct-text-muted, #94a3b8)',
                    cursor: 'pointer',
                    fontSize: 18,
                    padding: '2px 8px',
                    lineHeight: 1,
                  }}
                >✕</button>
              </div>
            </div>
          )}


          {/* 메시지 영역 — 데스크탑 사이드바는 항상 펼침, 모바일은 토글 */}
          {sidebarExpanded && (
            <div style={{
              ...(isMobile
                ? { maxHeight: '40dvh' }
                : { flex: 1, minHeight: 0 }),
              overflowY: 'auto',
              padding: '12px 16px 4px',
              display: 'flex',
              flexDirection: 'column',
              gap: 8,
              animation: isMobile ? 'tb-slide-up 0.2s ease' : undefined,
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
          {sidebarExpanded && messages.length === 0 && state === 'idle' && (
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

          {/* 입력 바 — 항상 표시 (Claude 스타일). flexShrink:0 으로 메시지 영역이 밀어내도 보존 */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: isMobile ? 6 : 8,
            padding: isMobile ? '8px 10px' : '10px 14px 10px',
            minWidth: 0,
            boxSizing: 'border-box',
            flexShrink: 0,
            borderTop: isMobile ? 'none' : '1px solid rgba(255,255,255,0.06)',
            background: 'var(--ct-card, #1e293b)',
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

            {/* 언어 선택자: 입력 바 폭 확보 위해 alwaysOpen(모바일+데스크탑 사이드바) 모두 헤더로 이동 */}

            {/* 마이크 버튼 */}
            <button type="button"
              onClick={() => {
                if (!hasSpeechRecognition) { setVoiceError(t('voice.err.not_supported')); return; }
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

            {/* Wake Word "팅커벨" 토글 — 입력 바 폭 확보 위해 alwaysOpen 사이드바에서는 헤더로 이동.
                 alwaysOpen=false 인 비-사이드바 환경에서만 입력 바에 표시 */}
            {wakeSupported && !isMobile && !alwaysOpen && (
              <button type="button"
                onClick={() => setWakeEnabled((v) => !v)}
                aria-pressed={wakeEnabled}
                style={{
                  height: 34, padding: '0 10px', borderRadius: 17, flexShrink: 0,
                  background: wakeEnabled
                    ? (wakeListening ? 'rgba(167,139,250,0.18)' : 'rgba(167,139,250,0.10)')
                    : 'rgba(255,255,255,0.04)',
                  border: wakeEnabled
                    ? `1px solid ${color}80`
                    : '1px solid var(--ct-border, #334155)',
                  color: wakeEnabled ? color : 'var(--ct-text-muted, #94a3b8)',
                  fontSize: 11,
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'flex', alignItems: 'center', gap: 5,
                  transition: 'all 0.2s',
                }}
                title={wakeEnabled
                  ? (wakeListening
                      ? (isMobile
                          ? '"팅커벨"이라고 부르면 즉시 듣기 시작 — 화면이 꺼지면 청취가 멈춥니다'
                          : '"팅커벨"이라고 부르면 즉시 듣기 시작')
                      : '호출 대기 중...')
                  : '"팅커벨" 호출 비활성. 클릭해서 켜기'}
              >
                <span style={{
                  width: 6, height: 6, borderRadius: '50%',
                  background: wakeEnabled && wakeListening ? '#34d399' : (wakeEnabled ? '#fbbf24' : '#64748b'),
                  boxShadow: wakeEnabled && wakeListening ? '0 0 6px #34d399' : 'none',
                }} />
                <span>팅커벨</span>
              </button>
            )}
            {/* iOS Safari/Chrome — wake word 미지원, 마이크 버튼 안내. 모바일은 폭 양보. */}
            {!wakeSupported && platformLimitation === 'ios' && !isMobile && (
              <span
                style={{
                  height: 34, padding: '0 10px', borderRadius: 17, flexShrink: 0,
                  background: 'rgba(251,191,36,0.10)',
                  border: '1px solid rgba(251,191,36,0.35)',
                  color: '#fbbf24',
                  fontSize: 10.5,
                  fontWeight: 600,
                  display: 'inline-flex', alignItems: 'center', gap: 5,
                  whiteSpace: 'nowrap',
                }}
                title="iOS는 음성 호출이 제한됩니다. 마이크 버튼을 눌러 질문하세요."
              >
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#fbbf24' }} />
                마이크 버튼
              </span>
            )}

            {/* 텍스트 입력 */}
            <input
              type="text"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleTextSubmit(); } }}
              onFocus={() => setIsExpanded(true)}
              placeholder={t('tb.placeholder.input')}
              disabled={state === 'thinking' || state === 'listening'}
              style={{
                flex: 1,
                minWidth: 0,
                width: '100%',
                background: 'rgba(255,255,255,0.06)',
                border: '1px solid var(--ct-border, #334155)',
                borderRadius: 24,
                padding: isMobile ? '8px 12px' : '9px 16px',
                fontSize: isMobile ? 16 : 13,
                color: 'var(--ct-text, #f1f5f9)',
                outline: 'none',
                boxSizing: 'border-box',
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

            {/* 말하는 중 중지 — OpenAI 또는 브라우저 TTS 모두 정지 */}
            {(state === 'speaking' || voiceOutput.isPlaying) && (
              <button type="button"
                onClick={() => { voiceOutput.stopSpeaking(); stopSpeaking(); setState('idle'); }}
                style={{ width: 34, height: 34, borderRadius: '50%', flexShrink: 0, background: '#ef444420', border: '1px solid #ef4444', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                title="말하기 중지"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="#ef4444" stroke="none"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>
              </button>
            )}

            {/* 음성 모드 토글 — ON: OpenAI Nova 음성 / OFF: 무음 */}
            <button type="button"
              onClick={voiceOutput.toggleVoiceMode}
              style={{
                width: 34, height: 34, borderRadius: '50%', flexShrink: 0,
                background: voiceOutput.voiceMode ? `${color}25` : 'rgba(255,255,255,0.06)',
                border: voiceOutput.voiceMode ? `1px solid ${color}` : '1px solid var(--ct-border, #334155)',
                cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                transition: 'all 0.2s',
              }}
              title={voiceOutput.voiceMode ? '음성 답변 ON (Nova) — 클릭하여 끄기' : '음성 답변 OFF — 클릭하여 켜기'}
              aria-label={voiceOutput.voiceMode ? '음성 답변 끄기' : '음성 답변 켜기'}
              aria-pressed={voiceOutput.voiceMode}
            >
              {voiceOutput.voiceMode ? (
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
                  <path d="M15.54 8.46a5 5 0 0 1 0 7.07"/>
                  <path d="M19.07 4.93a10 10 0 0 1 0 14.14"/>
                </svg>
              ) : (
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--ct-text-muted, #94a3b8)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
                  <line x1="23" y1="9" x2="17" y2="15"/>
                  <line x1="17" y1="9" x2="23" y2="15"/>
                </svg>
              )}
            </button>
          </div>
        </div>

        {/* 모바일 하단 채팅창 높이만큼 페이지 하단 여백 확보 (데스크탑은 body padding-right로 대체) */}
        {isMobile && (
          <div style={{ height: isExpanded ? 'calc(40vh + 60px)' : '70px', pointerEvents: 'none' }} />
        )}
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

        {/* 말하는 중 → 중지 버튼 (OpenAI 또는 브라우저 TTS 모두 정지) */}
        {(state === 'speaking' || voiceOutput.isPlaying) && (
          <button
            onClick={() => { voiceOutput.stopSpeaking(); stopSpeaking(); setState('idle'); }}
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

        {/* 음성 모드 토글 — ON: OpenAI Nova / OFF: 무음 */}
        <button
          onClick={voiceOutput.toggleVoiceMode}
          style={{
            width: 40,
            height: 40,
            borderRadius: '50%',
            background: voiceOutput.voiceMode ? `${color}25` : 'rgba(255,255,255,0.06)',
            border: voiceOutput.voiceMode ? `1px solid ${color}` : '1px solid var(--ct-border, #334155)',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
            transition: 'all 0.2s',
          }}
          title={voiceOutput.voiceMode ? '음성 답변 ON (Nova) — 클릭하여 끄기' : '음성 답변 OFF — 클릭하여 켜기'}
          aria-label={voiceOutput.voiceMode ? '음성 답변 끄기' : '음성 답변 켜기'}
          aria-pressed={voiceOutput.voiceMode}
        >
          {voiceOutput.voiceMode ? (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
              <path d="M15.54 8.46a5 5 0 0 1 0 7.07"/>
              <path d="M19.07 4.93a10 10 0 0 1 0 14.14"/>
            </svg>
          ) : (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--ct-text-muted, #94a3b8)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
              <line x1="23" y1="9" x2="17" y2="15"/>
              <line x1="17" y1="9" x2="23" y2="15"/>
            </svg>
          )}
        </button>
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
