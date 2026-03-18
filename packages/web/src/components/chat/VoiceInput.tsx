// 음성 입력 버튼 — Web Speech API

import React, { useState, useCallback } from 'react';

interface Props {
  readonly onResult: (text: string) => void;
}

export function VoiceInput({ onResult }: Props): React.JSX.Element {
  const [isListening, setIsListening] = useState(false);
  const supported = typeof window !== 'undefined' && ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window);

  const startListening = useCallback(() => {
    if (!supported) return;

    const SpeechRecognition = (window as unknown as Record<string, unknown>).SpeechRecognition ?? (window as unknown as Record<string, unknown>).webkitSpeechRecognition;
    if (!SpeechRecognition) return;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const recognition = new (SpeechRecognition as any)();
    recognition.lang = 'ko-KR';
    recognition.continuous = false;
    recognition.interimResults = false;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    recognition.onresult = (event: any) => {
      const transcript = event.results[0]?.[0]?.transcript;
      if (transcript) onResult(transcript);
      setIsListening(false);
    };

    recognition.onerror = () => {
      setIsListening(false);
    };

    recognition.onend = () => {
      setIsListening(false);
    };

    setIsListening(true);
    recognition.start();
  }, [supported, onResult]);

  if (!supported) return <></>;

  return (
    <button
      type="button"
      onClick={startListening}
      disabled={isListening}
      className={`rounded-full p-2 transition-colors ${
        isListening
          ? 'animate-pulse bg-red-100 text-red-600'
          : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
      }`}
      aria-label="음성 입력"
    >
      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
      </svg>
    </button>
  );
}
