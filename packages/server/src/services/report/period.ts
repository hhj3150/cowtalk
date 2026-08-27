// 정기 보고서 기간 계산 — 전부 순수 함수 (DB·시계 의존 없음, 테스트로 고정)
//
// 원칙:
// 1) 기준 시간대는 KST 고정. 목장주가 "지난주"라고 할 때의 지난주는 한국 시간의 월~일이다.
//    (UTC 기준으로 자르면 월요일 오전 9시 이전 이벤트가 지난주로 새어 나간다)
// 2) 보고 대상은 **끝난 기간**만. 진행 중인 주/월을 보고하면 "이번 주 유량이 반토막"처럼
//    항상 나쁘게 보인다 — 기간이 닫힌 뒤에 보고한다.
// 3) periodKey 가 멱등의 축이다. 같은 (스케줄, periodKey) 는 한 번만 발송된다 —
//    서버가 재시작하든 15분 주기 잡이 몇 번 깨어나든 메일은 한 통.
// 4) 발송이 밀려도(서버 정지·SMTP 장애) 다음 깨어남에 그대로 나간다:
//    "월요일 07시에만 발송"이 아니라 "기간이 닫혔고 아직 안 보냈으면 발송".

export type ReportPeriodKind = 'weekly' | 'monthly' | 'quarterly' | 'performance';

export const REPORT_PERIOD_KINDS: readonly ReportPeriodKind[] = [
  'weekly',
  'monthly',
  'quarterly',
  'performance',
] as const;

export const PERIOD_KIND_LABELS: Readonly<Record<ReportPeriodKind, string>> = {
  weekly: '주간',
  monthly: '월간',
  quarterly: '분기',
  performance: '성과',
};

export interface PeriodRange {
  readonly kind: ReportPeriodKind;
  /** 기간 시작 (포함) — UTC 인스턴트, KST 자정에 해당 */
  readonly start: Date;
  /** 기간 끝 (미포함) */
  readonly end: Date;
  /** 멱등 키 — weekly:2026-W35 / monthly:2026-08 / quarterly:2026-Q3 / performance:2026-08 */
  readonly periodKey: string;
  /** 사람이 읽는 기간 표기 — "2026-08-17 ~ 2026-08-23" */
  readonly label: string;
  /** 제목용 짧은 표기 — "2026년 8월", "2026년 3분기", "8월 3주" */
  readonly title: string;
  /** 직전 동일 길이 기간 (증감 비교용) */
  readonly previous: { readonly start: Date; readonly end: Date; readonly title: string };
}

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
const DAY_MS = 86_400_000;

export interface KstParts {
  readonly year: number;
  /** 1~12 */
  readonly month: number;
  /** 1~31 */
  readonly day: number;
  /** 0~23 */
  readonly hour: number;
  /** 0=일 … 6=토 */
  readonly weekday: number;
}

/** UTC 인스턴트 → KST 달력 값 */
export function kstParts(at: Date): KstParts {
  const k = new Date(at.getTime() + KST_OFFSET_MS);
  return {
    year: k.getUTCFullYear(),
    month: k.getUTCMonth() + 1,
    day: k.getUTCDate(),
    hour: k.getUTCHours(),
    weekday: k.getUTCDay(),
  };
}

/** KST 달력 값 → UTC 인스턴트 */
export function kstDate(year: number, month: number, day: number, hour = 0): Date {
  return new Date(Date.UTC(year, month - 1, day, hour) - KST_OFFSET_MS);
}

/** KST 날짜 문자열 (YYYY-MM-DD) */
export function kstDateStr(at: Date): string {
  const p = kstParts(at);
  return `${String(p.year)}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`;
}

/** 그 시각이 속한 KST 주의 월요일 00:00 (KST) */
export function kstWeekStart(at: Date): Date {
  const p = kstParts(at);
  const midnight = kstDate(p.year, p.month, p.day);
  // 일요일(0)은 그 주의 7일째 → 6일 전이 월요일
  const backDays = (p.weekday + 6) % 7;
  return new Date(midnight.getTime() - backDays * DAY_MS);
}

/** ISO 8601 주차 (월요일 시작, 목요일이 속한 해가 그 주의 해) */
export function isoWeek(at: Date): { readonly year: number; readonly week: number } {
  const monday = kstWeekStart(at);
  // 그 주의 목요일이 속한 연도가 ISO 연도
  const thursday = new Date(monday.getTime() + 3 * DAY_MS);
  const tp = kstParts(thursday);
  const jan1 = kstDate(tp.year, 1, 1);
  const jan1Monday = kstWeekStart(jan1);
  const week = Math.round((monday.getTime() - jan1Monday.getTime()) / (7 * DAY_MS)) + 1;
  return { year: tp.year, week };
}

/** 그 달의 몇 번째 주인가 (1~5) — 제목 표기용 */
function weekOfMonth(monday: Date): number {
  const p = kstParts(monday);
  return Math.floor((p.day - 1) / 7) + 1;
}

function rangeLabel(start: Date, end: Date): string {
  const last = new Date(end.getTime() - DAY_MS);
  return `${kstDateStr(start)} ~ ${kstDateStr(last)}`;
}

function monthTitle(year: number, month: number): string {
  return `${String(year)}년 ${String(month)}월`;
}

function quarterOf(month: number): number {
  return Math.floor((month - 1) / 3) + 1;
}

/**
 * 지금(now) 기준으로 보고 대상이 되는 **직전 완결 기간**을 계산한다.
 *
 * - weekly      직전 월~일 (KST)
 * - monthly     직전 달 1일~말일
 * - quarterly   직전 분기 (1~3 / 4~6 / 7~9 / 10~12월)
 * - performance 직전 달 (누적 성과는 보고서 본문에서 별도로 다루고, 발송 주기는 월 단위)
 */
export function resolvePeriod(kind: ReportPeriodKind, now: Date): PeriodRange {
  switch (kind) {
    case 'weekly': {
      const thisWeekMonday = kstWeekStart(now);
      const start = new Date(thisWeekMonday.getTime() - 7 * DAY_MS);
      const end = thisWeekMonday;
      const { year, week } = isoWeek(start);
      const sp = kstParts(start);
      return {
        kind,
        start,
        end,
        periodKey: `weekly:${String(year)}-W${String(week).padStart(2, '0')}`,
        label: rangeLabel(start, end),
        title: `${String(sp.month)}월 ${String(weekOfMonth(start))}주차`,
        previous: {
          start: new Date(start.getTime() - 7 * DAY_MS),
          end: start,
          title: '직전 주',
        },
      };
    }
    case 'monthly':
    case 'performance': {
      const p = kstParts(now);
      const y = p.month === 1 ? p.year - 1 : p.year;
      const m = p.month === 1 ? 12 : p.month - 1;
      const start = kstDate(y, m, 1);
      const end = kstDate(m === 12 ? y + 1 : y, m === 12 ? 1 : m + 1, 1);
      const py = m === 1 ? y - 1 : y;
      const pm = m === 1 ? 12 : m - 1;
      const key = `${String(y)}-${String(m).padStart(2, '0')}`;
      return {
        kind,
        start,
        end,
        periodKey: `${kind}:${key}`,
        label: rangeLabel(start, end),
        title: monthTitle(y, m),
        previous: { start: kstDate(py, pm, 1), end: start, title: monthTitle(py, pm) },
      };
    }
    case 'quarterly': {
      const p = kstParts(now);
      const currentQuarterStartMonth = (quarterOf(p.month) - 1) * 3 + 1;
      const startMonth = currentQuarterStartMonth === 1 ? 10 : currentQuarterStartMonth - 3;
      const year = currentQuarterStartMonth === 1 ? p.year - 1 : p.year;
      const start = kstDate(year, startMonth, 1);
      const end = kstDate(startMonth === 10 ? year + 1 : year, startMonth === 10 ? 1 : startMonth + 3, 1);
      const q = quarterOf(startMonth);
      const prevStartMonth = startMonth === 1 ? 10 : startMonth - 3;
      const prevYear = startMonth === 1 ? year - 1 : year;
      return {
        kind,
        start,
        end,
        periodKey: `quarterly:${String(year)}-Q${String(q)}`,
        label: rangeLabel(start, end),
        title: `${String(year)}년 ${String(q)}분기`,
        previous: {
          start: kstDate(prevYear, prevStartMonth, 1),
          end: start,
          title: `${String(prevYear)}년 ${String(quarterOf(prevStartMonth))}분기`,
        },
      };
    }
  }
}

/**
 * 발송 대상 판정 (순수).
 *
 * 기간이 닫혔고(resolvePeriod가 이미 직전 완결 기간을 준다) 발송 시각(KST sendHour)이 지났으며
 * 그 periodKey 를 아직 보내지 않았으면 발송한다. "월요일 07시 정각"에 매이지 않으므로
 * 서버가 월요일 내내 꺼져 있었어도 화요일에 지난주 보고서가 나간다.
 */
export function isDue(
  period: PeriodRange,
  now: Date,
  sendHourKst: number,
  lastSentPeriodKey: string | null,
): boolean {
  if (lastSentPeriodKey === period.periodKey) return false;
  const p = kstParts(now);
  const today = kstDate(p.year, p.month, p.day);
  // 기간이 닫힌 날 이후라면 시각 조건 없이 발송 (밀린 보고서 회수)
  if (today.getTime() > period.end.getTime()) return true;
  return p.hour >= sendHourKst;
}

/** 성과 보고서의 누적 구간 시작 — 파일럿 시작일(없으면 기간 시작 12개월 전) */
export function cumulativeStart(period: PeriodRange, pilotStart: Date | null): Date {
  if (pilotStart && pilotStart.getTime() < period.end.getTime()) return pilotStart;
  const p = kstParts(period.start);
  return kstDate(p.year - 1, p.month, 1);
}
