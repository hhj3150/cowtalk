// 휴약기간 계산기 — 순수 함수
//
// DI-01: 예전 구현은 서버 로컬 시간(운영 서버 = UTC)으로 setDate 후 toISOString 날짜를 잘라 썼다.
//   한국 오전(KST 00:00~08:59)에 기록하면 UTC로는 전날이라 휴약 종료일이 하루 빨랐다 → 잔류 위험 출하.
//   또 사용자가 입력한 하나의 일수만 썼고, 약품 DB의 원유·식육 휴약기간을 보지 않았다.
//
// 기준 (보수적 = 출하를 늦추는 쪽):
//   - 시간은 KST(UTC+9, 일광절약 없음) 기준
//   - 휴약은 "마지막 투약 시각 + N×24시간" 이 지나야 끝난다 (날짜 단순 더하기가 아님)
//   - 1회 투약: 마지막 투약 = 기록된 투약 시각
//   - 여러 날 투약: 마지막 날의 투약 시각을 모르므로 그날 KST 23:59:59 에 투약했다고 가정
//   - 원유·식육은 따로 계산하고, 입력값과 약품 DB 값 중 긴 쪽을 쓴다

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const KST_OFFSET_MS = 9 * HOUR_MS;

/** 순간(instant)의 KST 달력 날짜 YYYY-MM-DD */
export function kstDateString(instant: Date): string {
  return new Date(instant.getTime() + KST_OFFSET_MS).toISOString().slice(0, 10);
}

/** 순간의 KST HH:MM */
export function kstTimeString(instant: Date): string {
  return new Date(instant.getTime() + KST_OFFSET_MS).toISOString().slice(11, 16);
}

/** 그 순간이 속한 KST 날짜의 마지막 시각(23:59:59.999 KST) */
export function endOfKstDay(instant: Date): Date {
  const kstMidnight = Date.parse(`${kstDateString(instant)}T00:00:00.000Z`) - KST_OFFSET_MS;
  return new Date(kstMidnight + DAY_MS - 1);
}

export interface WithdrawalResult {
  /** 휴약 종료일 (KST 날짜, YYYY-MM-DD) — 이 날 withdrawalEndAt 시각 이후 출하 가능 */
  readonly withdrawalEndDate: string;
  /** 휴약 종료 시각 (ISO, UTC) */
  readonly withdrawalEndAt: string;
  /** 마지막 투약일 (KST 날짜) */
  readonly lastDoseDate: string;
  /** 오늘 기준 남은 일수 (올림, 0이면 출하 가능) */
  readonly daysRemaining: number;
  readonly clearForShipment: boolean;
}

/**
 * @param administeredAt 첫 투약 시각 (실제 순간)
 * @param withdrawalDays 휴약 일수 (N×24시간)
 * @param durationDays 투약 기간(일), 기본 1
 * @param now 기준 시각 (테스트 주입용)
 */
export function calculateWithdrawal(
  administeredAt: Date,
  withdrawalDays: number,
  durationDays: number = 1,
  now: Date = new Date(),
): WithdrawalResult {
  const days = Math.max(0, withdrawalDays);
  const duration = Math.max(1, Math.floor(durationDays));
  const lastDose = duration <= 1
    ? new Date(administeredAt)
    : endOfKstDay(new Date(administeredAt.getTime() + (duration - 1) * DAY_MS));
  const endAt = new Date(lastDose.getTime() + days * DAY_MS);
  const remainingMs = endAt.getTime() - now.getTime();

  return {
    withdrawalEndDate: kstDateString(endAt),
    withdrawalEndAt: endAt.toISOString(),
    lastDoseDate: kstDateString(lastDose),
    daysRemaining: remainingMs > 0 ? Math.ceil(remainingMs / DAY_MS) : 0,
    clearForShipment: remainingMs <= 0,
  };
}

// ── 약품별 기준 ──

export interface DrugWithdrawalReference {
  readonly milkDays: number;
  readonly meatDays: number;
}

export interface ResolvedWithdrawalDays {
  readonly milkDays: number;
  readonly meatDays: number;
  /** 어떤 근거로 정했는가 */
  readonly basis: 'entered' | 'drug_database' | 'entered_and_drug_database';
  /** 입력값이 약품 DB 기준보다 짧아 DB 값으로 올렸을 때의 안내 */
  readonly warnings: readonly string[];
}

/**
 * 입력 휴약일수와 약품 DB 기준을 합친다 — 원유·식육 각각 긴 쪽.
 * 약품 DB에 없으면 입력값을 원유·식육 모두에 적용한다 (어느 한쪽을 0으로 두지 않음).
 */
export function resolveWithdrawalDays(
  enteredDays: number | undefined,
  drug: DrugWithdrawalReference | null,
): ResolvedWithdrawalDays {
  const entered = enteredDays !== undefined && Number.isFinite(enteredDays) && enteredDays > 0 ? enteredDays : 0;
  if (!drug) {
    return { milkDays: entered, meatDays: entered, basis: 'entered', warnings: [] };
  }
  const warnings: string[] = [];
  if (entered > 0 && entered < drug.milkDays) {
    warnings.push(`입력한 휴약 ${String(entered)}일이 약품 기준(원유 ${String(drug.milkDays)}일)보다 짧아 기준값을 적용했습니다`);
  }
  if (entered > 0 && entered < drug.meatDays) {
    warnings.push(`입력한 휴약 ${String(entered)}일이 약품 기준(식육 ${String(drug.meatDays)}일)보다 짧아 기준값을 적용했습니다`);
  }
  return {
    milkDays: Math.max(entered, drug.milkDays),
    meatDays: Math.max(entered, drug.meatDays),
    basis: entered > 0 ? 'entered_and_drug_database' : 'drug_database',
    warnings,
  };
}
