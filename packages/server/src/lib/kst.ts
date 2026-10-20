// 한국 시간(KST, UTC+9, 일광절약 없음) 날짜 유틸 — DI-11
//
// 서버는 UTC 로 돈다. new Date().toISOString().slice(0, 10) 은 UTC 날짜라
// 한국 시각 00~09시에는 '어제'가 된다 (유량 기본 날짜·오늘 처치 목록·알림 중복키가 하루 어긋났다).

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

/** 순간(instant)의 KST 달력 날짜 YYYY-MM-DD */
export function kstDateString(instant: Date): string {
  return new Date(instant.getTime() + KST_OFFSET_MS).toISOString().slice(0, 10);
}

/** 지금의 KST 날짜 YYYY-MM-DD */
export function kstToday(now: Date = new Date()): string {
  return kstDateString(now);
}
