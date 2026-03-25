// 대화 컨텍스트 빌더
// 사용자 질문에서 관련 프로파일 데이터를 수집하여 프롬프트에 포함
// 특정 개체/농장이 아니면 → 전체 농장 글로벌 컨텍스트 제공

import type { Role } from '@cowtalk/shared';
import { eq, and, isNull, ilike, or } from 'drizzle-orm';
import { buildAnimalProfile, buildFarmProfile, buildGlobalContext } from '../pipeline/profile-builder.js';
import type { ChatContext } from '../ai-brain/prompts/conversation-prompt.js';
import { getDb } from '../config/database.js';
import { animals, farms } from '../db/schema.js';
import { logger } from '../lib/logger.js';

export interface ResolvedContext {
  readonly context: ChatContext;
  readonly detectedType: 'animal' | 'farm' | 'global' | 'general';
}

// 질문에서 맥락 유형 감지 + 관련 데이터 로드
export async function resolveContext(
  question: string,
  initialFarmId: string | null,
  currentAnimalId: string | null,
  _role: Role,
  dashboardContext?: string,
): Promise<ResolvedContext> {
  let currentFarmId = initialFarmId;

  // 1. 명시적 개체 참조 감지
  if (currentAnimalId) {
    const profile = await buildAnimalProfile(currentAnimalId);
    if (profile) {
      return { context: { type: 'animal', profile }, detectedType: 'animal' };
    }
    // animalId로 프로필 빌드 실패 시 → 개체의 farmId로 농장 컨텍스트 fallback
    logger.warn({ currentAnimalId }, 'Animal profile build failed — trying farm fallback');
    if (!currentFarmId) {
      const db = getDb();
      try {
        const animalRow = await db
          .select({ farmId: animals.farmId })
          .from(animals)
          .where(eq(animals.animalId, currentAnimalId))
          .limit(1);
        if (animalRow[0]?.farmId) {
          currentFarmId = animalRow[0].farmId;
        }
      } catch (error) {
        logger.error({ error, currentAnimalId }, 'Failed to lookup animal farmId');
      }
    }
  }

  // 2. 질문에서 귀표번호 패턴 감지 → DB 조회
  const earTagMatch = /(\d{1,6})번/.exec(question);
  if (earTagMatch?.[1]) {
    const earTag = earTagMatch[1];
    logger.debug({ earTag }, 'Detected ear tag in question — searching DB');

    const animalId = await findAnimalByEarTag(earTag, currentFarmId);
    if (animalId) {
      const profile = await buildAnimalProfile(animalId);
      if (profile) {
        return { context: { type: 'animal', profile }, detectedType: 'animal' };
      }
    }
  }

  // 2.5. 질문에서 농장명 감지 → 퍼지 매칭
  // "갈전리 목장" → "갈전리목장(미양)" 매칭 지원
  if (!currentFarmId) {
    const farmId = await findFarmByName(question);
    if (farmId) {
      const profile = await buildFarmProfile(farmId);
      if (profile) {
        logger.info({ farmId, question }, 'Fuzzy farm name match found');
        return { context: { type: 'farm', profile }, detectedType: 'farm' };
      }
    }
  }

  // 3. 특정 농장이 선택된 경우
  if (currentFarmId) {
    const profile = await buildFarmProfile(currentFarmId);
    if (profile) {
      return { context: { type: 'farm', profile }, detectedType: 'farm' };
    }
  }

  // 4. 전체 농장 글로벌 컨텍스트 (핵심 강화)
  // 특정 개체/농장이 아닌 모든 질문 → 전체 데이터 기반 응답
  try {
    const globalCtx = await buildGlobalContext();
    return {
      context: {
        type: 'global',
        globalContext: globalCtx,
        dashboardSummary: dashboardContext ?? undefined,
      },
      detectedType: 'global',
    };
  } catch (error) {
    logger.error({ error }, 'Failed to build global context — falling back');
  }

  // 5. 최종 fallback
  return {
    context: { type: 'general', dashboardSummary: dashboardContext },
    detectedType: 'general',
  };
}

// 농장명 퍼지 매칭 — 질문에서 농장 키워드 추출 후 DB 검색
// "갈전리 목장" → farms.name ILIKE '%갈전리%'
// "송영신 목장" → farms.owner_name ILIKE '%송영신%' OR farms.name ILIKE '%송영신%'
const FARM_KEYWORDS = ['목장', '농장', '축사', '농가', '팜', 'farm'] as const;

async function findFarmByName(question: string): Promise<string | null> {
  // 농장 관련 키워드가 있는지 확인
  const hasFarmKeyword = FARM_KEYWORDS.some((kw) => question.includes(kw));
  if (!hasFarmKeyword) return null;

  // 질문에서 농장명 후보 추출
  // 패턴: "X목장", "X 목장", "X농장", "X 농장"
  const namePatterns = [
    /([가-힣a-zA-Z0-9]{2,10})\s*목장/,
    /([가-힣a-zA-Z0-9]{2,10})\s*농장/,
    /([가-힣a-zA-Z0-9]{2,10})\s*축사/,
    /([가-힣a-zA-Z0-9]{2,10})\s*농가/,
    /([가-힣a-zA-Z0-9]{2,10})\s*팜/,
  ];

  let farmNameCandidate: string | null = null;
  for (const pattern of namePatterns) {
    const match = pattern.exec(question);
    if (match?.[1]) {
      farmNameCandidate = match[1];
      break;
    }
  }

  if (!farmNameCandidate) return null;

  logger.debug({ farmNameCandidate }, 'Searching farm by fuzzy name');

  const db = getDb();
  try {
    // 농장명 또는 대표자명으로 퍼지 검색
    const results = await db
      .select({ farmId: farms.farmId, name: farms.name })
      .from(farms)
      .where(
        and(
          isNull(farms.deletedAt),
          or(
            ilike(farms.name, `%${farmNameCandidate}%`),
            ilike(farms.ownerName, `%${farmNameCandidate}%`),
          ),
        ),
      )
      .limit(5);

    if (results.length === 0) return null;

    // 정확히 1개면 바로 반환
    if (results.length === 1) return results[0]!.farmId;

    // 여러 개면 가장 짧은 이름(가장 정확한 매칭) 선택
    const sorted = [...results].sort((a, b) => a.name.length - b.name.length);
    return sorted[0]!.farmId;
  } catch (error) {
    logger.error({ error, farmNameCandidate }, 'Failed to search farm by name');
    return null;
  }
}

// 귀표번호로 DB에서 동물 검색
async function findAnimalByEarTag(
  earTag: string,
  farmId: string | null,
): Promise<string | null> {
  const db = getDb();

  try {
    const conditions = [
      ilike(animals.earTag, `%${earTag}%`),
      isNull(animals.deletedAt),
    ];

    if (farmId) {
      conditions.push(eq(animals.farmId, farmId));
    }

    const results = await db
      .select({ animalId: animals.animalId })
      .from(animals)
      .where(and(...conditions))
      .limit(1);

    return results[0]?.animalId ?? null;
  } catch (error) {
    logger.error({ error, earTag }, 'Failed to search animal by ear tag');
    return null;
  }
}
