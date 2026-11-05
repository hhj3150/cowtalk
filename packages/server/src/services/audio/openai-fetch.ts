// OpenAI 오디오 API 호출 공통 — 시간 상한 + 일시 오류 1회 재시도
//
// 예전에는 TTS·STT 호출에 시간 상한이 없어 OpenAI 쪽이 멈추면 서버 요청도 무한정 열려 있었다.
// 429·5xx·네트워크 오류·시간 초과만 재시도한다. 400/401/403/413 은 다시 해도 같으므로 즉시 반환.

export interface OpenAiFetchOptions {
  readonly timeoutMs: number;
  /** 추가 시도 횟수 (기본 1 = 최대 2회 호출) */
  readonly retries?: number;
  readonly retryDelayMs?: number;
}

export function isRetriableStatus(status: number): boolean {
  return status === 429 || status >= 500;
}

/** 일시적 실패(재시도할 가치가 있는 실패)인가 — 모델 대체 판단에도 쓴다 */
export function isTransientFailure(err: unknown): boolean {
  const e = (err ?? {}) as { name?: string; message?: string; status?: number };
  if (typeof e.status === 'number') return isRetriableStatus(e.status);
  return e.name === 'TimeoutError' || e.name === 'AbortError' || /fetch failed|timeout|econnreset|socket/i.test(e.message ?? '');
}

/** makeInit 은 시도마다 새 요청 본문을 만든다 (FormData·스트림 재사용 문제 회피) */
export async function fetchOpenAi(
  url: string,
  makeInit: () => RequestInit,
  opts: OpenAiFetchOptions,
  fetchImpl: typeof fetch = fetch,
): Promise<Response> {
  const attempts = 1 + (opts.retries ?? 1);
  let lastErr: unknown = null;
  for (let i = 0; i < attempts; i++) {
    if (i > 0) await new Promise<void>((r) => { setTimeout(r, opts.retryDelayMs ?? 600); });
    try {
      const res = await fetchImpl(url, { ...makeInit(), signal: AbortSignal.timeout(opts.timeoutMs) });
      if (res.ok || !isRetriableStatus(res.status) || i === attempts - 1) return res;
      lastErr = Object.assign(new Error(`HTTP ${String(res.status)}`), { status: res.status });
      await res.body?.cancel().catch(() => undefined);
    } catch (err) {
      lastErr = err;
      if (i === attempts - 1) throw err;
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error('OpenAI 호출 실패');
}
