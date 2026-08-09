// AI 일일 브리핑 생성 서비스 — 자비스 스타일
// 규칙 기반 집계 데이터를 Claude가 역할 맞춤·발화 가능한 브리핑으로 작성.
// Claude 불가 시 호출부의 템플릿 요약이 그대로 사용된다 (규칙 7: Fallback 보장).

import { callClaudeForChatJson, isClaudeAvailable } from '../ai-brain/claude-client.js';
import { logger } from '../lib/logger.js';

export interface BriefingFacts {
  readonly role: string;
  readonly farmId: string | null;
  readonly farmCount: number;
  readonly animalCount: number;
  readonly total24h: number;
  readonly changePercent: number;
  readonly direction: 'up' | 'down' | 'stable';
  readonly topFarms: ReadonlyArray<{ farmName: string; alertCount: number; topEventType: string | null }>;
  readonly eventDistribution: ReadonlyArray<{ eventType: string; count: number }>;
  readonly criticalCount: number;
}

export interface GenerativeBriefing {
  readonly summary: string;
  readonly recommendations: readonly string[];
}

// 캐시 — 대시보드 로드마다 Claude를 부르지 않도록 10분 TTL.
// 데이터가 크게 변하면(알림 수 변화) 키가 달라져 자동 재생성된다.
const CACHE_TTL_MS = 10 * 60 * 1000;
const cache = new Map<string, { value: GenerativeBriefing; expiresAt: number }>();

// 대시보드 응답을 막지 않도록 Claude 호출 상한
const GENERATION_TIMEOUT_MS = 8000;

function cacheKey(facts: BriefingFacts): string {
  return [facts.role, facts.farmId ?? 'all', facts.total24h, facts.criticalCount, facts.direction].join(':');
}

const ROLE_FOCUS: Readonly<Record<string, string>> = {
  farmer: '오늘 해야 할 번식·건강 행동(수정 대상, 분만 준비, 주의 개체)을 우선.',
  veterinarian: '진료 우선순위(고체온·임상이상·반추저하)와 집중 방문 농장을 우선.',
  quarantine_officer: '전염병 확산 신호(다농장 동시 발열, 클러스터)와 역학 조치를 우선.',
  government_admin: '지역 전체 추세, 집중 관리 농장, 행정 조치 필요 사항을 우선.',
};

function buildPrompt(facts: BriefingFacts): string {
  const top = facts.topFarms.slice(0, 3)
    .map((f) => `${f.farmName}(알림 ${String(f.alertCount)}건${f.topEventType ? `, 주요: ${f.topEventType}` : ''})`)
    .join(', ') || '없음';
  const dist = facts.eventDistribution.slice(0, 6)
    .map((e) => `${e.eventType} ${String(e.count)}건`)
    .join(', ') || '없음';
  return [
    '## 오늘의 집계 데이터 (이 수치만 사용 — 새 수치 창작 금지)',
    `- 범위: 농장 ${String(facts.farmCount)}개 · ${String(facts.animalCount)}두`,
    `- 최근 24시간 알림 ${String(facts.total24h)}건 (전일 대비 ${facts.direction === 'stable' ? '유사' : `${String(Math.abs(facts.changePercent))}% ${facts.direction === 'up' ? '증가' : '감소'}`})`,
    `- 긴급(critical) ${String(facts.criticalCount)}건`,
    `- 상위 알림 농장: ${top}`,
    `- 이벤트 분포: ${dist}`,
    '',
    `## 역할: ${facts.role}`,
    ROLE_FOCUS[facts.role] ?? ROLE_FOCUS['government_admin']!,
    '',
    '## 작성 지시',
    '- 아이언맨의 자비스처럼: 간결하고 자신감 있게, 상황 → 의미 → 다음 행동 순서.',
    '- summary: 2~3문장, 소리 내어 읽기 좋은 한국어(TTS 낭독용). 이모지·마크다운 금지.',
    '- recommendations: 오늘 실행할 행동 2~3개, 각 한 문장.',
    '- 반드시 JSON만 출력: {"summary": "...", "recommendations": ["...", "..."]}',
  ].join('\n');
}

const SYSTEM = 'CowTalk 축산 플랫폼의 AI 비서 "팅커벨"이 매일 아침 브리핑을 작성합니다. 제공된 집계 수치만 사용하고, 없는 수치를 만들지 마세요. JSON 외 다른 텍스트를 출력하지 마세요.';

/** 같은 키로 동시에 여러 생성이 돌지 않도록 진행 중 작업을 추적 */
const inFlight = new Set<string>();

/**
 * 캐시된 브리핑만 즉시 반환하고, 없으면 백그라운드 생성을 시작한 뒤 null을 돌려준다.
 *
 * 왜 논블로킹인가: 예전에는 대시보드 요청이 Claude 생성을 최대 8초 기다렸다.
 * 여기에 콜드 스타트가 겹치면 프론트 기본 타임아웃(15초)을 넘겨 위젯이 아무것도
 * 그리지 못했다. 이제 첫 요청은 템플릿 요약으로 즉시 응답하고, 생성이 끝나면
 * 다음 폴링(5분 주기 또는 새로고침)에서 Claude 요약으로 바뀐다.
 * 응답의 summarySource 필드가 지금 어느 쪽인지 정직하게 알려준다.
 */
export function getCachedBriefingNarrative(facts: BriefingFacts): GenerativeBriefing | null {
  if (!isClaudeAvailable()) return null;

  const key = cacheKey(facts);
  const cached = cache.get(key);
  if (cached && Date.now() < cached.expiresAt) return cached.value;

  if (!inFlight.has(key)) {
    inFlight.add(key);
    void generateBriefingNarrative(facts)
      .catch((err: unknown) => {
        logger.warn({ err }, '[Briefing] 백그라운드 브리핑 생성 실패 — 템플릿 유지');
      })
      .finally(() => inFlight.delete(key));
  }
  return null;
}

/**
 * Claude가 작성한 브리핑 요약·권장행동. 실패·타임아웃 시 null (호출부 템플릿 유지).
 * 응답 경로를 막지 않으려면 getCachedBriefingNarrative를 쓰고, 이 함수는 배치·워밍업용으로 둔다.
 */
export async function generateBriefingNarrative(
  facts: BriefingFacts,
): Promise<GenerativeBriefing | null> {
  if (!isClaudeAvailable()) return null;

  const key = cacheKey(facts);
  const cached = cache.get(key);
  if (cached && Date.now() < cached.expiresAt) return cached.value;

  try {
    const result = await Promise.race([
      callClaudeForChatJson(SYSTEM, buildPrompt(facts)),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), GENERATION_TIMEOUT_MS)),
    ]);
    if (!result) return null;

    const summary = typeof result.parsed.summary === 'string' ? result.parsed.summary.trim() : '';
    const recommendations = Array.isArray(result.parsed.recommendations)
      ? result.parsed.recommendations.filter((r): r is string => typeof r === 'string').slice(0, 3)
      : [];
    if (!summary) return null;

    const value: GenerativeBriefing = { summary, recommendations };
    cache.set(key, { value, expiresAt: Date.now() + CACHE_TTL_MS });
    logger.info({ role: facts.role, durationMs: result.durationMs }, '[Briefing] Claude 생성 브리핑 사용');
    return value;
  } catch (err) {
    logger.warn({ err }, '[Briefing] Claude 브리핑 생성 실패 — 템플릿 유지');
    return null;
  }
}

/** 테스트용 — 캐시 초기화 */
export function clearBriefingCache(): void {
  cache.clear();
  inFlight.clear();
}
