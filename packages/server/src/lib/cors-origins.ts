// SEC-19: 허용 출처를 정확히 고정 — 예전 정규식은 시작이 고정되지 않아 evilcowtalk.kr 과
// 다른 사람의 모든 Netlify 사이트(*.netlify.app)를 허용했다.
// API·Socket.IO 가 같은 목록을 쓴다.

const PRODUCTION_ORIGIN_PATTERNS: readonly RegExp[] = [
  /^https:\/\/cowtalk\.netlify\.app$/,
  // Netlify 배포 미리보기·브랜치 배포 (deploy-preview-32--cowtalk.netlify.app)
  /^https:\/\/[a-z0-9-]+--cowtalk\.netlify\.app$/,
  /^https:\/\/(?:[a-z0-9-]+\.)*cowtalk\.kr$/,
];

const DEV_ORIGINS: readonly string[] = ['http://localhost:5173', 'http://localhost:3000'];

/** 운영 허용 출처 + 환경변수 CORS_EXTRA_ORIGINS(쉼표 구분, 정확히 일치) */
export function allowedOrigins(nodeEnv: string, extra: string | undefined): Array<string | RegExp> {
  const extras = (extra ?? '').split(',').map((s) => s.trim()).filter((s) => /^https?:\/\/[^/\s]+$/.test(s));
  return nodeEnv === 'production' ? [...PRODUCTION_ORIGIN_PATTERNS, ...extras] : [...DEV_ORIGINS, ...extras];
}

export function isAllowedOrigin(origin: string, allowed: ReadonlyArray<string | RegExp>): boolean {
  return allowed.some((a) => (typeof a === 'string' ? a === origin : a.test(origin)));
}
