import { describe, it, expect } from 'vitest';
import {
  buildAttachmentName,
  buildMetricRows,
  buildReportSheets,
  buildReportSubject,
  fmtDelta,
  fmtInt,
  fmtKrw,
  fmtPct,
  renderReportEmail,
  snapshotMetrics,
} from '../report-email.js';
import { resolvePeriod } from '../period.js';
import type { PeriodReport } from '../period-report.service.js';

function makeReport(overrides: Partial<PeriodReport> = {}): PeriodReport {
  const base: PeriodReport = {
    farmId: 'farm-1',
    farmName: '술탄목장',
    periodTitle: '8월 3주차 주간',
    summary: {
      totalAnimals: 245,
      sensorAttached: 240,
      totalAlerts: 132,
      alertsByType: [
        { type: 'estrus', label: '발정', count: 48 },
        { type: 'health_warning', label: '건강 경고', count: 30 },
        { type: 'rumination_warning', label: '반추 이상', count: 20 },
        { type: 'temperature_high', label: '고체온', count: 18 },
        { type: 'activity_decrease', label: '활동량 저하', count: 10 },
        { type: 'management', label: '관리', count: 6 },
      ],
    },
    breeding: {
      conceptionRate: 52.5,
      conceptionRateDisplay: '52.5%',
      conceptionRateStatus: 'ok',
      avgDaysOpen: 0,
      calvingInterval: 0,
      estrusDetectionRate: 71,
      inseminationCount: 24,
      conceptionPerService: 0,
    },
    health: {
      diseaseByType: [
        { type: '건강경고', count: 30 },
        { type: '반추이상', count: 20 },
      ],
      mortalityCount: 0,
      cullingCount: 0,
    },
    sensor: {
      sensorCoverage: 98,
      alertAccuracy: 88,
      alertAccuracyLabels: 24,
      installedInPeriod: 45,
      newSensorAnimalsInPeriod: 0,
      activeDevices: 240,
    },
    performance: {
      earlyDetection: { healthAlertCount: 50, ackedCount: 38, treatmentCount: 12 },
      decisionsCompleted: 21,
      milk: {
        recordedDays: 7,
        animalsWithRecords: 180,
        totalYieldL: 42_000,
        avgYieldPerRecordL: 33.3,
        avgFatPct: 4.1,
        avgProteinPct: 3.3,
        avgLactosePct: 4.8,
        avgSccThousand: 180,
        source: 'individual',
      },
      economics: {
        milkRevenueEstimateKrw: 45_360_000,
        priceKrwPerL: 1080,
        priceFormula: '기본가 1,000원 + 유지방 가감',
        feedCostPerHeadDayKrw: 12_000,
        marginPerHeadDayKrw: 23_964,
        estimated: true,
      },
    },
    aiComment: '술탄목장 8월 3주차 보고서입니다.',
  };
  return { ...base, ...overrides };
}

describe('숫자 포맷 — 없는 값은 0이 아니라 "없음"', () => {
  it('null 은 0으로 둔갑하지 않는다', () => {
    expect(fmtInt(null, '건')).toBe('기록 없음');
    expect(fmtKrw(null)).toBe('기록 없음');
    expect(fmtPct(null)).toBe('집계 불가');
    expect(fmtInt(0, '건')).toBe('0건');
  });

  it('천단위 구분과 단위를 붙인다', () => {
    expect(fmtInt(42000, 'L')).toBe('42,000L');
    expect(fmtKrw(23964)).toBe('23,964원');
    expect(fmtPct(52.53)).toBe('52.5%');
  });
});

describe('fmtDelta — 방향만 말하고 좋다/나쁘다를 판정하지 않는다', () => {
  it('직전 값이 없으면 비교하지 않는다', () => {
    expect(fmtDelta(100, null, '건')).toBe('—');
    expect(fmtDelta(null, 100, '건')).toBe('—');
  });

  it('증가·감소·동일', () => {
    expect(fmtDelta(132, 120, '건')).toBe('▲ 12건 (+10%)');
    expect(fmtDelta(108, 120, '건')).toBe('▼ 12건 (-10%)');
    expect(fmtDelta(120, 120, '건')).toBe('변화 없음');
  });

  it('직전이 0이면 백분율을 만들지 않는다 (0으로 나누기 금지)', () => {
    expect(fmtDelta(5, 0, '건')).toBe('▲ 5건');
  });
});

describe('snapshotMetrics', () => {
  it('보고서에서 비교·저장용 수치를 뽑는다', () => {
    const m = snapshotMetrics(makeReport());
    expect(m.totalAlerts).toBe(132);
    expect(m.healthAlerts).toBe(50); // diseaseByType 합계 (30+20)
    expect(m.installedInPeriod).toBe(45);
    expect(m.marginPerHeadDayKrw).toBe(23_964);
  });

  it('유량·경제 기록이 없으면 null 로 남는다', () => {
    const bare = makeReport({
      performance: {
        earlyDetection: { healthAlertCount: 0, ackedCount: 0, treatmentCount: 0 },
        decisionsCompleted: 0,
        milk: {
          recordedDays: 0, animalsWithRecords: 0, totalYieldL: 0, avgYieldPerRecordL: null,
          avgFatPct: null, avgProteinPct: null, avgLactosePct: null, avgSccThousand: null,
          source: 'individual',
        },
        economics: null,
      },
    });
    const m = snapshotMetrics(bare);
    expect(m.marginPerHeadDayKrw).toBeNull();
    expect(m.milkRevenueKrw).toBeNull();
    expect(m.milkTotalL).toBe(0);
  });
});

describe('buildMetricRows', () => {
  it('신규 센서 삽입이 있으면 비고에 드러난다 (증두가 묻히지 않게)', () => {
    const rows = buildMetricRows(snapshotMetrics(makeReport()), null);
    expect(rows.find((r) => r.label === '센서 장착')?.note).toBe('이 기간 신규 삽입 45두');
  });

  it('삽입일 기록이 없으면 신규 등록(센서 보유) 두수로 대신 말한다 — 합치지 않는다', () => {
    const r = makeReport();
    const viaSync = makeReport({
      sensor: { ...r.sensor, installedInPeriod: 0, newSensorAnimalsInPeriod: 45 },
    });
    const rows = buildMetricRows(snapshotMetrics(viaSync), null);
    expect(rows.find((row) => row.label === '센서 장착')?.note).toBe('이 기간 신규 등록(센서 보유) 45두');
  });

  it('센서 증가가 없으면 비고를 만들지 않는다', () => {
    const r = makeReport();
    const flat = makeReport({ sensor: { ...r.sensor, installedInPeriod: 0, newSensorAnimalsInPeriod: 0 } });
    expect(buildMetricRows(snapshotMetrics(flat), null).find((row) => row.label === '센서 장착')?.note).toBeUndefined();
  });

  it('유량 기록이 없으면 다음 행동을 알려준다', () => {
    const r = makeReport();
    const bare = makeReport({
      performance: {
        ...r.performance,
        milk: { ...r.performance.milk, totalYieldL: 0, avgYieldPerRecordL: null },
        economics: null,
      },
    });
    const rows = buildMetricRows(snapshotMetrics(bare), null);
    expect(rows.find((row) => row.label === '총 유량')?.value).toBe('기록 없음');
    expect(rows.find((row) => row.label === '총 유량')?.note).toContain('/milk-entry');
    expect(rows.find((row) => row.label === '두당 일 마진')?.note).toContain('배합비');
  });

  it('직전 기간이 있으면 증감이 채워진다', () => {
    const cur = makeReport();
    const prev = makeReport({ summary: { ...cur.summary, totalAlerts: 120 } });
    const rows = buildMetricRows(snapshotMetrics(cur), snapshotMetrics(prev));
    expect(rows.find((r) => r.label === '전체 알림')?.delta).toBe('▲ 12건 (+10%)');
  });
});

describe('renderReportEmail', () => {
  const period = resolvePeriod('weekly', new Date('2026-08-24T00:00:00Z'));

  it('제목에 목장·주기·기간이 모두 담긴다', () => {
    expect(buildReportSubject('술탄목장', period)).toBe(
      '[CowTalk] 술탄목장 주간 보고서 — 8월 3주차 (2026-08-17 ~ 2026-08-23)',
    );
  });

  it('HTML·텍스트 두 형식을 만들고 핵심 수치를 담는다', () => {
    const r = renderReportEmail({
      farmName: '술탄목장',
      period,
      current: makeReport(),
      previous: null,
      cumulative: null,
    });
    expect(r.html).toContain('술탄목장');
    expect(r.html).toContain('신규 삽입 45두');
    expect(r.text).toContain('전체 알림: 132건');
    expect(r.text).toContain('두당 일 마진: 23,964원');
    expect(r.text).toContain('임상 판단을 대체하지 않습니다');
  });

  it('HTML 이스케이프 — 목장명·코멘트의 태그가 본문을 깨지 않는다', () => {
    const r = renderReportEmail({
      farmName: '<script>x</script>목장',
      period,
      current: makeReport({ aiComment: 'a < b & "c"' }),
      previous: null,
      cumulative: null,
    });
    expect(r.html).not.toContain('<script>');
    expect(r.html).toContain('&lt;script&gt;');
    expect(r.html).toContain('a &lt; b &amp; &quot;c&quot;');
  });

  it('성과 보고서는 누적 구간 블록을 덧붙인다', () => {
    const r = renderReportEmail({
      farmName: '술탄목장',
      period: resolvePeriod('performance', new Date('2026-08-24T00:00:00Z')),
      current: makeReport(),
      previous: makeReport(),
      cumulative: { report: makeReport(), label: '2026-07-01 ~ 2026-07-31' },
    });
    expect(r.html).toContain('파일럿 누적 성과');
    expect(r.text).toContain('누적 조치 완료: 21건');
  });
});

describe('buildReportSheets / 첨부 파일명', () => {
  const period = resolvePeriod('monthly', new Date('2026-08-24T00:00:00Z'));

  it('엑셀 시트는 기존 xlsxGenerator 계약({title, sheets})을 따른다', () => {
    const content = buildReportSheets({
      farmName: '술탄목장',
      period,
      current: makeReport(),
      previous: null,
      cumulative: null,
    });
    expect(content.title).toContain('술탄목장');
    expect(content.sheets.map((s) => s.name)).toEqual(['핵심지표', '알림유형', '건강이벤트', '기간정보']);
    expect(content.sheets[0]!.rows.length).toBeGreaterThan(5);
  });

  it('성과 보고서에는 누적성과 시트가 추가된다', () => {
    const content = buildReportSheets({
      farmName: '술탄목장',
      period: resolvePeriod('performance', new Date('2026-08-24T00:00:00Z')),
      current: makeReport(),
      previous: null,
      cumulative: { report: makeReport(), label: '2026-01-01 ~ 2026-07-31' },
    });
    expect(content.sheets.map((s) => s.name)).toContain('누적성과');
  });

  it('파일명은 경로·공백 없이 안전하게 만든다', () => {
    expect(buildAttachmentName('술탄 목장/A', 'weekly', 'weekly:2026-W34')).toBe(
      'cowtalk_술탄_목장_A_weekly_weekly_2026-W34.xlsx',
    );
  });
});
