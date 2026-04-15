// 대화 컨텍스트 빌더
// 사용자 질문에서 관련 프로파일 데이터를 수집하여 프롬프트에 포함
// 특정 개체/농장이 아니면 → 전체 농장 글로벌 컨텍스트 제공
// quarantine_officer + 방역 키워드 → 방역 전용 컨텍스트

import type { Role, BreedingPipelineData } from '@cowtalk/shared';
import { eq, and, isNull, ilike, or } from 'drizzle-orm';
import { buildAnimalProfile, buildFarmProfile, buildGlobalContext } from '../pipeline/profile-builder.js';
import type { ChatContext } from '../ai-brain/prompts/conversation-prompt.js';
import { getDb } from '../config/database.js';
import { animals, farms } from '../db/schema.js';
import { logger } from '../lib/logger.js';
import { getQuarantineDashboard, getActionQueue } from '../services/epidemiology/quarantine-dashboard.service.js';
import { getNationalSituation, getProvinceDetail } from '../services/epidemiology/national-situation.service.js';
import { getBreedingPipeline } from '../services/breeding/breeding-pipeline.service.js';

export type DetectedType = 'animal' | 'farm' | 'global' | 'quarantine' | 'general';

export interface ResolvedContext {
  readonly context: ChatContext;
  readonly detectedType: DetectedType;
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

  // 3.5. 방역관 + 방역 키워드 → 방역 전용 컨텍스트
  if (isQuarantineQuery(_role, question)) {
    try {
      const quarantineCtx = await buildQuarantineContext(question);
      return { context: quarantineCtx, detectedType: 'quarantine' };
    } catch (error) {
      logger.error({ error }, 'Failed to build quarantine context — falling through to global');
    }
  }

  // 4. 전체 농장 글로벌 컨텍스트 (핵심 강화)
  // 특정 개체/농장이 아닌 모든 질문 → 전체 데이터 기반 응답
  try {
    // 번식 관련 질문이면 번식 파이프라인 데이터도 함께 로드
    const isBreeding = isBreedingQuery(question);
    const [globalCtx, breedingData] = await Promise.all([
      buildGlobalContext(),
      isBreeding ? loadBreedingPipeline() : Promise.resolve(undefined),
    ]);
    return {
      context: {
        type: 'global',
        globalContext: globalCtx,
        dashboardSummary: dashboardContext ?? undefined,
        breedingPipeline: breedingData,
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

// 귀표번호로 DB에서 동물 검색 — 정확 일치 우선, 없을 때만 contains 매칭
async function findAnimalByEarTag(
  earTag: string,
  farmId: string | null,
): Promise<string | null> {
  const db = getDb();

  try {
    const baseConditions = [isNull(animals.deletedAt)];
    if (farmId) {
      baseConditions.push(eq(animals.farmId, farmId));
    }

    // 1) 정확 일치 (팅커벨이 "423번" → "42423"로 오인하는 문제 방지)
    const exactMatch = await db
      .select({ animalId: animals.animalId })
      .from(animals)
      .where(and(eq(animals.earTag, earTag), ...baseConditions))
      .limit(1);

    if (exactMatch[0]) return exactMatch[0].animalId;

    // 2) contains 매칭 fallback (사용자가 부분번호로 질의한 경우)
    const fuzzy = await db
      .select({ animalId: animals.animalId })
      .from(animals)
      .where(and(ilike(animals.earTag, `%${earTag}%`), ...baseConditions))
      .limit(1);

    return fuzzy[0]?.animalId ?? null;
  } catch (error) {
    logger.error({ error, earTag }, 'Failed to search animal by ear tag');
    return null;
  }
}

// ===========================
// 방역 컨텍스트 감지 + 구축
// ===========================

const QUARANTINE_KEYWORDS = [
  '방역', '발열', '클러스터', '전국', '역학', '격리', '전염병', '법정전염병',
  '확산', '감염', '의심', '위험 농장', '발생', '소독', '이동제한',
  '구제역', '브루셀라', '결핵', '유행열', '럼피스킨', '탄저',
  'KAHIS', 'kahis', '가축방역', '긴급방역', '살처분', '매몰',
  '시도별', '지역별', '전국 현황', '위험 등급', 'DSI',
  'quarantine', 'epidemic', 'outbreak', 'fever',
] as const;

const PROVINCE_MAP: Readonly<Record<string, string>> = {
  경기: '경기도', 경기도: '경기도',
  강원: '강원도', 강원도: '강원도',
  충북: '충청북도', 충청북도: '충청북도', 충북도: '충청북도',
  충남: '충청남도', 충청남도: '충청남도', 충남도: '충청남도',
  전북: '전라북도', 전라북도: '전라북도', 전북도: '전라북도',
  전남: '전라남도', 전라남도: '전라남도', 전남도: '전라남도',
  경북: '경상북도', 경상북도: '경상북도', 경북도: '경상북도',
  경남: '경상남도', 경상남도: '경상남도', 경남도: '경상남도',
  제주: '제주특별자치도', 제주도: '제주특별자치도',
  서울: '서울특별시', 부산: '부산광역시', 대구: '대구광역시',
  인천: '인천광역시', 광주: '광주광역시', 대전: '대전광역시', 울산: '울산광역시',
  세종: '세종특별자치시',
  // 시군구 → 시도 매핑 (주요 축산 지역)
  포천: '경기도', 연천: '경기도', 안성: '경기도', 이천: '경기도', 여주: '경기도',
  횡성: '강원도', 홍천: '강원도', 평창: '강원도',
  음성: '충청북도', 충주: '충청북도', 제천: '충청북도',
  홍성: '충청남도', 예산: '충청남도', 서산: '충청남도',
  김제: '전라북도', 정읍: '전라북도',
  장흥: '전라남도', 해남: '전라남도',
  의성: '경상북도', 안동: '경상북도', 영주: '경상북도',
  합천: '경상남도', 함양: '경상남도',
};

function isQuarantineQuery(role: Role, question: string): boolean {
  // 방역관은 방역 키워드 1개만 있어도 활성화
  if (role === 'quarantine_officer') {
    return QUARANTINE_KEYWORDS.some((kw) => question.includes(kw));
  }
  // 다른 역할은 명시적 방역 키워드 2개 이상
  let matchCount = 0;
  for (const kw of QUARANTINE_KEYWORDS) {
    if (question.includes(kw)) {
      matchCount++;
      if (matchCount >= 2) return true;
    }
  }
  return false;
}

function detectProvince(question: string): string | null {
  for (const [keyword, province] of Object.entries(PROVINCE_MAP)) {
    if (question.includes(keyword)) return province;
  }
  return null;
}

// ===========================
// 번식 키워드 감지 + 파이프라인 로드
// ===========================

const BREEDING_KEYWORDS = [
  '번식', '발정', '수정', '임신', '분만', '건유', '공태',
  '수태율', '임신율', '발정탐지', '수정 적기', '정액', '종모우',
  '수정사', '교배', '재발정', '임신감정', '수정 대상',
  'breeding', 'insemination', 'heat', 'estrus', 'pregnant', 'calving',
  '할 일', '오늘', '긴급', '급한', 'today', 'urgent', 'todo',
] as const;

function isBreedingQuery(question: string): boolean {
  return BREEDING_KEYWORDS.some((kw) => question.includes(kw));
}

async function loadBreedingPipeline(): Promise<BreedingPipelineData | undefined> {
  try {
    return await getBreedingPipeline();
  } catch (error) {
    logger.warn({ error }, 'Failed to load breeding pipeline for chat context');
    return undefined;
  }
}

async function buildQuarantineContext(question: string): Promise<ChatContext> {
  // 병렬로 방역 대시보드 + 전국 현황 + 액션 큐 조회
  const [dashboard, nationalSituation, actionQueue] = await Promise.all([
    getQuarantineDashboard(),
    getNationalSituation(),
    getActionQueue(),
  ]);

  // 특정 지역 언급 시 시도 상세 조회
  const targetProvince = detectProvince(question);
  let provinceDetail: readonly unknown[] | undefined;
  if (targetProvince) {
    try {
      provinceDetail = await getProvinceDetail(targetProvince);
    } catch {
      // 시도 상세 실패는 비치명적
    }
  }

  return {
    type: 'quarantine',
    quarantineData: {
      kpi: dashboard.kpi,
      top5RiskFarms: dashboard.top5RiskFarms,
      hourlyFever24h: dashboard.hourlyFever24h,
      activeAlerts: dashboard.activeAlerts,
      nationalSummary: nationalSituation.nationalSummary,
      provinces: nationalSituation.provinces,
      weeklyFeverTrend: nationalSituation.weeklyFeverTrend,
      actionQueue: actionQueue.slice(0, 10),
      targetProvince: targetProvince ?? undefined,
      provinceDetail: provinceDetail ?? undefined,
    },
  };
}
