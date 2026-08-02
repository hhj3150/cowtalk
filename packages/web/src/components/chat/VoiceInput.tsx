// 음성 입력 버튼 — ChatDrawer용
//
// 이전에는 이 파일이 Web Speech API를 자체 구현하면서 `any`를 썼고,
// 권한 거부·HTTPS 아님·마이크 없음 같은 실패를 조용히 삼켜 사용자가 원인을 알 수 없었다.
// 이제 useVoiceInput 훅(권한 선확인 + 한국어 오류 메시지)을 그대로 쓰고,
// 인식 결과는 축산 도메인 보정을 거쳐 상위로 올린다.

import React, { useCallback } from 'react';
import { useVoiceInput } from '@web/hooks/useVoiceInput';
import { correctSttTranscript } from '@web/lib/voice/stt-correction';
import { useLang } from '@web/i18n/useT';

interface Props {
  readonly onResult: (text: string) => void;
}

export function VoiceInput({ onResult }: Props): React.JSX.Element {
  const { lang } = useLang();

  const handleResult = useCallback(
    (text: string) => {
      const corrected = correctSttTranscript(text, lang).text;
      if (corrected.trim()) onResult(corrected);
    },
    [onResult, lang],
  );

  const { isListening, isSupported, error, startListening, stopListening, dismissError } =
    useVoiceInput(handleResult);

  if (!isSupported) return <></>;

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => {
          if (isListening) stopListening();
          else void startListening();
        }}
        className={`rounded-full p-2 transition-colors ${
          isListening
            ? 'animate-pulse bg-red-100 text-red-600'
            : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
        }`}
        aria-label={isListening ? '음성 입력 중지' : '음성 입력'}
        aria-pressed={isListening}
        title={isListening ? '듣는 중 — 클릭하여 중지' : '음성으로 입력'}
      >
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
        </svg>
      </button>

      {/* 실패 원인을 반드시 보여준다 — 현장에서 "왜 안 되지?"가 가장 큰 좌절 */}
      {error && (
        <div
          role="alert"
          className="absolute bottom-full right-0 z-10 mb-2 w-56 rounded-lg bg-red-50 p-2 text-xs text-red-700 shadow-lg"
        >
          <p>{error.message}</p>
          <button
            type="button"
            onClick={dismissError}
            className="mt-1 font-semibold text-red-900 underline"
          >
            닫기
          </button>
        </div>
      )}
    </div>
  );
}
