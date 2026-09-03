// 음성 턴 훅 — 녹음 → 서버 SSE → 순차 오디오 재생.
//
// 설계 원칙:
//  1) 첫 소리를 최대한 빨리. 서버가 문장 단위로 밀어주므로 도착하는 대로 재생한다.
//  2) 순서 보장. seq 로 정렬해 재생 큐에 넣는다 — 네트워크는 순서를 안 지킨다.
//  3) 끼어들기. 사용자가 다시 누르면 재생 중인 오디오를 즉시 끊는다.
//  4) 실패해도 자막은 남는다. TTS 가 죽어도 대화는 계속된다.

import { useCallback, useEffect, useRef, useState } from 'react';
import { attachMicActivity, type MicActivityHandle } from './useMicActivity';

export type VoiceTurnState = 'idle' | 'recording' | 'thinking' | 'speaking';

export interface VoiceTurnMessage {
  readonly role: 'user' | 'assistant';
  readonly text: string;
}

export interface UseVoiceTurnOptions {
  /**
   * 핸즈프리 — 답변이 끝나면 자동으로 다시 듣는다.
   * 장갑 낀 손으로 버튼을 반복해 누를 수 없는 현장을 위한 모드.
   */
  readonly handsFree?: boolean;
  /** 답변 재생 중 사용자가 말하면 즉시 멈추고 듣기로 전환 */
  readonly bargeIn?: boolean;
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

// 무음 WAV 0.0초. iOS Safari 는 **사용자 제스처 안에서 한 번이라도 재생된 적 없는**
// <audio> 요소의 play() 를 막는다. SSE 로 도착한 TTS 를 재생하려는 시점은 제스처가
// 아니므로 그대로 두면 소리가 조용히 안 난다 (.catch 가 삼킨다).
// 버튼을 누르는 순간 이걸 한 번 재생해 요소를 풀어둔다. 이후 src 를 바꿔도 재생된다.
const SILENT_WAV =
  'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=';

/** MediaRecorder 가 지원하는 첫 포맷을 고른다 — 브라우저마다 다르다 */
function pickMimeType(): string {
  const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus'];
  for (const c of candidates) {
    if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(c)) return c;
  }
  return 'audio/webm';
}

export function useVoiceTurn(farmId?: string, opts: UseVoiceTurnOptions = {}): UseVoiceTurnReturn {
  const handsFree = opts.handsFree ?? false;
  const bargeIn = opts.bargeIn ?? true;
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
  const audioUnlockedRef = useRef(false);
  const activityRef = useRef<MicActivityHandle | null>(null);
  const monitorStreamRef = useRef<MediaStream | null>(null);
  // 재생 루프는 오래 살아 있어 클로저가 굳는다. 최신 값을 ref 로 흘려준다.
  // (렌더 중 ref 를 쓰지 않고 effect 로 동기화한다 — StrictMode 안전)
  const handsFreeRef = useRef(handsFree);
  const startRef = useRef<(() => Promise<void>) | null>(null);
  const startBargeInMonitorRef = useRef<(() => Promise<void>) | null>(null);
  useEffect(() => { handsFreeRef.current = handsFree; }, [handsFree]);

  const stopMonitor = useCallback(() => {
    activityRef.current?.stop();
    activityRef.current = null;
    monitorStreamRef.current?.getTracks().forEach((t) => t.stop());
    monitorStreamRef.current = null;
  }, []);

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
    // 요소는 제스처 시점(unlockAudio)에 이미 만들어져 있다. 없으면 만들지만,
    // 그 경우 iOS 에서는 재생이 막힐 수 있다.
    let el = audioElRef.current;
    if (!el) {
      el = new Audio();
      el.setAttribute('playsinline', '');
      audioElRef.current = el;
    }
    const onEnd = (): void => {
      URL.revokeObjectURL(url);
      playingRef.current = false;
      nextSeqRef.current += 1;
      if (queueRef.current.length === 0) {
        // 마지막 청크까지 재생됐다. 핸즈프리면 사용자가 버튼을 누르지 않아도
        // 곧바로 다시 듣는다 — 이게 "대화"와 "명령어 입력"을 가르는 지점이다.
        if (handsFreeRef.current) {
          setTimeout(() => { void startRef.current?.(); }, 180);
        } else {
          setState((s) => (s === 'speaking' ? 'idle' : s));
        }
      }
      pump();
    };
    el.onended = onEnd;
    el.onerror = onEnd; // 한 청크가 깨져도 다음으로 넘어간다
    el.src = url;
    setState('speaking');
    void startBargeInMonitorRef.current?.();
    void el.play().catch(() => {
      // 자동재생 차단. unlockAudio 로 대부분 막았지만, 뚫리면 자막은 이미 나갔으므로
      // 다음 청크로 넘어간다 — 대화가 여기서 멈추면 안 된다.
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
  /**
   * 답변 재생 중 마이크를 열어 두고, 사용자가 말하기 시작하면 즉시 끊는다.
   * 자비스가 자비스인 이유의 절반은 "말 끊을 수 있다"는 것이다.
   *
   * 에코 취소를 켜서 스피커로 나가는 자기 목소리에 반응하지 않게 한다.
   * 그래도 되울림이 심한 축사가 있으므로 임계값을 조금 높게 잡는다.
   */
  const startBargeInMonitor = useCallback(async () => {
    if (!bargeIn || activityRef.current) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      monitorStreamRef.current = stream;
      activityRef.current = attachMicActivity(
        stream,
        {
          onSpeech: () => {
            stopMonitor();
            stopPlayback();
            void startRef.current?.();
          },
        },
        { speechRatio: 3.4, calibrateMs: 450 },
      );
    } catch {
      // 마이크를 못 얻어도 대화는 계속된다. 끼어들기만 안 될 뿐이다.
    }
  }, [bargeIn, stopMonitor, stopPlayback]);

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

  /**
   * iOS 오디오 언락. **반드시 사용자 제스처 안에서, await 앞에** 불러야 한다.
   * 제스처가 끝난 뒤(프로미스 콜백)에는 효력이 없다.
   */
  const unlockAudio = useCallback(() => {
    let el = audioElRef.current;
    if (!el) {
      el = new Audio();
      el.setAttribute('playsinline', '');
      audioElRef.current = el;
    }
    if (audioUnlockedRef.current) return;
    audioUnlockedRef.current = true;
    el.src = SILENT_WAV;
    void el.play().then(() => el.pause()).catch(() => {
      // 실패해도 다음 제스처에서 다시 시도할 수 있게 되돌린다
      audioUnlockedRef.current = false;
    });
  }, []);

  const start = useCallback(async () => {
    unlockAudio();
    setError(null);
    setTranscript('');
    stopMonitor();
    stopPlayback(); // 말하는 중에 시작하면 끊는다 (끼어들기)

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
        activityRef.current?.stop();
        activityRef.current = null;
        stream.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
        if (parts.length > 0) void send(new Blob(parts, { type: mimeType }));
        else setState('idle');
      };
      rec.start();
      setState('recording');

      // 말이 끝나면 알아서 끊는다. 버튼을 떼는 동작조차 없애는 것이 목표다.
      // 발화가 한 번도 감지되지 않으면 울리지 않으므로, 말을 시작하기 전에
      // 녹음이 끊기는 일은 없다.
      activityRef.current = attachMicActivity(stream, {
        onSilence: () => {
          if (rec.state !== 'inactive') rec.stop();
        },
      });
    } catch {
      setError('마이크를 사용할 수 없습니다. 권한을 확인해 주세요.');
      setState('idle');
    }
  }, [send, stopMonitor, stopPlayback, unlockAudio]);

  useEffect(() => { startRef.current = start; }, [start]);
  useEffect(() => { startBargeInMonitorRef.current = startBargeInMonitor; }, [startBargeInMonitor]);

  const stop = useCallback(() => {
    const rec = recorderRef.current;
    if (rec && rec.state !== 'inactive') rec.stop();
    recorderRef.current = null;
  }, []);

  const cancel = useCallback(() => {
    abortRef.current?.abort();
    stop();
    stopMonitor();
    stopPlayback();
    setState('idle');
  }, [stop, stopMonitor, stopPlayback]);

  useEffect(() => () => {
    abortRef.current?.abort();
    streamRef.current?.getTracks().forEach((t) => t.stop());
    stopMonitor();
    stopPlayback();
  }, [stopMonitor, stopPlayback]);

  return { state, transcript, reply, messages, error, start, stop, cancel };
}
