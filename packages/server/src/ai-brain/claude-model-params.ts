// 모델별 파라미터 호환성 헬퍼
// Opus 4.7+/Fable 5 는 sampling 파라미터(temperature/top_p/top_k)와
// thinking:{type:'enabled',budget_tokens} 를 제거 → 전송 시 400.
// 라이브 스모크테스트(2026-06-14)로 확인:
//   opus-4-8 + temperature → 400, opus-4-8 + adaptive → 200, sonnet-4-6 + temperature → 200.

/** Opus 4.7/4.8/4.9, Fable 등 sampling 파라미터를 거부하는 모델인가 */
export function isSamplingForbidden(model: string): boolean {
  return /opus-4-[789]|fable/i.test(model);
}

/**
 * 모델에 맞는 temperature 파라미터 조각을 반환.
 * sampling 금지 모델이면 빈 객체(스프레드 시 temperature 미포함 → 400 방지),
 * 허용 모델이면 { temperature }.
 */
export function temperatureParam(model: string, temperature: number): { temperature?: number } {
  return isSamplingForbidden(model) ? {} : { temperature };
}
