// Railway cold start 대응 — 서버 health check 후 앱 로드
// 서버가 잠들어있으면 최대 30초까지 재시도, 깨어나면 즉시 진행

import { useState, useEffect, useRef } from 'react';

interface WarmupState {
  readonly status: 'checking' | 'ready' | 'failed';
  readonly elapsed: number;
}

const MAX_WAIT_MS = 30_000;
const RETRY_INTERVAL_MS = 2_000;

export function useServerWarmup(): WarmupState {
  const [state, setState] = useState<WarmupState>({ status: 'checking', elapsed: 0 });
  const startTime = useRef(Date.now());

  useEffect(() => {
    let cancelled = false;
    let timerId: ReturnType<typeof setTimeout> | null = null;

    async function ping(): Promise<void> {
      if (cancelled) return;

      try {
        const res = await fetch('/api/health', {
          signal: AbortSignal.timeout(5000),
        });
        if (!cancelled && res.ok) {
          setState({ status: 'ready', elapsed: Date.now() - startTime.current });
          return;
        }
      } catch {
        // 서버 아직 안 깨어남
      }

      const elapsed = Date.now() - startTime.current;
      if (cancelled) return;

      if (elapsed >= MAX_WAIT_MS) {
        setState({ status: 'failed', elapsed });
        return;
      }

      setState({ status: 'checking', elapsed });
      timerId = setTimeout(ping, RETRY_INTERVAL_MS);
    }

    ping();

    return () => {
      cancelled = true;
      if (timerId) clearTimeout(timerId);
    };
  }, []);

  return state;
}
