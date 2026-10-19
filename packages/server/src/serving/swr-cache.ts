// SWR(stale-while-revalidate) + single-flight 캐시
//
// 통합 대시보드처럼 "한 번에 무거운 쿼리 여러 개"를 도는 응답용.
// - fresh 구간: 캐시 즉시 반환 (DB 미접촉)
// - stale 구간: 캐시 즉시 반환 + 백그라운드 재계산 1회
// - 만료/없음: 계산을 기다림. 같은 키 동시 요청은 하나의 계산에 합류 (single-flight)
//
// single-flight가 핵심이다: 클라이언트가 15초에 끊고 재시도해도 서버 쿼리는 취소되지 않으므로,
// 합류가 없으면 느릴수록 같은 쿼리가 겹겹이 쌓여 커넥션 풀을 고갈시키고 더 느려진다.
//
// 키에는 반드시 권한 스코프(유효 farmIds)를 포함해야 한다 — 캐시가 권한 우회 경로가 되지 않게.

export interface SwrCacheOptions {
  /** 이 시간 이내의 값은 그대로 반환 */
  readonly freshMs: number;
  /** freshMs 이후 이 시간까지는 반환하면서 백그라운드 재계산 */
  readonly staleMs: number;
  /** 보관 키 상한 (초과 시 가장 오래 갱신되지 않은 키부터 제거) */
  readonly maxEntries: number;
  readonly now?: () => number;
}

export interface SwrCache<T> {
  get(key: string, loader: () => Promise<T>, onBackgroundError: (err: unknown) => void): Promise<T>;
  clear(): void;
  size(): number;
}

interface Entry<T> {
  readonly value: T;
  readonly at: number;
}

export function createSwrCache<T>(options: SwrCacheOptions): SwrCache<T> {
  const now = options.now ?? Date.now;
  const entries = new Map<string, Entry<T>>();
  const inflight = new Map<string, Promise<T>>();

  function store(key: string, value: T): void {
    entries.delete(key); // Map 삽입 순서 = 갱신 순서 → 가장 앞이 가장 오래된 키
    entries.set(key, { value, at: now() });
    while (entries.size > options.maxEntries) {
      const oldest = entries.keys().next().value;
      if (oldest === undefined) break;
      entries.delete(oldest);
    }
  }

  function refresh(key: string, loader: () => Promise<T>): Promise<T> {
    const existing = inflight.get(key);
    if (existing) return existing;

    const promise = loader().then((value) => {
      store(key, value);
      return value;
    });
    inflight.set(key, promise);
    const clear = (): void => { inflight.delete(key); };
    // then(clear, clear) — finally()는 거부를 전파한 새 promise를 만들어 unhandled rejection이 된다
    promise.then(clear, clear);
    return promise;
  }

  return {
    get(key, loader, onBackgroundError) {
      const entry = entries.get(key);
      if (entry) {
        const age = now() - entry.at;
        if (age < options.freshMs) return Promise.resolve(entry.value);
        if (age < options.staleMs) {
          refresh(key, loader).catch(onBackgroundError);
          return Promise.resolve(entry.value);
        }
      }
      return refresh(key, loader);
    },
    clear() {
      entries.clear();
    },
    size() {
      return entries.size;
    },
  };
}
