// 폐루프 엔진 — 감지·개입 연결과 센서 검증 (전부 순수 함수, DB 없음)
//
// 루프: ① smaXtec 감지(신뢰, 재판단 안 함) → ② 개입(치료·보충제) → ③ 센서 검증 → ④ 수의사 확정
// smaXtec 의 체내 방출 폐루프(개발 중)는 ②를 자동화하지만 ③이 없다. CowTalk 이 ③④를 맡는다.
//
// 검증 창 설계 (기존 치료결과 배치의 약점 보완):
// - 기준선 = 감지(없으면 개입) 전날까지 3일 — 개입 후 데이터가 기준선에 섞이지 않는다
// - 검증 = 개입 + verifyStartHours 부터 verifyWindowHours 동안 — "오늘 투여, 오늘 판정" 금지
// - 최근값 = 검증 창 마지막 2일 평균 — 하루 노이즈로 판정이 뒤집히지 않게

import type { LoopVerdict, LoopVerification, SensorWindowAvg } from '@cowtalk/shared';
import type { ClosedLoopProtocol, Criterion, WorsenRule } from './closed-loop-protocols.js';

export type MetricKey = 'temperature' | 'rumination' | 'activity';

export interface DailyPoint {
  readonly date: string; // YYYY-MM-DD (sensor_daily_agg.date)
  readonly metricType: string;
  readonly avg: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const BASELINE_DAYS = 3;
const LATEST_DAYS = 2;

export function toDateStr(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function mean(vals: readonly number[]): number | null {
  if (vals.length === 0) return null;
  return round2(vals.reduce((a, b) => a + b, 0) / vals.length);
}

function windowAvg(points: readonly DailyPoint[], from: string, to: string, lastN?: number): SensorWindowAvg {
  const inRange = points.filter((p) => p.date >= from && p.date <= to);
  const pick = (metric: MetricKey): number | null => {
    const rows = inRange.filter((p) => p.metricType === metric).sort((a, b) => a.date.localeCompare(b.date));
    const sel = lastN ? rows.slice(-lastN) : rows;
    return mean(sel.map((r) => r.avg));
  };
  const days = new Set(inRange.map((p) => p.date)).size;
  return { temp: pick('temperature'), rumination: pick('rumination'), activity: pick('activity'), days };
}

type Eval = 'met' | 'unmet' | 'unknown';

function evalCriterion(c: Criterion, base: SensorWindowAvg, latest: SensorWindowAvg): Eval {
  switch (c.kind) {
    case 'temp_below':
      return latest.temp === null ? 'unknown' : latest.temp < c.threshold ? 'met' : 'unmet';
    case 'temp_at_least':
      return latest.temp === null ? 'unknown' : latest.temp >= c.threshold ? 'met' : 'unmet';
    case 'rumination_recovery':
      if (latest.rumination === null || base.rumination === null || base.rumination <= 0) return 'unknown';
      return latest.rumination >= base.rumination * c.threshold ? 'met' : 'unmet';
    case 'activity_recovery':
      if (latest.activity === null || base.activity === null || base.activity <= 0) return 'unknown';
      return latest.activity >= base.activity * c.threshold ? 'met' : 'unmet';
  }
}

function evalWorsen(w: WorsenRule, base: SensorWindowAvg, latest: SensorWindowAvg): boolean {
  switch (w.kind) {
    case 'temp_above':
      return latest.temp !== null && latest.temp > w.threshold;
    case 'temp_under':
      return latest.temp !== null && latest.temp < w.threshold;
    case 'rumination_drop':
      return latest.rumination !== null && base.rumination !== null && base.rumination > 0
        && latest.rumination < base.rumination * w.threshold;
  }
}

const NEXT_ACTION: Readonly<Record<LoopVerdict, string>> = {
  awaiting: '검증 시작 전 — 투여 직후 센서 변화로 판단하지 말고 검증 창을 기다리세요',
  insufficient_data: '센서값 부족 — 직접 관찰·임상검사로 경과를 기록하세요',
  monitoring: '검증 진행 중 — 다음 배치에서 재판정합니다',
  improving: '회복 추세 — 처치 유지, 검증 창 종료 시 재확인',
  resolved: '센서 기준 회복 — 수의사가 결과를 확정하면 루프가 닫힙니다',
  not_improved: '기준 미충족 — 수의사 재평가·감별진단 재실행을 권고합니다',
  worsened: '악화 신호 — 즉시 수의사 재진, 처치 변경을 검토하세요',
};

export interface VerifyInput {
  readonly protocol: ClosedLoopProtocol;
  readonly interventionAt: Date;
  /** 기준선 기준 시각 — smaXtec 감지 시각, 없으면 개입 시각 */
  readonly anchorAt: Date;
  readonly points: readonly DailyPoint[];
  readonly now: Date;
}

export function verifyLoop(input: VerifyInput): LoopVerification {
  const { protocol, interventionAt, anchorAt, points, now } = input;

  const baseFrom = toDateStr(new Date(anchorAt.getTime() - BASELINE_DAYS * DAY_MS));
  const baseTo = toDateStr(new Date(anchorAt.getTime() - DAY_MS));
  const baseline = windowAvg(points, baseFrom, baseTo);

  const startAt = new Date(interventionAt.getTime() + protocol.verifyStartHours * 3600_000);
  const endAt = new Date(startAt.getTime() + protocol.verifyWindowHours * 3600_000);
  const windowComplete = now.getTime() >= endAt.getTime();
  const postFrom = toDateStr(startAt);
  const postTo = toDateStr(windowComplete ? endAt : now);

  const empty: SensorWindowAvg = { temp: null, rumination: null, activity: null, days: 0 };
  const base = {
    protocol: protocol.key,
    windowComplete,
    baseline,
    verifiedAt: now.toISOString(),
  };

  if (now.getTime() < startAt.getTime()) {
    return {
      ...base,
      verdict: 'awaiting',
      post: empty,
      metCriteria: [],
      unmetCriteria: [],
      explanation: `${protocol.label} 검증은 개입 ${protocol.verifyStartHours}시간 후부터 ${protocol.verifyWindowHours}시간 동안 진행합니다.`,
      contributingFactors: [],
      nextAction: NEXT_ACTION.awaiting,
    };
  }

  const post = windowAvg(points, postFrom, postTo);
  const latest = windowAvg(points, postFrom, postTo, LATEST_DAYS);

  const factors: string[] = [];
  if (baseline.days === 0) factors.push('감지 전 기준선 센서값 없음 — 비율 기준은 판정 불가');
  if (baseline.temp !== null && latest.temp !== null) factors.push(`체온 ${baseline.temp}°C → ${latest.temp}°C`);
  if (baseline.rumination !== null && latest.rumination !== null) {
    const pct = Math.round(((latest.rumination - baseline.rumination) / baseline.rumination) * 100);
    factors.push(`반추 ${baseline.rumination} → ${latest.rumination} (${pct >= 0 ? '+' : ''}${pct}%)`);
  }
  if (baseline.activity !== null && latest.activity !== null) {
    const pct = Math.round(((latest.activity - baseline.activity) / baseline.activity) * 100);
    factors.push(`활동 ${baseline.activity} → ${latest.activity} (${pct >= 0 ? '+' : ''}${pct}%)`);
  }
  if (protocol.caveat) factors.push(protocol.caveat);

  const worsened = protocol.worsen.filter((w) => evalWorsen(w, baseline, latest));
  const evals = protocol.primary.map((c) => ({ c, r: evalCriterion(c, baseline, latest) }));
  const met = evals.filter((e) => e.r === 'met').map((e) => e.c.label);
  const unmet = evals.filter((e) => e.r === 'unmet').map((e) => e.c.label);
  const unknown = evals.filter((e) => e.r === 'unknown').map((e) => e.c.label);
  if (unknown.length > 0) factors.push(`판정 불가 기준: ${unknown.join(', ')}`);

  let verdict: LoopVerdict;
  if (worsened.length > 0) {
    verdict = 'worsened';
  } else if (met.length + unmet.length === 0) {
    verdict = windowComplete ? 'insufficient_data' : 'monitoring';
  } else if (unmet.length === 0) {
    verdict = 'resolved';
  } else if (met.length > 0) {
    verdict = 'improving';
  } else {
    verdict = windowComplete ? 'not_improved' : 'monitoring';
  }

  const explanation = verdict === 'worsened'
    ? `${protocol.label}: 악화 기준 충족 (${worsened.map((w) => w.label).join(', ')}).`
    : verdict === 'resolved'
      ? `${protocol.label}: 회복 기준 ${met.length}개 모두 충족 (${met.join(', ')}).`
      : verdict === 'improving'
        ? `${protocol.label}: 회복 기준 ${met.length}/${met.length + unmet.length}개 충족 — 미충족: ${unmet.join(', ')}.`
        : verdict === 'not_improved'
          ? `${protocol.label}: 검증 창(${protocol.verifyWindowHours}h) 종료, 회복 기준 미충족 (${unmet.join(', ')}).`
          : verdict === 'insufficient_data'
            ? `${protocol.label}: 검증 창 동안 판정 가능한 센서값이 없습니다.`
            : `${protocol.label}: 검증 진행 중 (${post.days}일치 센서 확보).`;

  return {
    ...base,
    verdict,
    post,
    metCriteria: met,
    unmetCriteria: unmet,
    explanation,
    contributingFactors: factors,
    nextAction: NEXT_ACTION[verdict],
  };
}

// ── 감지 에피소드 · 개입 연결 ──

export interface DetectionEvent {
  readonly animalId: string;
  readonly eventType: string;
  readonly severity: string;
  readonly detectedAt: Date;
  readonly acknowledged: boolean;
}

export interface DetectionEpisode {
  readonly animalId: string;
  readonly startAt: Date;
  readonly lastAt: Date;
  readonly eventTypes: readonly string[];
  readonly severity: string;
  readonly acknowledged: boolean;
}

const SEVERITY_RANK: Readonly<Record<string, number>> = { critical: 4, high: 3, medium: 2, low: 1 };

function maxSeverity(a: string, b: string): string {
  return (SEVERITY_RANK[b] ?? 0) > (SEVERITY_RANK[a] ?? 0) ? b : a;
}

/** 같은 개체의 감지가 mergeHours 이내로 이어지면 한 에피소드로 묶는다 */
export function buildEpisodes(events: readonly DetectionEvent[], mergeHours = 72): readonly DetectionEpisode[] {
  const byAnimal = new Map<string, DetectionEvent[]>();
  for (const e of events) {
    const arr = byAnimal.get(e.animalId) ?? [];
    arr.push(e);
    byAnimal.set(e.animalId, arr);
  }
  const out: DetectionEpisode[] = [];
  for (const [animalId, list] of byAnimal) {
    const sorted = [...list].sort((a, b) => a.detectedAt.getTime() - b.detectedAt.getTime());
    let cur: { startAt: Date; lastAt: Date; types: Set<string>; severity: string; ack: boolean } | null = null;
    for (const e of sorted) {
      if (cur && e.detectedAt.getTime() - cur.lastAt.getTime() <= mergeHours * 3600_000) {
        cur.lastAt = e.detectedAt;
        cur.types.add(e.eventType);
        cur.severity = maxSeverity(cur.severity, e.severity);
        cur.ack = cur.ack || e.acknowledged;
      } else {
        if (cur) out.push({ animalId, startAt: cur.startAt, lastAt: cur.lastAt, eventTypes: [...cur.types], severity: cur.severity, acknowledged: cur.ack });
        cur = { startAt: e.detectedAt, lastAt: e.detectedAt, types: new Set([e.eventType]), severity: e.severity, ack: e.acknowledged };
      }
    }
    if (cur) out.push({ animalId, startAt: cur.startAt, lastAt: cur.lastAt, eventTypes: [...cur.types], severity: cur.severity, acknowledged: cur.ack });
  }
  return out.sort((a, b) => b.startAt.getTime() - a.startAt.getTime());
}

export interface InterventionRef {
  readonly id: string;
  readonly animalId: string;
  readonly at: Date;
}

export interface LinkResult {
  /** 개입 id → 연결된 에피소드 시작 시각 */
  readonly anchorByIntervention: ReadonlyMap<string, Date>;
  readonly intervenedEpisodes: readonly DetectionEpisode[];
  readonly openEpisodes: readonly DetectionEpisode[];
}

/**
 * 에피소드 ↔ 개입 연결. 개입이 [에피소드 시작 − leadHours, 마지막 감지 + lagHours] 안이면 연결.
 * (현장에서 센서 알람보다 먼저 처치하는 경우가 있어 leadHours 를 둔다)
 */
export function linkInterventions(
  episodes: readonly DetectionEpisode[],
  interventions: readonly InterventionRef[],
  leadHours = 12,
  lagHours = 72,
): LinkResult {
  const anchor = new Map<string, Date>();
  const intervened: DetectionEpisode[] = [];
  const open: DetectionEpisode[] = [];
  for (const ep of episodes) {
    const from = ep.startAt.getTime() - leadHours * 3600_000;
    const to = ep.lastAt.getTime() + lagHours * 3600_000;
    const linked = interventions.filter((i) => i.animalId === ep.animalId && i.at.getTime() >= from && i.at.getTime() <= to);
    if (linked.length === 0) {
      open.push(ep);
      continue;
    }
    intervened.push(ep);
    for (const i of linked) {
      const prev = anchor.get(i.id);
      // 여러 에피소드에 걸리면 가장 가까운(늦은) 감지를 기준선 앵커로
      if (!prev || ep.startAt.getTime() > prev.getTime()) anchor.set(i.id, ep.startAt);
    }
  }
  return { anchorByIntervention: anchor, intervenedEpisodes: intervened, openEpisodes: open };
}

const FINAL_VERDICTS: ReadonlySet<LoopVerdict> = new Set<LoopVerdict>(['resolved', 'not_improved', 'worsened']);

export function isFinalVerdict(v: LoopVerdict): boolean {
  return FINAL_VERDICTS.has(v);
}

export function ratio(n: number, d: number): number | null {
  return d > 0 ? Math.round((n / d) * 1000) / 1000 : null;
}
