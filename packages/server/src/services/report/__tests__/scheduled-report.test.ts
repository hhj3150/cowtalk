// 정기 발송의 계약을 고정한다: 한 기간에 한 통, 실패는 원장에 남고, 테스트모드는 숨기지 않는다.
// DB·메일은 스텁 — 여기서 검증하는 것은 흐름 제어이지 SQL 이 아니다.

import { describe, it, expect, vi, beforeEach } from 'vitest';

interface QueryStub {
  [key: string]: unknown;
}

/** 드리즐 체이닝 흉내 — 어떤 메서드를 호출해도 자기 자신을 돌려주고, await 하면 준비된 결과를 준다 */
function queryStub(result: unknown): QueryStub {
  const obj: QueryStub = {};
  const methods = [
    'from', 'innerJoin', 'leftJoin', 'where', 'groupBy', 'orderBy', 'limit',
    'values', 'set', 'returning', 'onConflictDoUpdate', 'onConflictDoNothing',
  ];
  for (const m of methods) obj[m] = () => obj;
  obj['then'] = (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
    Promise.resolve(result).then(resolve, reject);
  return obj;
}

const selectResults: unknown[][] = [];
const inserted: Record<string, unknown>[] = [];
const updated: Record<string, unknown>[] = [];

const db = {
  select: vi.fn(() => queryStub(selectResults.shift() ?? [])),
  insert: vi.fn(() => ({
    values: (v: Record<string, unknown>) => {
      inserted.push(v);
      return Promise.resolve([v]);
    },
  })),
  update: vi.fn(() => ({
    set: (v: Record<string, unknown>) => {
      updated.push(v);
      return { where: () => Promise.resolve([v]) };
    },
  })),
};

vi.mock('../../../config/database.js', () => ({ getDb: () => db }));
vi.mock('../../../lib/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const sendMail = vi.fn();
vi.mock('../../../lib/mailer.js', async () => {
  const actual = await vi.importActual<typeof import('../../../lib/mailer.js')>('../../../lib/mailer.js');
  return {
    ...actual,
    isMailConfigured: () => false,
    sendMail: (...args: unknown[]) => sendMail(...args) as unknown,
  };
});

const buildPeriodReport = vi.fn();
vi.mock('../period-report.service.js', () => ({
  buildPeriodReport: (...args: unknown[]) => buildPeriodReport(...args) as unknown,
}));

vi.mock('../generators/xlsxGenerator.js', () => ({ generateXlsx: vi.fn(() => Promise.resolve()) }));

import { deliverReport, type ReportSchedule } from '../scheduled-report.service.js';

const REPORT = {
  farmId: 'farm-1',
  farmName: '술탄목장',
  periodTitle: '8월 3주차 주간',
  summary: { totalAnimals: 245, sensorAttached: 240, totalAlerts: 10, alertsByType: [] },
  breeding: {
    conceptionRate: null, conceptionRateDisplay: '—', conceptionRateStatus: 'data_insufficient',
    avgDaysOpen: 0, calvingInterval: 0, estrusDetectionRate: 0, inseminationCount: 0, conceptionPerService: 0,
  },
  health: { diseaseByType: [], mortalityCount: 0, cullingCount: 0 },
  sensor: { sensorCoverage: 98, alertAccuracy: null, alertAccuracyLabels: 0, installedInPeriod: 45, newSensorAnimalsInPeriod: 0, activeDevices: 240 },
  performance: {
    earlyDetection: { healthAlertCount: 0, ackedCount: 0, treatmentCount: 0 },
    decisionsCompleted: 0,
    milk: {
      recordedDays: 0, animalsWithRecords: 0, totalYieldL: 0, avgYieldPerRecordL: null,
      avgFatPct: null, avgProteinPct: null, avgLactosePct: null, avgSccThousand: null, source: 'individual',
    },
    economics: null,
  },
  aiComment: '보고서 코멘트',
};

function schedule(overrides: Partial<ReportSchedule> = {}): ReportSchedule {
  return {
    scheduleId: 'sched-1',
    farmId: 'farm-1',
    kind: 'weekly',
    recipients: ['hhj3150@hanmail.net'],
    format: 'xlsx',
    sendHourKst: 7,
    enabled: true,
    lastPeriodKey: null,
    lastSentAt: null,
    createdBy: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as ReportSchedule;
}

const NOW = new Date('2026-08-24T00:00:00Z'); // KST 월요일 09시

beforeEach(() => {
  selectResults.length = 0;
  inserted.length = 0;
  updated.length = 0;
  sendMail.mockReset();
  buildPeriodReport.mockReset();
  buildPeriodReport.mockResolvedValue(REPORT);
});

describe('deliverReport', () => {
  it('수신자가 없으면 아무것도 보내지 않고 건너뛴다', async () => {
    const result = await deliverReport(schedule({ recipients: [] }), NOW);
    expect(result.status).toBe('skipped');
    expect(result.reason).toBe('수신자 없음');
    expect(sendMail).not.toHaveBeenCalled();
    expect(inserted).toHaveLength(0);
  });

  it('불량 주소만 있으면 발송 시도조차 하지 않는다', async () => {
    const result = await deliverReport(schedule({ recipients: ['hhj3150@hanmail'] as unknown as string[] }), NOW);
    expect(result.status).toBe('skipped');
    expect(sendMail).not.toHaveBeenCalled();
  });

  it('같은 기간에 이미 성공했으면 다시 만들지 않는다 (멱등)', async () => {
    selectResults.push([{ status: 'sent', cnt: 1 }]);
    const result = await deliverReport(schedule(), NOW);
    expect(result.status).toBe('skipped');
    expect(result.reason).toBe('이미 발송됨');
    expect(buildPeriodReport).not.toHaveBeenCalled();
  });

  it('같은 기간 실패가 3회 쌓이면 멈춘다 (15분마다 영원히 실패하지 않게)', async () => {
    selectResults.push([{ status: 'failed', cnt: 3 }]);
    const result = await deliverReport(schedule(), NOW);
    expect(result.status).toBe('skipped');
    expect(result.reason).toContain('재시도 횟수 소진');
  });

  it('실패가 아직 3회 미만이면 재시도한다', async () => {
    selectResults.push([{ status: 'failed', cnt: 2 }]);
    sendMail.mockResolvedValue({ success: true, testMode: false, messageId: 'id-1' });
    const result = await deliverReport(schedule(), NOW);
    expect(result.status).toBe('sent');
    expect(sendMail).toHaveBeenCalledTimes(1);
  });

  it('발송 성공 — 원장에 남기고 스케줄의 마지막 기간을 갱신한다', async () => {
    selectResults.push([]); // alreadyHandled: 이력 없음
    sendMail.mockResolvedValue({ success: true, testMode: false, messageId: 'id-1' });

    const result = await deliverReport(schedule(), NOW);

    expect(result.status).toBe('sent');
    expect(result.periodKey).toBe('weekly:2026-W34');
    expect(result.attachmentName).toContain('.xlsx');

    const mailArg = sendMail.mock.calls[0]![0] as { to: string[]; subject: string; attachments?: unknown[] };
    expect(mailArg.to).toEqual(['hhj3150@hanmail.net']);
    expect(mailArg.subject).toContain('술탄목장 주간 보고서');
    expect(mailArg.attachments).toHaveLength(1);

    expect(inserted[0]).toMatchObject({
      status: 'sent',
      periodKey: 'weekly:2026-W34',
      manual: false,
      testMode: false,
    });
    // 핵심 수치 스냅샷이 함께 남는다 (메일이 지워져도 근거가 남게)
    expect((inserted[0]!['summary'] as { installedInPeriod: number }).installedInPeriod).toBe(45);
    expect(updated[0]).toMatchObject({ lastPeriodKey: 'weekly:2026-W34' });
  });

  it('SMTP 미설정이면 성공으로 보고하되 원장에 testMode 로 남긴다 (보냈다고 속이지 않는다)', async () => {
    selectResults.push([]);
    sendMail.mockResolvedValue({ success: true, testMode: true });

    const result = await deliverReport(schedule(), NOW);

    expect(result.status).toBe('sent');
    expect(result.testMode).toBe(true);
    expect(inserted[0]).toMatchObject({ testMode: true, status: 'sent' });
  });

  it('발송 실패는 사유와 함께 원장에 남고 스케줄은 갱신하지 않는다', async () => {
    selectResults.push([]);
    sendMail.mockResolvedValue({ success: false, testMode: false, error: 'SMTP 535' });

    const result = await deliverReport(schedule(), NOW);

    expect(result.status).toBe('failed');
    expect(inserted[0]).toMatchObject({ status: 'failed', errorMessage: 'SMTP 535' });
    expect(updated).toHaveLength(0);
  });

  it('보고서 생성이 터져도 예외를 밖으로 던지지 않고 실패로 기록한다 (한 목장 실패가 배치를 멈추지 않게)', async () => {
    selectResults.push([]);
    buildPeriodReport.mockRejectedValue(new Error('DB timeout'));

    const result = await deliverReport(schedule(), NOW);

    expect(result.status).toBe('failed');
    expect(result.reason).toBe('DB timeout');
    expect(inserted[0]).toMatchObject({ status: 'failed', errorMessage: 'DB timeout' });
  });

  it('수동 발송은 기간 멱등을 건너뛰고 manual 로 기록된다', async () => {
    sendMail.mockResolvedValue({ success: true, testMode: false, messageId: 'id-2' });

    const result = await deliverReport(schedule({ lastPeriodKey: 'weekly:2026-W34' }), NOW, { manual: true });

    expect(result.status).toBe('sent');
    expect(inserted[0]).toMatchObject({ manual: true });
    // 수동 발송은 정기 발송의 '마지막 기간'을 덮어쓰지 않는다
    expect(updated).toHaveLength(0);
  });

  it('첨부 없이(none) 구독하면 본문만 보낸다', async () => {
    selectResults.push([]);
    sendMail.mockResolvedValue({ success: true, testMode: false });

    await deliverReport(schedule({ format: 'none' }), NOW);

    const mailArg = sendMail.mock.calls[0]![0] as { attachments?: unknown[] };
    expect(mailArg.attachments).toBeUndefined();
  });

  it('성과 보고서는 누적 구간까지 집계한다 (이번 기간·직전 기간·누적 = 3회)', async () => {
    selectResults.push([]);            // alreadyHandled
    selectResults.push([{ first: new Date('2026-07-01T00:00:00Z') }]); // 파일럿 시작일
    sendMail.mockResolvedValue({ success: true, testMode: false });

    const result = await deliverReport(schedule({ kind: 'performance' }), NOW);

    expect(result.periodKey).toBe('performance:2026-07');
    expect(buildPeriodReport).toHaveBeenCalledTimes(3);
  });
});
