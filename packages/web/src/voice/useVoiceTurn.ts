// 음성 턴 훅 — 녹음 → 서버 SSE → 순차 오디오 재생.
//
// 설계 원칙:
//  1) 첫 소리를 최대한 빨리. 서버가 문장 단위로 밀어주므로 도착하는 대로 재생한다.
//  2) 순서 보장. seq 로 정렬해 재생 큐에 넣는다 — 네트워크는 순서를 안 지킨다.
//  3) 끼어들기. 사용자가 다시 누르면 재생 중인 오디오를 즉시 끊는다.
//  4) 실패해도 자막은 남는다. TTS 가 죽어도 대화는 계속된다.

import { useCallback, useEffect, useRef, useState } from 'react';

export type VoiceTurnState = 'idle' | 'recording' | 'thinking' | 'speaking';

export interface VoiceTurnMessage {
  readonly role: 'user' | 'assistant';
  readonly text: string;
}

export interface UseVoiceTurnReturn {
  readonly state: VoiceTurnState;
  readonly transcript: string;
  readonly reply: string;
  readonly messages: readonly VoiceTurnMessage[];
  readonly error: string | null;
  readonly start: () => Promise<void>;
  readonly stop: () => void;
  readonly cancel: () => void;
}

interface AudioChunk { seq: number; blob: Blob }

/** MediaRecorder 가 지원하는 첫 포맷을 고른다 — 브라우저마다 다르다 */
function pickMimeType(): string {
  const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus'];
  for (const c of candidates) {
    if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(c)) return c;
  }
  return 'audio/webm';
}

export function useVoiceTurn(farmId?: string): UseVoiceTurnReturn {
  const [state, setState] = useState<VoiceTurnState>('idle');
  const [transcript, setTranscript] = useState('');
  const [reply, setReply] = useState('');
  const [messages, setMessages] = useState<VoiceTurnMessage[]>([]);
  const [error, setError] = useState<string | null>(null);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // 재생 큐 — seq 순서대로 하나씩 재생한다
  const queueRef = useRef<AudioChunk[]>([]);
  const nextSeqRef = useRef(0);
  const playingRef = useRef(false);
  const audioElRef = useRef<HTMLAudioElement | null>(null);

  const stopPlayback = useCallback(() => {
    queueRef.current = [];
    nextSeqRef.current = 0;
    playingRef.current = false;
    const el = audioElRef.current;
    if (el) {
      el.pause();
      if (el.src) URL.revokeObjectURL(el.src);
      el.removeAttribute('src');
    }
  }, []);

  const pump = useCallback(() => {
    if (playingRef.current) return;
    const idx = queueRef.current.findIndex((c) => c.seq === nextSeqRef.current);
    if (idx < 0) return;
    const chunk = queueRef.current.splice(idx, 1)[0];
    if (!chunk) return;

    playingRef.current = true;
    const url = URL.createObjectURL(chunk.blob);
    let el = audioElRef.current;
    if (!el) {
      el = new Audio();
      audioElRef.current = el;
    }
    const onEnd = (): void => {
      URL.revokeObjectURL(url);
      playingRef.current = false;
      nextSeqRef.current += 1;
      setState((s) => (s === 'speaking' && queueRef.current.length === 0 ? 'idle' : s));
      pump();
    };
    el.onended = onEnd;
    el.onerror = onEnd; // 한 청크가 깨져도 다음으로 넘어간다
    el.src = url;
    setState('speaking');
    void el.play().catch(() => {
      // 자동재생 차단 — 사용자가 버튼을 눌러 시작했으므로 보통 걸리지 않는다
      onEnd();
    });
  }, []);

  const enqueue = useCallback((seq: number, b64: string, contentType: string) => {
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    queueRef.current.push({ seq, blob: new Blob([bytes], { type: contentType }) });
    pump();
  }, [pump]);

  /** 서버로 오디오를 보내고 SSE 를 읽는다 */
  const send = useCallback(async (audio: Blob) => {
    setState('thinking');
    setReply('');
    stopPlayback();

    const ctrl = new AbortController();
    abortRef.current = ctrl;

    const token = localStorage.getItem('token') ?? '';
    const qs = farmId ? `?farmId=${encodeURIComponent(farmId)}` : '';

    try {
      const res = await fetch(`/api/voice/turn${qs}`, {
        method: 'POST',
        headers: {
          'Content-Type': audio.type || 'audio/webm',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: audio,
        signal: ctrl.signal,
      });
      if (!res.ok || !res.body) throw new Error(`음성 처리 실패 (${res.status})`);

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = '';
      let acc = '';

      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });

        // SSE 프레임은 빈 줄로 구분된다
        let sep: number;
        while ((sep = buf.indexOf('\n\n')) >= 0) {
          const frame = buf.slice(0, sep);
          buf = buf.slice(sep + 2);
          const evLine = frame.split('\n').find((l) => l.startsWith('event: '));
          const dataLine = frame.split('\n').find((l) => l.startsWith('data: '));
          if (!evLine || !dataLine) continue;
          const ev = evLine.slice(7).trim();
          const data = JSON.parse(dataLine.slice(6)) as Record<string, unknown>;

          if (ev === 'transcript') {
            const text = String(data.text ?? '');
            setTranscript(text);
            if (text) setMessages((m) => [...m, { role: 'user', text }]);
          } else if (ev === 'text') {
            const s = String(data.sentence ?? '');
            acc = acc ? `${acc} ${s}` : s;
            setReply(acc);
          } else if (ev === 'audio') {
            enqueue(Number(data.seq), String(data.b64), String(data.contentType));
          } else if (ev === 'done') {
            if (acc) setMessages((m) => [...m, { role: 'assistant', text: acc }]);
            if (queueRef.current.length === 0 && !playingRef.current) setState('idle');
          } else if (ev === 'error') {
            setError(String(data.message ?? '오류가 발생했습니다'));
            setState('idle');
          }
        }
      }
    } catch (e) {
      if ((e as Error).name !== 'AbortError') {
        setError(e instanceof Error ? e.message : '음성 처리에 실패했습니다');
      }
      setState('idle');
    }
  }, [farmId, enqueue, stopPlayback]);

  const start = useCallback(async () => {
    setError(null);
    setTranscript('');
    stopPlayback(); // 말하는 중에 누르면 끊는다 (끼어들기)

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      streamRef.current = stream;
      const mimeType = pickMimeType();
      const rec = new MediaRecorder(stream, { mimeType });
      recorderRef.current = rec;

      const parts: Blob[] = [];
      rec.ondataavailable = (e) => { if (e.data.size > 0) parts.push(e.data); };
      rec.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
        if (parts.length > 0) void send(new Blob(parts, { type: mimeType }));
        else setState('idle');
      };
      rec.start();
      setState('recording');
    } catch {
      setError('마이크를 사용할 수 없습니다. 권한을 확인해 주세요.');
      setState('idle');
    }
  }, [send, stopPlayback]);

  const stop = useCallback(() => {
    const rec = recorderRef.current;
    if (rec && rec.state !== 'inactive') rec.stop();
    recorderRef.current = null;
  }, []);

  const cancel = useCallback(() => {
    abortRef.current?.abort();
    stop();
    stopPlayback();
    setState('idle');
  }, [stop, stopPlayback]);

  useEffect(() => () => {
    abortRef.current?.abort();
    streamRef.current?.getTracks().forEach((t) => t.stop());
    stopPlayback();
  }, [stopPlayback]);

  return { state, transcript, reply, messages, error, start, stop, cancel };
}
