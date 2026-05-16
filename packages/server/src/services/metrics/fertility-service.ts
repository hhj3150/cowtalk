// 수태율(CR) 단일 진실 공급원
// metrics-contract.md §6.1 / Decision Log D1·D2 / BUG-001
//
// 사용 규칙:
// 1. 새 사이트에서 CR을 표시해야 한다면 반드시 이 모듈을 호출한다.
// 2. 인라인 `pregnant / decided * 100` 코드 금지.
// 3. "decided" 정의는 D2: 임신확정 + 공태확정(pending 제외).
// 4. 빈 농장(decided===0)은 rate=null 반환. UI는 "—" 표시 (D5).
//
// 이 모듈은 DB에 의존하지 않는다. 호출처가 row를 가져와서 extractor로 변환한 뒤 compute에 전달한다.
// 이렇게 분리해야 단위 테스트가 DB 없이 가능하다.

/** 한 임신감정의 결과. pending/inconclusive는 이 타입으로 표현되지 않는다. */
export interface Decision {
  readonly pregnant: boolean;
}

/** 수태율 데이터 상태 (D5). */
export type CRStatus = 'ok' | 'data_insufficient';

/** 수태율 계산 결과. */
export interface CRResult {
  /** 임신확정 두수 */
  readonly numerator: number;
  /** 임신확정 + 공태확정 두수 (decided) */
  readonly denominator: number;
  /** 0–100 정수 백분율. denominator===0 이면 null (빈 농장, D5). */
  readonly rate: number | null;
  /** UI 직접 표시용. 빈 농장은 "—", 그 외 "83.0%" (D5). */
  readonly displayValue: string;
  /** 상태 sentinel. UI가 "데이터 부족" 분기에 사용 (D5). */
  readonly status: CRStatus;
}

/** 결정 배열로부터 CR 계산. */
export function computeCR(decisions: ReadonlyArray<Decision>): CRResult {
  let pregnant = 0;
  for (const d of decisions) {
    if (d.pregnant) pregnant += 1;
  }
  return buildResult(pregnant, decisions.length);
}

/** 이미 집계된 카운트로부터 CR 계산. SQL aggregate 호출처용. */
export function computeCRFromCounts(pregnantCount: number, decidedCount: number): CRResult {
  return buildResult(pregnantCount, decidedCount);
}

// ─────────────────────────────────────────────────────────
// Extractors — 데이터 소스별 → Decision[]
// ─────────────────────────────────────────────────────────

/**
 * pregnancyChecks 테이블 row → Decision[].
 * result === 'pregnant'  → pregnant=true (임신확정)
 * result === 'open' | 'not_pregnant' → pregnant=false (공태확정)
 * 그 외 (pending, inconclusive, null 등) → 분모에서 제외 (D2)
 */
export function decisionsFromPregnancyChecks(
  rows: ReadonlyArray<{ result: string | null }>,
): readonly Decision[] {
  const out: Decision[] = [];
  for (const r of rows) {
    if (r.result === 'pregnant') {
      out.push({ pregnant: true });
    } else if (r.result === 'open' || r.result === 'not_pregnant') {
      out.push({ pregnant: false });
    }
    // pending 등은 제외
  }
  return out;
}

/**
 * smaXtec events 중 pregnancy_check 이벤트 → Decision[].
 * details.pregnant === true | false 만 결정. undefined/null/그 외 값은 제외.
 */
export function decisionsFromSmaxtecPregnancyEvents(
  events: ReadonlyArray<{ eventType: string; details: unknown }>,
): readonly Decision[] {
  const out: Decision[] = [];
  for (const e of events) {
    if (e.eventType !== 'pregnancy_check') continue;
    const details = e.details as Record<string, unknown> | null;
    const pregnant = details?.pregnant;
    if (pregnant === true) {
      out.push({ pregnant: true });
    } else if (pregnant === false) {
      out.push({ pregnant: false });
    }
  }
  return out;
}

/**
 * breedingEvents GROUP BY type 결과 → Decision[].
 * type === 'pregnancy_confirmed' | 'pregnancy_check' → 임신확정
 * type === 'pregnancy_failed' | 'not_pregnant' | 'open' → 공태확정
 * type === 'insemination' 등은 무시 (감정 결과 아님)
 */
export function decisionsFromBreedingEventCounts(
  rows: ReadonlyArray<{ type: string; cnt: number }>,
): readonly Decision[] {
  const out: Decision[] = [];
  for (const r of rows) {
    if (r.cnt <= 0) continue;
    if (r.type === 'pregnancy_confirmed' || r.type === 'pregnancy_check') {
      for (let i = 0; i < r.cnt; i += 1) out.push({ pregnant: true });
    } else if (r.type === 'pregnancy_failed' || r.type === 'not_pregnant' || r.type === 'open') {
      for (let i = 0; i < r.cnt; i += 1) out.push({ pregnant: false });
    }
  }
  return out;
}

// ─────────────────────────────────────────────────────────
// Internal
// ─────────────────────────────────────────────────────────

function buildResult(pregnant: number, decided: number): CRResult {
  if (!Number.isFinite(pregnant) || !Number.isFinite(decided) || decided <= 0) {
    return {
      numerator: Math.max(0, pregnant | 0),
      denominator: Math.max(0, decided | 0),
      rate: null,
      displayValue: '—',
      status: 'data_insufficient',
    };
  }
  const safePreg = Math.min(Math.max(0, pregnant), decided);
  const rawRate = (safePreg / decided) * 100;
  const clamped = Math.max(0, Math.min(100, rawRate));
  const rate = Math.round(clamped);
  return {
    numerator: safePreg,
    denominator: decided,
    rate,
    displayValue: `${rate.toFixed(1)}%`,
    status: 'ok',
  };
}
