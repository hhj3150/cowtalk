// 대화 컨텍스트 빌더
// 사용자 질문에서 관련 프로파일 데이터를 수집하여 프롬프트에 포함
// 특정 개체/농장이 아니면 → 전체 농장 글로벌 컨텍스트 제공

import type { Role } from '@cowtalk/shared';
import { eq, and, isNull, ilike } from 'drizzle-orm';
import { buildAnimalProfile, buildFarmProfile, buildGlobalContext } from '../pipeline/profile-builder.js';
import type { ChatContext } from '../ai-brain/prompts/conversation-prompt.js';
import { getDb } from '../config/database.js';
import { animals } from '../db/schema.js';
import { logger } from '../lib/logger.js';

export interface ResolvedContext {
  readonly context: ChatContext;
  readonly detectedType: 'animal' | 'farm' | 'global' | 'general';
}

// 질문에서 맥락 유형 감지 + 관련 데이터 로드
export async function resolveContext(
  question: string,
  currentFarmId: string | null,
  currentAnimalId: string | null,
  _role: Role,
  dashboardContext?: string,
): Promise<ResolvedContext> {
  // 1. 명시적 개체 참조 감지
  if (currentAnimalId) {
    const profile = await buildAnimalProfile(currentAnimalId);
    if (profile) {
      return { context: { type: 'animal', profile }, detectedType: 'animal' };
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
