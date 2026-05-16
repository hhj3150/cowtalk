// 백분율·메트릭 경계 보장 헬퍼
// 화면에 표시되는 모든 백분율·점수는 이 함수를 통과해야 한다.
// 농장주가 113.1% 같은 불가능한 숫자를 다시는 보지 않도록.

export function clampPct(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, value));
}

export function clampPct1(value: number): number {
  return Math.round(clampPct(value) * 10) / 10;
}

// 분자/분모 → 백분율 (분모 0 가드 + 클램프 일체화).
// fractionDigits: 0이면 정수, 1이면 소수 1자리.
export function ratioPct(numerator: number, denominator: number, fractionDigits: 0 | 1 = 0): number {
  if (!denominator || denominator <= 0) return 0;
  const raw = (numerator / denominator) * 100;
  return fractionDigits === 0 ? Math.round(clampPct(raw)) : Math.round(clampPct(raw) * 10) / 10;
}

// 음수 차단 (count·duration 같이 ≥0 인 값).
export function clampNonNeg(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, value);
}
