// 휴약기간 계산기 — 순수 함수
// 마지막 투약일 + 휴약일수 = 출하 가능일 (첫 투약일이 아님)

export interface WithdrawalResult {
  readonly withdrawalEndDate: string;   // ISO date (YYYY-MM-DD)
  readonly lastDoseDate: string;        // ISO date
  readonly daysRemaining: number;       // 오늘 기준 남은 일수 (0이면 출하 가능)
}

export function calculateWithdrawal(
  administeredAt: Date,
  withdrawalDays: number,
  durationDays: number = 1,
): WithdrawalResult {
  // 마지막 투약일 = 첫 투약일 + (기간 - 1)
  const lastDose = new Date(administeredAt);
  lastDose.setDate(lastDose.getDate() + Math.max(durationDays - 1, 0));

  // 휴약 종료일 = 마지막 투약일 + 휴약일수
  const endDate = new Date(lastDose);
  endDate.setDate(endDate.getDate() + withdrawalDays);

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const endDateNorm = new Date(endDate);
  endDateNorm.setHours(0, 0, 0, 0);

  const daysRemaining = Math.max(
    0,
    Math.ceil((endDateNorm.getTime() - today.getTime()) / (24 * 60 * 60 * 1000)),
  );

  return {
    withdrawalEndDate: endDate.toISOString().slice(0, 10),
    lastDoseDate: lastDose.toISOString().slice(0, 10),
    daysRemaining,
  };
}
