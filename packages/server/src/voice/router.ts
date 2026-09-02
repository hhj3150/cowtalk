// 의도 라우터 — 어느 모델로 보낼지 정한다.
//
// 왜 필요한가: "1877번 체온" 같은 단순 조회가 발화의 대부분이다.
// 이걸 큰 모델로 보내면 첫 토큰이 늦고 비용이 5배다.
// 조회는 빠른 모델로, 진단·처치 논의만 주력 모델로 올린다.
//
// 판정은 **규칙 기반**이다. LLM 으로 의도를 분류하면 그 자체가 왕복 한 번이라
// 라우팅으로 아낀 지연을 도로 까먹는다.

/** 진단·처치·판단이 필요한 신호 — 이게 있으면 주력 모델 */
const DEEP_PATTERNS: readonly RegExp[] = [
  /왜|어째서|원인|이유/,
  /진단|의심|감별|무슨\s*병|병명/,
  /어떻게\s*(해야|하지|할까)|어떡하|조치|처치|치료(?!\s*기록)/,
  /추천|권장|골라|선택/,
  /비교|차이|낫[나냐]|어느\s*쪽/,
  /설명|알려줘\s*자세히|자세히/,
];

/** 기록·처방 — 반드시 주력 모델. 되읽기 문장을 정확히 만들어야 한다 */
const WRITE_PATTERNS: readonly RegExp[] = [
  /기록|입력|등록|남겨|적어/,
  /처방|투약|주사|치료했/,
  /수정\s*(했|완료|기록)/,
];

/** 단순 조회 — 빠른 모델로 충분 */
const LOOKUP_PATTERNS: readonly RegExp[] = [
  /체온|온도|열\s*(있|나)/,
  /반추|활동량|음수|물\s*(마신|먹)/,
  /몇\s*(마리|두|건)|얼마|어때|상태/,
  /알림|할\s*일|오늘/,
  /발정|수정\s*적기/,
  /덥|더위|습도|환경/,
];

export type VoiceRoute = 'fast' | 'main';

export interface RouteDecision {
  readonly route: VoiceRoute;
  /** 왜 그렇게 갈랐는지 — 로그로 남겨 라우팅 품질을 사후 점검한다 */
  readonly reason: string;
}

/**
 * 발화 한 줄 → 라우팅 결정.
 *
 * 판정 순서가 중요하다: 기록 > 진단 > 조회 > 기본.
 * 애매하면 **주력 모델로 올린다** — 오판의 대가가 비대칭이기 때문이다.
 * 빠른 모델로 잘못 보내면 답이 틀리고, 주력으로 잘못 보내면 조금 느릴 뿐이다.
 */
export function routeUtterance(text: string): RouteDecision {
  const t = text.trim();
  if (t.length === 0) return { route: 'fast', reason: 'empty' };

  for (const re of WRITE_PATTERNS) {
    if (re.test(t)) return { route: 'main', reason: 'write-intent' };
  }
  for (const re of DEEP_PATTERNS) {
    if (re.test(t)) return { route: 'main', reason: 'reasoning-intent' };
  }
  // 조회 신호가 있고 문장이 짧으면 빠른 모델. 길면 맥락이 섞여 있을 가능성이 높다.
  if (t.length <= 40) {
    for (const re of LOOKUP_PATTERNS) {
      if (re.test(t)) return { route: 'fast', reason: 'simple-lookup' };
    }
  }
  return { route: 'main', reason: 'default-safe' };
}

// ── 선행 응답 (speculative acknowledgment) ────────────────────
//
// 도구를 호출하면 LLM 왕복이 한 번 더 붙어 1초 안에 답이 나올 수 없다.
// 그래서 조회를 시작하는 즉시 정형 문구를 먼저 내보낸다.
// 정형 문구는 TTS 캐시에 이미 있어 합성 지연이 사실상 0이다.
//
// 문구를 여러 개 두지 않는다 — 캐시 적중률이 떨어지고, 매번 다른 말이 들리면
// 오히려 산만하다. 개체번호가 있으면 그것만 붙인다.

const ACK_GENERIC = '확인하겠습니다.';

/** 발화에서 3~5자리 숫자(개체번호로 보이는 것)를 뽑는다 */
export function extractAnimalNumber(text: string): string | null {
  const m = text.match(/(?<!\d)(\d{3,5})\s*번?/);
  return m ? (m[1] ?? null) : null;
}

/**
 * 선행 응답 문구. 캐시 적중을 위해 **형태를 고정**한다.
 * 번호가 있으면 "1877번 확인하겠습니다.", 없으면 "확인하겠습니다."
 */
export function buildAck(text: string): string {
  const n = extractAnimalNumber(text);
  return n ? `${n}번 확인하겠습니다.` : ACK_GENERIC;
}

/**
 * 선행 응답을 낼 가치가 있는가.
 * 조회·기록 의도가 보이면 도구 호출이 뒤따를 가능성이 높다.
 * 인사·잡담에는 붙이지 않는다 — 어색하다.
 */
export function shouldAck(text: string): boolean {
  const t = text.trim();
  if (t.length < 3) return false;
  if (/^(안녕|고마워|고맙|잘\s*했|그래|응|네|아니)/.test(t)) return false;
  return (
    extractAnimalNumber(t) !== null ||
    LOOKUP_PATTERNS.some((re) => re.test(t)) ||
    DEEP_PATTERNS.some((re) => re.test(t)) ||
    WRITE_PATTERNS.some((re) => re.test(t))
  );
}
