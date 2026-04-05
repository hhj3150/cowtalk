// 대시보드 AI 인사이트 생성 서비스
// Claude API로 역할별 맞춤 인사이트 생성 + 5분 캐싱 + v4 fallback

import { callClaudeForAnalysis, isClaudeAvailable } from '../ai-brain/claude-client.js';
import { logger } from '../lib/logger.js';
import type { Role } from '@cowtalk/shared';

// ===========================
// 타입 정의
// ===========================

interface KpiContext {
  readonly label: string;
  readonly value: string | number;
  readonly unit: string;
  readonly severity: string | null;
}

interface ActionContext {
  readonly action: string;
  readonly target: string;
  readonly urgency: string;
}

export interface DashboardInsightContext {
  readonly role: Role;
  readonly kpis: readonly KpiContext[];
  readonly todayActions: readonly ActionContext[];
  readonly roleData: Record<string, unknown>;
}

export interface AiInsight {
  readonly title: string;
  readonly description: string;
  readonly source: 'claude' | 'v4_fallback' | 'cache';
  readonly risks: readonly string[];
  readonly recommendations: readonly string[];
  readonly dataReferences: readonly string[];
  readonly generatedAt: string;
}

// ===========================
// 메모리 캐시 (5분 TTL)
// ===========================

interface CacheEntry {
  readonly insight: AiInsight;
  readonly expiresAt: number;
}

const insightCache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 5 * 60 * 1000;

// ===========================
// 메인 함수
// ===========================

export async function generateDashboardInsight(
  context: DashboardInsightContext,
  farmIds?: readonly string[],
): Promise<AiInsight> {
  const cacheKey = `${context.role}-${JSON.stringify(farmIds ?? [])}`;
  const cached = insightCache.get(cacheKey);

  if (cached && cached.expiresAt > Date.now()) {
    return { ...cached.insight, source: 'cache' };
  }

  if (!isClaudeAvailable()) {
    logger.warn({ role: context.role }, 'Claude not available for dashboard insight, using fallback');
    return generateFallbackInsight(context);
  }

  try {
    const prompt = buildInsightPrompt(context);
    const result = await callClaudeForAnalysis(prompt);

    if (!result) {
      logger.warn({ role: context.role }, 'Claude returned null for dashboard insight');
      return generateFallbackInsight(context);
    }

    const parsed = toAiInsight(result.parsed, context.role);
    insightCache.set(cacheKey, { insight: parsed, expiresAt: Date.now() + CACHE_TTL_MS });

    logger.info({
      role: context.role,
      model: result.model,
      durationMs: result.durationMs,
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
    }, 'Dashboard AI insight generated');

    return parsed;
  } catch (error) {
    logger.error({ error, role: context.role }, 'Dashboard insight generation failed');
    return generateFallbackInsight(context);
  }
}

// ===========================
// 프롬프트 빌더
// ===========================

const ROLE_DESCRIPTIONS: Readonly<Record<string, string>> = {
  farmer: '개별 농장을 운영하는 농장주. 쉬운 한국어로, 오늘 당장 해야 할 일 중심.',
  veterinarian: '141개 농장을 관리하는 수의사. 임상 전문 용어 사용 가능. 긴급 동물과 질병 패턴 중심.',
  government_admin: '경기도 축산 행정관. 지역 전체 통계와 정책 시사점 중심.',
  quarantine_officer: '방역 담당관. 전염병 위험, 조기 경보, 역학 감시 중심.',
};

function buildInsightPrompt(context: DashboardInsightContext): string {
  const kpiSummary = context.kpis
    .map((k) => `${k.label}: ${k.value}${k.unit}${k.severity ? ` (${k.severity})` : ''}`)
    .join(', ');

  const actionSummary = context.todayActions
    .slice(0, 5)
    .map((a) => `- ${a.action} (${a.target}, ${a.urgency})`)
    .join('\n');

  const roleDesc = ROLE_DESCRIPTIONS[context.role] ?? '축산 관계자';

  return `당신은 CowTalk 축산 AI 분석가입니다. 다음 대시보드 데이터를 분석하고, 역할에 맞는 인사이트를 제공하세요.

역할: ${context.role} — ${roleDesc}

현재 KPI:
${kpiSummary}

오늘 주요 액션:
${actionSummary || '(없음)'}

다음 형식으로 정확히 응답하세요 (JSON):
{
  "title": "한 줄 제목",
  "description": "2-3문장 핵심 분석. 역할에 맞는 톤으로.",
  "risks": ["위험요소1", "위험요소2"],
  "recommendations": ["권고사항1", "권고사항2"],
  "dataReferences": ["근거 데이터1", "근거 데이터2"]
}

규칙:
- 역할에 맞는 전문성 수준으로 작성
- 구체적 수치를 포함하여 근거 기반 분석
- 위험요소와 권고사항은 실행 가능한 것만
- JSON만 반환, 다른 텍스트 없이`;
}

// ===========================
// 응답 파서
// ===========================

function toAiInsight(parsed: Record<string, unknown>, _role: Role): AiInsight {
  return {
    title: typeof parsed.title === 'string' ? parsed.title : '분석 완료',
    description: typeof parsed.description === 'string' ? parsed.description : '',
    source: 'claude',
    risks: Array.isArray(parsed.risks) ? parsed.risks.map(String) : [],
    recommendations: Array.isArray(parsed.recommendations) ? parsed.recommendations.map(String) : [],
    dataReferences: Array.isArray(parsed.dataReferences) ? parsed.dataReferences.map(String) : [],
    generatedAt: new Date().toISOString(),
  };
}

// ===========================
// Fallback (Claude 불가 시)
// ===========================

function generateFallbackInsight(context: DashboardInsightContext): AiInsight {
  const kpiSummary = context.kpis
    .map((k) => `${k.label} ${k.value}${k.unit}`)
    .join(', ');

  return {
    title: '시스템 분석',
    description: kpiSummary
      ? `현재 데이터 요약: ${kpiSummary}. AI 분석이 일시적으로 사용 불가하여 기본 집계를 표시합니다.`
      : 'AI 분석을 일시적으로 사용할 수 없습니다. 기본 데이터 집계를 표시합니다.',
    source: 'v4_fallback',
    risks: [],
    recommendations: [],
    dataReferences: [],
    generatedAt: new Date().toISOString(),
  };
}
