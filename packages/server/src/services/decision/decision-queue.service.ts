// Daily Decision Queue — "오늘 무엇을 해야 하는가" 합성 계층
//
// 새 판단 엔진이 아니다. 기존 판단 3원(소버린 알람 predictions / smaXtec 이벤트 /
// 번식 긴급조치)을 하나의 우선순위 큐로 합성한다.
// - 점수화·중복병합(buildDecisionCards)은 순수 함수 — 단위 테스트 대상
// - 데이터 로딩(getDecisionQueue)은 기존 테이블/서비스 재사용 (비파괴)

import { getDb } from '../../config/database.js';
import { predictions, smaxtecEvents, animals, farms } from '../../db/schema.js';
import { and, eq, gte, inArray, isNotNull, sql } from 'drizzle-orm';
import { getBreedingPipeline } from '../breeding/breeding-pipeline.service.js';
import { estimateDailyLoss, LOSS_FRACTION_BY_EVENT } from './economic-impact.service.js';
import { getEconomicParamValuesByFarm } from '../economics/economic-params.service.js';
import { classifyUrgency } from '@cowtalk/shared';
import { getAvgDailyYield } from '../milk/milk-record.service.js';
import { logger } from '../../lib/logger.js';
import type {
  DecisionCard,
  DecisionQueueData,
  DecisionSeverity,
  DecisionSource,
} from '@cowtalk/shared';

const MS_PER_HOUR = 3_600_000;

// ===========================
// 후보 (합성 입력)
// ===========================

export interface DecisionCandidate {
  readonly source: DecisionSource;
  readonly severity: DecisionSeverity;
  /** 0–1 신뢰도 (없으면 0.5) */
  readonly confidence: number;
  readonly title: string;
  readonly why: readonly string[];
  readonly animalId?: string;
  readonly earTag?: string;
  readonly farmId?: string;
  readonly farmName?: string;
  readonly detectedAt: string;
  readonly dueInHours?: number;
  /** 유량 손실률 (경제 환산용) — smaXtec 건강 이벤트 유형 기반 */
  readonly lossFraction?: number;
}

const SEVERITY_WEIGHT: Record<DecisionSeverity, number> = {
  critical: 100,
  high: 70,
  medium: 40,
  low: 10,
};

const SEVERITY_ORDER: readonly DecisionSeverity[] = ['critical', 'high', 'medium', 'low'];

function maxSeverity(a: DecisionSeverity, b: DecisionSeverity): DecisionSeverity {
  return SEVERITY_ORDER.indexOf(a) <= SEVERITY_ORDER.indexOf(b) ? a : b;
}

/** 후보 1건 점수: 심각도 + 신뢰도(0~30) + 골든타임 임박(0~25) + 최신성(0~10) */
export function scoreCandidate(c: DecisionCandidate, now: number): number {
  let score = SEVERITY_WEIGHT[c.severity] + c.confidence * 30;
  if (c.dueInHours != null && c.dueInHours >= 0) {
    score += Math.max(0, 25 - c.dueInHours); // 24h 내 임박할수록 가산
  }
  const ageHours = (now - new Date(c.detectedAt).getTime()) / MS_PER_HOUR;
  if (ageHours >= 0 && ageHours <= 6) score += 10 - ageHours;
  return Math.round(score * 10) / 10;
}

/**
 * 합성 코어 (순수 함수): 점수화 → 동일 개체 병합(최고 점수 유지, 근거 결합) → 정렬 → 상위 N
 */
export function buildDecisionCards(
  candidates: readonly DecisionCandidate[],
  opts: { readonly limit?: number; readonly now?: number } = {},
): { cards: DecisionCard[]; totalCandidates: number; winners: DecisionCandidate[] } {
  const limit = opts.limit ?? 5;
  const now = opts.now ?? Date.now();

  interface Scored {
    candidate: DecisionCandidate;
    score: number;
    why: string[];
    severity: DecisionSeverity;
    sources: Set<DecisionSource>;
  }

  // 동일 개체(animalId) 기준 병합 — 개체가 없으면 농장+제목 기준
  const byKey = new Map<string, Scored>();
  for (const c of candidates) {
    const key = c.animalId ?? `${c.farmId ?? 'global'}:${c.title}`;
    const score = scoreCandidate(c, now);
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, {
        candidate: c,
        score,
        why: [...c.why],
        severity: c.severity,
        sources: new Set([c.source]),
      });
      continue;
    }
    // 병합: 근거는 결합(중복 제거, 최대 4), 점수·심각도는 최댓값 + 다중 출처 가산
    existing.severity = maxSeverity(existing.severity, c.severity);
    for (const w of c.why) {
      if (!existing.why.includes(w)) existing.why.push(w);
    }
    existing.sources.add(c.source);
    if (score > existing.score) {
      existing.candidate = c;
      existing.score = score;
    }
  }

  const merged = [...byKey.values()].map((s) => ({
    ...s,
    // 서로 다른 판단원이 같은 개체를 지목하면 확신 가산 (+12/출처)
    finalScore: Math.round((s.score + (s.sources.size - 1) * 12) * 10) / 10,
  }));

  merged.sort((a, b) => b.finalScore - a.finalScore);

  const top = merged.slice(0, limit);
  const winners: DecisionCandidate[] = top.map((s) => s.candidate);
  const cards: DecisionCard[] = top.map((s, i) => {
    const c = s.candidate;
    return {
      id: `${c.source}:${c.animalId ?? c.farmId ?? 'g'}:${c.detectedAt}`,
      rank: i + 1,
      severity: s.severity,
      score: s.finalScore,
      title: c.title,
      subject: {
        animalId: c.animalId,
        earTag: c.earTag,
        farmId: c.farmId,
        farmName: c.farmName,
      },
      why: s.why.slice(0, 4),
      actionLabel: c.animalId ? '개체 확인' : '농장 확인',
      actionKind: c.animalId ? 'animal' : 'farm',
      source: c.source,
      detectedAt: c.detectedAt,
      dueInHours: c.dueInHours,
      urgency: classifyUrgency(s.severity, c.dueInHours),
    };
  });

  return { cards, totalCandidates: merged.length, winners };
}

// ===========================
// 데이터 로딩 — 기존 판단원 3개
// ===========================

// smaXtec 건강 이벤트 → 조치 제목/근거 (신뢰 이벤트, 재판단 금지)
const SMAXTEC_ACTIONABLE: Record<string, { title: (tag: string) => string; why: string }> = {
  temperature_high: { title: (t) => `${t} 발열 개체 즉시 확인`, why: '위내센서 체온 상승 감지 (smaXtec)' },
  temperature_warning: { title: (t) => `${t} 체온 이상 확인`, why: '위내센서 체온 이상 감지 (smaXtec)' },
  clinical_condition: { title: (t) => `${t} 질병 의심 — 수의사 점검`, why: '임상 징후 복합 감지 (smaXtec)' },
  health_warning: { title: (t) => `${t} 건강 경고 확인`, why: '건강 지표 이상 (smaXtec)' },
  rumination_decrease: { title: (t) => `${t} 반추 급감 — 사료·질병 점검`, why: '반추 시간 감소 (smaXtec)' },
  activity_decrease: { title: (t) => `${t} 활동 저하 확인`, why: '활동량 감소 (smaXtec)' },
  drinking_decrease: { title: (t) => `${t} 음수 감소 확인`, why: '음수 횟수 감소 (smaXtec)' },
  calving_detection: { title: (t) => `${t} 분만 임박 — 분만실 준비`, why: '분만 징후 감지 (smaXtec)' },
};

/** 열스트레스 카드 대상 농장 수 상한 — 전국 뷰(방역 대시보드 영역)에서는 만들지 않음 */
const WEATHER_MAX_FARMS = 20;
/** THI 위험(danger) 임계 — weather.connector thiLevel과 동일 기준 */
const THI_DANGER = 78;
const THI_EMERGENCY = 84;

/**
 * 기상청 실측 THI → 폭염 대응 후보 (순수 함수 — 테스트 대상).
 * 정직성: 실측(source='kma')만 카드화 — 계절 추정치로 조치를 지시하지 않는다.
 * detectedAt은 시간 단위로 절단 — 카드 ID가 시간 내 안정 (완료 처리 유지), 매시 재평가.
 */
export function thiCandidate(input: {
  readonly source: 'kma' | 'estimate';
  readonly thi: number;
  readonly temperature: number;
  readonly humidity: number;
  readonly farmId: string;
  readonly farmName?: string;
  readonly now?: number;
}): DecisionCandidate | null {
  if (input.source !== 'kma') return null;
  if (input.thi < THI_DANGER) return null;
  const emergency = input.thi >= THI_EMERGENCY;
  const hourTruncated = new Date(Math.floor((input.now ?? Date.now()) / MS_PER_HOUR) * MS_PER_HOUR);
  return {
    source: 'weather',
    severity: emergency ? 'critical' : 'high',
    confidence: 0.9,
    title: emergency
      ? '폭염 긴급 — 즉시 환기·차광·급수 확보'
      : '폭염 대응 — 환기·차광·급수 점검',
    why: [
      `THI ${input.thi} (기상청 실측) — 열스트레스 ${emergency ? '긴급' : '위험'} 단계`,
      `기온 ${input.temperature}°C · 습도 ${Math.round(input.humidity)}%${emergency ? ' — 유량 15%↓·폐사 위험' : ' — 유량 5~15%↓ 위험'}`,
    ],
    farmId: input.farmId,
    farmName: input.farmName,
    detectedAt: hourTruncated.toISOString(),
    dueInHours: 3,
  };
}

const BREEDING_ACTION_META: Record<string, { severity: DecisionSeverity; why: string }> = {
  calving_imminent: { severity: 'critical', why: '분만 예정 임박 (번식 파이프라인)' },
  inseminate_now: { severity: 'high', why: '수정 적기 진입 (발정 감지 기준)' },
  pregnancy_check_due: { severity: 'medium', why: '수정 후 임신감정 시기 도래' },
  repeat_breeder: { severity: 'medium', why: '반복 수정 실패 — 번식장애 점검 필요' },
};

// 기상 커넥터 싱글턴 — 격자 캐시(10분)를 요청 간 공유
type WeatherConnectorLike = {
  fetchCurrentWeather(lat: number, lng: number): Promise<{
    readonly source: 'kma' | 'estimate';
    readonly thi: number;
    readonly temperature: number;
    readonly humidity: number;
  } | null>;
};
let weatherConnectorSingleton: WeatherConnectorLike | null = null;
function getWeatherConnector(ctor: new () => WeatherConnectorLike): WeatherConnectorLike {
  if (!weatherConnectorSingleton) {
    weatherConnectorSingleton = new ctor();
  }
  return weatherConnectorSingleton;
}

export async function getDecisionQueue(params: {
  readonly farmId?: string;
  readonly farmIdsScope?: readonly string[];
  readonly role?: string;
  readonly limit?: number;
}): Promise<DecisionQueueData> {
  const db = getDb();
  const now = Date.now();
  const since48h = new Date(now - 48 * MS_PER_HOUR);
  const since24h = new Date(now - 24 * MS_PER_HOUR);

  const farmScope: string[] | undefined =
    params.farmIdsScope && params.farmIdsScope.length > 0
      ? [...params.farmIdsScope]
      : params.farmId
        ? [params.farmId]
        : undefined;

  const candidates: DecisionCandidate[] = [];

  // 1) 소버린 알람 (최근 48h — 일일 스윕 주기 고려)
  try {
    const sovereignConds = [
      eq(predictions.engineType, 'sovereign_v1'),
      gte(predictions.timestamp, since48h),
      isNotNull(predictions.animalId),
      inArray(predictions.severity, ['critical', 'high', 'medium']),
    ];
    if (farmScope) sovereignConds.push(inArray(predictions.farmId, farmScope));
    const sovereignRows = await db
      .select({
        animalId: predictions.animalId,
        farmId: predictions.farmId,
        severity: predictions.severity,
        confidence: predictions.confidence,
        label: predictions.predictionLabel,
        explanation: predictions.explanationText,
        action: predictions.recommendedAction,
        timestamp: predictions.timestamp,
        earTag: animals.earTag,
        farmName: farms.name,
      })
      .from(predictions)
      .leftJoin(animals, eq(predictions.animalId, animals.animalId))
      .leftJoin(farms, eq(predictions.farmId, farms.farmId))
      .where(and(...sovereignConds))
      .orderBy(sql`${predictions.rankScore} desc`)
      .limit(30);

    for (const r of sovereignRows) {
      candidates.push({
        source: 'sovereign',
        severity: (SEVERITY_ORDER as readonly string[]).includes(r.severity)
          ? (r.severity as DecisionSeverity)
          : 'medium',
        confidence: r.confidence,
        title: r.action || r.label,
        why: [r.label, r.explanation].filter(Boolean).slice(0, 2),
        animalId: r.animalId ?? undefined,
        earTag: r.earTag ?? undefined,
        farmId: r.farmId,
        farmName: r.farmName ?? undefined,
        detectedAt: r.timestamp.toISOString(),
      });
    }
  } catch (err) {
    logger.error({ err }, '[DecisionQueue] 소버린 후보 로딩 실패');
  }

  // 2) smaXtec 이벤트 (최근 24h, 조치 가능 유형만)
  try {
    const eventConds = [
      gte(smaxtecEvents.detectedAt, since24h),
      inArray(smaxtecEvents.eventType, Object.keys(SMAXTEC_ACTIONABLE)),
      inArray(smaxtecEvents.severity, ['critical', 'high', 'medium']),
    ];
    if (farmScope) eventConds.push(inArray(smaxtecEvents.farmId, farmScope));
    const eventRows = await db
      .select({
        animalId: smaxtecEvents.animalId,
        farmId: smaxtecEvents.farmId,
        eventType: smaxtecEvents.eventType,
        severity: smaxtecEvents.severity,
        confidence: smaxtecEvents.confidence,
        detectedAt: smaxtecEvents.detectedAt,
        earTag: animals.earTag,
        farmName: farms.name,
      })
      .from(smaxtecEvents)
      .leftJoin(animals, eq(smaxtecEvents.animalId, animals.animalId))
      .leftJoin(farms, eq(smaxtecEvents.farmId, farms.farmId))
      .where(and(...eventConds))
      .orderBy(sql`${smaxtecEvents.detectedAt} desc`)
      .limit(30);

    for (const r of eventRows) {
      const meta = SMAXTEC_ACTIONABLE[r.eventType];
      if (!meta) continue;
      const tag = r.earTag ?? '무이표';
      candidates.push({
        lossFraction: LOSS_FRACTION_BY_EVENT[r.eventType],
        source: 'smaxtec',
        severity: (SEVERITY_ORDER as readonly string[]).includes(r.severity ?? '')
          ? (r.severity as DecisionSeverity)
          : 'medium',
        confidence: r.confidence ?? 0.85,
        title: meta.title(tag),
        why: [meta.why],
        animalId: r.animalId ?? undefined,
        earTag: r.earTag ?? undefined,
        farmId: r.farmId ?? undefined,
        farmName: r.farmName ?? undefined,
        detectedAt: r.detectedAt.toISOString(),
      });
    }
  } catch (err) {
    logger.error({ err }, '[DecisionQueue] smaXtec 후보 로딩 실패');
  }

  // 3) 번식 긴급조치 (방역관 뷰에서는 제외 — 관심 도메인 아님)
  if (params.role !== 'quarantine_officer') {
    try {
      const pipeline = await getBreedingPipeline(params.farmId, params.farmIdsScope);
      for (const a of pipeline.urgentActions.slice(0, 15)) {
        const meta = BREEDING_ACTION_META[a.actionType] ?? { severity: 'medium' as DecisionSeverity, why: '번식 일정 도래' };
        candidates.push({
          source: 'breeding',
          severity: meta.severity,
          confidence: 0.8,
          title: a.description,
          why: [meta.why],
          animalId: a.animalId,
          earTag: a.earTag,
          farmId: a.farmId,
          farmName: a.farmName,
          detectedAt: a.detectedAt,
          dueInHours: a.hoursRemaining,
        });
      }
    } catch (err) {
      logger.error({ err }, '[DecisionQueue] 번식 후보 로딩 실패');
    }
  }

  // 4) 열스트레스 (기상청 실측 THI) — 스코프가 명확한 소수 농장만 (전국 뷰 제외)
  if (farmScope && farmScope.length > 0 && farmScope.length <= WEATHER_MAX_FARMS) {
    try {
      const farmRows = await db
        .select({ farmId: farms.farmId, name: farms.name, lat: farms.lat, lng: farms.lng })
        .from(farms)
        .where(inArray(farms.farmId, farmScope));
      const { WeatherConnector } = await import('../../pipeline/connectors/public-data/weather.connector.js');
      const connector = getWeatherConnector(WeatherConnector);
      for (const farm of farmRows) {
        const record = await connector.fetchCurrentWeather(farm.lat, farm.lng);
        if (!record) continue; // API 키 없음 — 카드 생성 안 함
        const candidate = thiCandidate({
          source: record.source,
          thi: record.thi,
          temperature: record.temperature,
          humidity: record.humidity,
          farmId: farm.farmId,
          farmName: farm.name,
          now,
        });
        if (candidate) candidates.push(candidate);
      }
    } catch (err) {
      logger.error({ err }, '[DecisionQueue] 열스트레스 후보 로딩 실패');
    }
  }

  const { cards, totalCandidates, winners } = buildDecisionCards(candidates, {
    limit: Math.min(params.limit ?? 5, 10),
  });

  // 경제 환산 — 실측 유량(최근 7일) 보유 개체만. 추정 유량으로는 계산하지 않는다.
  let enriched = cards;
  try {
    const econTargets = winners
      .map((w, i) => ({ w, i }))
      .filter(({ w }) => w.lossFraction != null && w.animalId);
    if (econTargets.length > 0) {
      // 농장별 계약 단가 반영 — 기본값(카탈로그)은 오버라이드 없을 때만 사용
      const [yields, paramsByFarm] = await Promise.all([
        getAvgDailyYield(econTargets.map(({ w }) => w.animalId!), 7),
        getEconomicParamValuesByFarm(
          econTargets.map(({ w }) => w.farmId).filter((f): f is string => f != null),
        ),
      ]);
      enriched = cards.map((card, i) => {
        const winner = winners[i];
        if (!winner?.lossFraction || !winner.animalId) return card;
        const avgYield = yields.get(winner.animalId);
        if (avgYield == null) return card;
        const milkPrice = winner.farmId
          ? paramsByFarm.get(winner.farmId)?.milk_price_krw_per_l
          : undefined;
        const impact = estimateDailyLoss(avgYield, winner.lossFraction, milkPrice);
        return impact ? { ...card, economicImpact: impact } : card;
      });
    }
  } catch (err) {
    logger.error({ err }, '[DecisionQueue] 경제 환산 실패 — 카드만 반환');
  }

  return {
    cards: enriched,
    totalCandidates,
    generatedAt: new Date().toISOString(),
  };
}
