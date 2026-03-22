// 음성 입력 훅 — Web Speech API 한국어 음성 인식
// InlineAiChat, AlarmLabelChatModal, GeniVoiceAssistant 공용

import { useState, useRef, useCallback } from 'react';

export interface UseVoiceInputReturn {
  readonly isListening: boolean;
  readonly transcript: string;
  readonly isSupported: boolean;
  readonly startListening: () => void;
  readonly stopListening: () => void;
}

export function useVoiceInput(onResult: (text: string) => void): UseVoiceInputReturn {
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const transcriptRef = useRef('');
  const onResultRef = useRef(onResult);
  onResultRef.current = onResult;

  const isSupported = typeof window !== 'undefined' &&
    ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window);

  const startListening = useCallback(() => {
    if (!isSupported) return;

    const SpeechRecognitionClass = window.SpeechRecognition || window.webkitSpeechRecognition;
    const recognition = new SpeechRecognitionClass();
    recognition.lang = 'ko-KR';
    recognition.continuous = false;
    recognition.interimResults = true;

    recognition.onstart = () => {
      setIsListening(true);
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
      setIsListening(false);
      const finalText = transcriptRef.current.trim();
      if (finalText) {
        onResultRef.current(finalText);
      }
      transcriptRef.current = '';
      setTranscript('');
    };

    recognition.onerror = () => {
      setIsListening(false);
      setTranscript('');
      transcriptRef.current = '';
    };

    recognitionRef.current = recognition;
    recognition.start();
  }, [isSupported]);

  const stopListening = useCallback(() => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
    }
  }, []);

  return { isListening, transcript, isSupported, startListening, stopListening };
}
