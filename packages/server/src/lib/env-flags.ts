// 환경변수 불리언 해석 — 의존성 없는 순수 함수 (config 에서도 순환 없이 쓸 수 있게)

const FALSE_WORDS = new Set(['false', '0', 'no', 'off']);

/** REDIS_ENABLED — 명시적으로 끈 경우(false/0/no/off)만 false. (z.coerce.boolean 은 "false" 도 true 로 바꿔 끌 수 없었다) */
export function parseRedisEnabled(raw: string | undefined): boolean {
  if (raw === undefined) return true;
  const v = raw.trim().toLowerCase();
  if (v === '') return true;
  return !FALSE_WORDS.has(v);
}
