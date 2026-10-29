// smaXtec 시각 파싱 — 타임존 표기 없는 문자열은 목장 현지(KST) 벽시계 시각으로 해석
//
// 배경 (2026-10-29 운영 장애): smaXtec event_ts 가 "2026-10-29T10:51:41" 처럼 타임존 없이 오면
// `new Date()` 는 서버 로컬(Railway = UTC)로 해석한다 → KST 10:51 이 UTC 10:51 로 저장되어 +9h 미래 시각.
// 결과: health 의 last event 가 미래, 수정 적기 계산이 9시간 지연.
//
// 규칙:
//   - Z / ±hh:mm / ±hhmm / ±hh 표기가 있으면 그대로 신뢰
//   - 표기 없는 ISO 형태(날짜만, 날짜+시각)는 KST(+09:00)로 해석 — 한국은 서머타임 없음
//   - 해석 불가면 null (호출부가 폴백 결정)

/** smaXtec 목장 기본 타임존 오프셋 (커넥터가 모든 org 를 Asia/Seoul 로 취급) */
export const SMAXTEC_DEFAULT_UTC_OFFSET = '+09:00';

const HAS_TZ_DESIGNATOR = /(?:Z|[+-]\d{2}(?::?\d{2})?)$/i;
const NAIVE_ISO = /^(\d{4}-\d{2}-\d{2})(?:[T ](\d{2}:\d{2}(?::\d{2}(?:\.\d{1,9})?)?))?$/;

/** 타임존 표기가 없는 ISO 형태 문자열인가 (보정 스크립트·테스트 공용) */
export function isNaiveIsoTimestamp(value: string): boolean {
  return NAIVE_ISO.test(value.trim());
}

export function parseSmaxtecTimestamp(
  value: string | null | undefined,
  utcOffset: string = SMAXTEC_DEFAULT_UTC_OFFSET,
): Date | null {
  if (value == null) return null;
  const s = value.trim();
  if (s === '') return null;

  const naive = NAIVE_ISO.exec(s);
  if (naive) {
    const datePart = naive[1];
    const timePart = naive[2] ?? '00:00:00';
    const d = new Date(`${datePart}T${timePart}${utcOffset}`);
    return isNaN(d.getTime()) ? null : d;
  }

  // 날짜 뒤에 타임존 표기가 있는 경우만 그대로 신뢰 (그 외 형식도 Date 가 해석하면 수용)
  const d = new Date(s);
  if (isNaN(d.getTime())) return null;
  if (!HAS_TZ_DESIGNATOR.test(s) && /^\d{4}-\d{2}-\d{2}/.test(s)) {
    // ISO 비슷하지만 위 패턴에 안 맞는 표기 (예: 마이크로초 초과 자릿수) — 서버 로컬 해석은 위험하므로 거부
    return null;
  }
  return d;
}
