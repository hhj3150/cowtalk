// SovereignAlarm confidence 단위 변환 — BUG-005 / D4
//
// D4 규칙: 도메인 계층의 confidence 는 항상 0-1 float (canonical).
// SovereignAlarm rule 들은 내부적으로 0-100 점수 식으로 튜닝되어 있으므로,
// 출력(`confidence:` 필드)에서 이 함수로 0-1 로 변환한다.
//
// rule 내부 계산식(`60 + (tempAvg - 39.5) * 40` 등)은 그대로 두고,
// 최종 출력만 toConfidence01() 을 1회 통과시킨다 — 단일 변환 지점.

/**
 * 0-100 점수 → 0-1 confidence (D4 canonical).
 * NaN/Infinity → 0. 음수 → 0. 100 초과 → 1.
 */
export function toConfidence01(score100: number): number {
  if (!Number.isFinite(score100)) return 0;
  return Math.max(0, Math.min(1, score100 / 100));
}

/**
 * 이미 0-1 단위인 confidence 값을 [0,1] 로 clamp (보정 곱셈 후 안전장치).
 * NaN/Infinity → 0.
 */
export function clampConfidence01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}
