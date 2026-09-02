// 음성 콘솔 — 화면이 아니라 목소리가 주 인터페이스인 화면.
//
// 현장 전제:
//  - 장갑을 낀 손, 축사 소음, 한 손은 소를 붙잡고 있다
//  - 화면을 자세히 볼 수 없다. 자막은 "확인용"이지 읽는 용도가 아니다
//  - 그래서 버튼 하나가 화면의 절반을 차지한다. 조준할 필요가 없어야 한다
//
// 웹·스마트폰 동일 코드. 뷰포트에 따라 버튼 크기만 달라진다.

import React, { useEffect, useRef } from 'react';
import { useVoiceTurn } from './useVoiceTurn';

interface VoiceConsoleProps {
  readonly farmId?: string;
}

const STATE_LABEL: Record<string, string> = {
  idle: '눌러서 말하기',
  recording: '듣고 있습니다',
  thinking: '확인 중입니다',
  speaking: '답하는 중입니다',
};

export default function VoiceConsole({ farmId }: VoiceConsoleProps): React.JSX.Element {
  const { state, transcript, reply, messages, error, start, stop, cancel } = useVoiceTurn(farmId);
  const logRef = useRef<HTMLDivElement | null>(null);

  // 새 대화가 붙으면 아래로 — 화면을 보고 있는 사용자를 위한 보조 동작
  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages.length, reply]);

  const busy = state === 'thinking' || state === 'speaking';
  const listening = state === 'recording';

  // push-to-talk: 누르는 동안 녹음, 떼면 전송.
  // 터치와 마우스를 모두 받는다. 포인터 이벤트 하나로 처리하면
  // 일부 안드로이드 브라우저에서 취소가 안 잡혀 마이크가 계속 열린다.
  const press = (): void => { if (!listening) void start(); };
  const release = (): void => { if (listening) stop(); };

  return (
    <div className="flex h-full min-h-0 flex-col bg-slate-950 text-slate-100">
      {/* 상태 표시 — 화면을 흘긋 봤을 때 한 눈에 */}
      <header className="flex items-center justify-between px-4 py-3 border-b border-slate-800">
        <div className="flex items-center gap-2">
          <span
            className={
              'inline-block h-2.5 w-2.5 rounded-full ' +
              (listening ? 'bg-red-500 animate-pulse'
                : state === 'speaking' ? 'bg-emerald-400 animate-pulse'
                : state === 'thinking' ? 'bg-amber-400 animate-pulse'
                : 'bg-slate-600')
            }
          />
          <span className="text-sm font-semibold">{STATE_LABEL[state]}</span>
        </div>
        {busy && (
          <button
            type="button"
            onClick={cancel}
            className="rounded-md border border-slate-700 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-800"
          >
            중지
          </button>
        )}
      </header>

      {/* 대화 로그 — 보조. 크게, 두 줄만 눈에 들어와도 충분하게 */}
      <div ref={logRef} className="flex-1 min-h-0 overflow-y-auto px-4 py-4 space-y-3">
        {messages.length === 0 && !transcript && (
          <div className="mt-10 text-center text-slate-500">
            <p className="text-base">버튼을 누른 채로 말씀하세요.</p>
            <p className="mt-2 text-sm">“1877번 어때?” · “오늘 할 일 뭐야?” · “수정할 소 있어?”</p>
          </div>
        )}

        {messages.map((m, i) => (
          <div
            key={i}
            className={m.role === 'user' ? 'text-right' : 'text-left'}
          >
            <span
              className={
                'inline-block max-w-[85%] rounded-2xl px-4 py-2.5 text-[15px] leading-relaxed ' +
                (m.role === 'user'
                  ? 'bg-slate-800 text-slate-200'
                  : 'bg-emerald-900/40 text-emerald-50 border border-emerald-800/60')
              }
            >
              {m.text}
            </span>
          </div>
        ))}

        {/* 진행 중인 응답 */}
        {reply && !messages.some((m) => m.role === 'assistant' && m.text === reply) && (
          <div className="text-left">
            <span className="inline-block max-w-[85%] rounded-2xl border border-emerald-800/60 bg-emerald-900/40 px-4 py-2.5 text-[15px] leading-relaxed text-emerald-50">
              {reply}
            </span>
          </div>
        )}

        {error && (
          <p className="rounded-lg border border-red-900/60 bg-red-950/40 px-3 py-2 text-sm text-red-300">
            {error}
          </p>
        )}
      </div>

      {/* 말하기 버튼 — 화면 하단을 크게 차지한다. 조준이 필요 없어야 한다 */}
      <div className="border-t border-slate-800 px-6 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-5">
        <button
          type="button"
          aria-label={listening ? '놓으면 전송' : '누른 채로 말하기'}
          disabled={busy}
          onPointerDown={press}
          onPointerUp={release}
          onPointerLeave={release}
          onPointerCancel={release}
          className={
            'mx-auto flex w-full max-w-md select-none items-center justify-center gap-3 rounded-3xl ' +
            'py-7 text-lg font-bold transition-colors touch-none ' +
            (busy
              ? 'bg-slate-800 text-slate-500'
              : listening
                ? 'bg-red-600 text-white shadow-lg shadow-red-900/40'
                : 'bg-emerald-600 text-white active:bg-emerald-700')
          }
        >
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z" />
            <path d="M19 10v2a7 7 0 0 1-14 0v-2M12 19v3" strokeLinecap="round" />
          </svg>
          {listening ? '놓으면 전송' : busy ? STATE_LABEL[state] : '누른 채로 말하기'}
        </button>
        <p className="mt-3 text-center text-xs text-slate-500">
          개체번호는 다시 확인해 드립니다. 기록은 확답을 받고 실행합니다.
        </p>
      </div>
    </div>
  );
}
