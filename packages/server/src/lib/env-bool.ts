// 불리언 환경변수 파서
//
// ⚠️ zod 의 z.coerce.boolean() 을 쓰면 안 된다: 내부적으로 Boolean(value) 라서
// 문자열 "false" 가 true 가 된다. 환경변수는 언제나 문자열이므로
// `EMAIL_TEST_MODE=false` 가 조용히 "테스트 모드 ON"이 되고,
// `KAKAO_ALIMTALK_TEST_MODE=false` 로는 알림톡 실발송으로 영영 전환되지 않는다.
// (실제로 이 파서를 넣기 전 SMTP_SECURE=false 가 true 로 읽혀 종단 테스트에서
//  메일 발송이 전부 ESOCKET 으로 실패했다 — 스위치가 반대로 붙어 있었다)

const TRUE_VALUES: readonly string[] = ['1', 'true', 'yes', 'y', 'on'];
const FALSE_VALUES: readonly string[] = ['0', 'false', 'no', 'n', 'off'];

/**
 * 환경변수 문자열 → boolean (순수).
 * 알 수 없는 값은 기본값으로 떨어뜨린다 — 오타 하나로 스위치가 반대로 붙는 것보다,
 * 문서화된 기본값으로 도는 편이 안전하다.
 */
export function parseBoolEnv(raw: unknown, defaultValue: boolean): boolean {
  if (raw === undefined || raw === null) return defaultValue;
  if (typeof raw === 'boolean') return raw;
  const value = String(raw).trim().toLowerCase();
  if (value === '') return defaultValue;
  if (TRUE_VALUES.includes(value)) return true;
  if (FALSE_VALUES.includes(value)) return false;
  return defaultValue;
}
