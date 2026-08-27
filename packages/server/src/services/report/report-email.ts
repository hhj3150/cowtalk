// 보고서 → 메일 본문·첨부 렌더링 (전부 순수 함수)
//
// 이 파일에 DB·네트워크가 없는 이유: 메일 문구는 목장주가 매주 실제로 읽는 것이라
// 회귀 테스트로 고정해야 한다. 숫자 포맷 하나가 깨지면 "이번 주 유량 0L" 같은
// 오해를 매주 배달하게 된다.
//
// 정직성 규칙:
// - 값이 없으면 0이 아니라 "기록 없음"으로 적는다 (수태율 null, 유량 미기록 등)
// - 증감은 직전 동일 길이 기간과만 비교한다 (주간↔주간, 월간↔월간)
// - 추정치는 항상 산식을 함께 적는다

import type { PeriodReport } from './period-report.service.js';
import { PERIOD_KIND_LABELS, type PeriodRange, type ReportPeriodKind } from './period.js';

export interface ReportMetrics {
  readonly totalAnimals: number;
  readonly sensorAttached: number;
  readonly sensorCoverage: number;
  readonly installedInPeriod: number;
  readonly newSensorAnimalsInPeriod: number;
  readonly totalAlerts: number;
  readonly healthAlerts: number;
  readonly ackedHealthAlerts: number;
  readonly treatments: number;
  readonly decisionsCompleted: number;
  readonly inseminations: number;
  readonly conceptionRatePct: number | null;
  readonly estrusDetectionRate: number;
  readonly milkTotalL: number;
  readonly avgYieldPerHeadL: number | null;
  readonly marginPerHeadDayKrw: number | null;
  readonly milkRevenueKrw: number | null;
  readonly alertAccuracy: number | null;
}

/** 보고서에서 비교·저장용 핵심 수치만 뽑는다 (발송 이력 summary 컬럼에도 그대로 들어간다) */
export function snapshotMetrics(report: PeriodReport): ReportMetrics {
  const healthAlerts = report.health.diseaseByType.reduce((s, d) => s + d.count, 0);
  return {
    totalAnimals: report.summary.totalAnimals,
    sensorAttached: report.summary.sensorAttached,
    sensorCoverage: report.sensor.sensorCoverage,
    installedInPeriod: report.sensor.installedInPeriod,
    newSensorAnimalsInPeriod: report.sensor.newSensorAnimalsInPeriod,
    totalAlerts: report.summary.totalAlerts,
    healthAlerts,
    ackedHealthAlerts: report.performance.earlyDetection.ackedCount,
    treatments: report.performance.earlyDetection.treatmentCount,
    decisionsCompleted: report.performance.decisionsCompleted,
    inseminations: report.breeding.inseminationCount,
    conceptionRatePct: report.breeding.conceptionRate,
    estrusDetectionRate: report.breeding.estrusDetectionRate,
    milkTotalL: report.performance.milk.totalYieldL,
    avgYieldPerHeadL: report.performance.milk.avgYieldPerRecordL,
    marginPerHeadDayKrw: report.performance.economics?.marginPerHeadDayKrw ?? null,
    milkRevenueKrw: report.performance.economics?.milkRevenueEstimateKrw ?? null,
    alertAccuracy: report.sensor.alertAccuracy,
  };
}

// ── 포맷 ──

export function fmtInt(value: number | null | undefined, unit = ''): string {
  if (value == null || !Number.isFinite(value)) return '기록 없음';
  return `${Math.round(value).toLocaleString('ko-KR')}${unit}`;
}

export function fmtNum(value: number | null | undefined, digits = 1, unit = ''): string {
  if (value == null || !Number.isFinite(value)) return '기록 없음';
  return `${value.toFixed(digits)}${unit}`;
}

export function fmtPct(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '집계 불가';
  return `${String(Math.round(value * 10) / 10)}%`;
}

export function fmtKrw(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '기록 없음';
  return `${Math.round(value).toLocaleString('ko-KR')}원`;
}

/**
 * 증감 표기 (순수). 직전 기간 값이 없으면 "—".
 * 방향만 적고 좋다/나쁘다는 판정하지 않는다 — 알림이 준 것이 개선인지 센서 고장인지는
 * 데이터만으로 알 수 없다.
 */
export function fmtDelta(current: number | null, previous: number | null, unit = ''): string {
  if (current == null || previous == null || !Number.isFinite(current) || !Number.isFinite(previous)) {
    return '—';
  }
  const diff = Math.round((current - previous) * 10) / 10;
  if (diff === 0) return '변화 없음';
  const arrow = diff > 0 ? '▲' : '▼';
  const abs = Math.abs(diff);
  const pct = previous !== 0 ? ` (${diff > 0 ? '+' : '-'}${String(Math.round((abs / Math.abs(previous)) * 100))}%)` : '';
  return `${arrow} ${abs.toLocaleString('ko-KR')}${unit}${pct}`;
}

/** 메일 제목 — 받은편지함에서 한 줄로 무슨 보고서인지 알 수 있게 */
export function buildReportSubject(farmName: string, period: PeriodRange): string {
  const kindLabel = PERIOD_KIND_LABELS[period.kind];
  return `[CowTalk] ${farmName} ${kindLabel} 보고서 — ${period.title} (${period.label})`;
}

// ── 본문 ──

/**
 * 센서 증가 표기 (순수). 삽입일이 기록된 볼루스가 우선, 없으면 신규 등록 개체 수로 말한다.
 * 두 수를 합치지 않는 이유: 무엇을 센 것인지 모르는 숫자는 보고서에서 최악이다.
 */
export function sensorGrowthNote(m: ReportMetrics): string | undefined {
  if (m.installedInPeriod > 0) return `이 기간 신규 삽입 ${String(m.installedInPeriod)}두`;
  if (m.newSensorAnimalsInPeriod > 0) {
    return `이 기간 신규 등록(센서 보유) ${String(m.newSensorAnimalsInPeriod)}두`;
  }
  return undefined;
}

interface Row {
  readonly label: string;
  readonly value: string;
  readonly delta: string;
  readonly note?: string;
}

/** 핵심 지표 표 구성 (순수) — HTML/텍스트/엑셀이 같은 행을 공유한다 */
export function buildMetricRows(current: ReportMetrics, previous: ReportMetrics | null): Row[] {
  const p = previous;
  return [
    { label: '사육 두수', value: fmtInt(current.totalAnimals, '두'), delta: fmtDelta(current.totalAnimals, p?.totalAnimals ?? null, '두') },
    {
      label: '센서 장착',
      value: `${fmtInt(current.sensorAttached, '두')} (커버리지 ${String(current.sensorCoverage)}%)`,
      delta: fmtDelta(current.sensorAttached, p?.sensorAttached ?? null, '두'),
      note: sensorGrowthNote(current),
    },
    { label: '전체 알림', value: fmtInt(current.totalAlerts, '건'), delta: fmtDelta(current.totalAlerts, p?.totalAlerts ?? null, '건') },
    {
      label: '건강 알림',
      value: fmtInt(current.healthAlerts, '건'),
      delta: fmtDelta(current.healthAlerts, p?.healthAlerts ?? null, '건'),
      note: `확인 ${String(current.ackedHealthAlerts)}건 · 치료 기록 ${String(current.treatments)}건`,
    },
    { label: '조치 완료', value: fmtInt(current.decisionsCompleted, '건'), delta: fmtDelta(current.decisionsCompleted, p?.decisionsCompleted ?? null, '건') },
    { label: '수정(AI) 건수', value: fmtInt(current.inseminations, '건'), delta: fmtDelta(current.inseminations, p?.inseminations ?? null, '건') },
    {
      label: '수태율',
      value: fmtPct(current.conceptionRatePct),
      delta: fmtDelta(current.conceptionRatePct, p?.conceptionRatePct ?? null, '%p'),
      note: current.conceptionRatePct == null ? '임신감정 기록이 쌓이면 집계됩니다' : undefined,
    },
    { label: '발정 감지율', value: fmtPct(current.estrusDetectionRate), delta: fmtDelta(current.estrusDetectionRate, p?.estrusDetectionRate ?? null, '%p') },
    {
      label: '총 유량',
      value: current.milkTotalL > 0 ? fmtInt(current.milkTotalL, 'L') : '기록 없음',
      delta: fmtDelta(current.milkTotalL || null, p?.milkTotalL ?? null, 'L'),
      note: current.milkTotalL === 0 ? 'T4C 보고서를 /milk-entry 에 올리면 다음 보고서부터 집계됩니다' : undefined,
    },
    {
      label: '두당 일 마진',
      value: fmtKrw(current.marginPerHeadDayKrw),
      delta: fmtDelta(current.marginPerHeadDayKrw, p?.marginPerHeadDayKrw ?? null, '원'),
      note: current.marginPerHeadDayKrw == null ? '유량 기록 + 착유우 배합비가 모두 있어야 계산됩니다' : '추정치 — 유대단가·사료비 기준',
    },
    {
      label: '알람 정확도',
      value: fmtPct(current.alertAccuracy),
      delta: fmtDelta(current.alertAccuracy, p?.alertAccuracy ?? null, '%p'),
      note: current.alertAccuracy == null ? '피드백 레이블 10건 이상부터 집계' : undefined,
    },
  ];
}

export interface RenderReportInput {
  readonly farmName: string;
  readonly period: PeriodRange;
  readonly current: PeriodReport;
  readonly previous: PeriodReport | null;
  /** 성과 보고서에서만 채워진다 — 파일럿 누적 구간 집계 */
  readonly cumulative: { readonly report: PeriodReport; readonly label: string } | null;
  readonly appUrl?: string;
}

export interface RenderedReport {
  readonly subject: string;
  readonly html: string;
  readonly text: string;
}

function esc(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const TH = 'style="text-align:left;padding:8px 10px;background:#E8F5E9;color:#1B5E20;font-weight:600;border-bottom:1px solid #C8E6C9;"';
const TD = 'style="padding:8px 10px;border-bottom:1px solid #EEEEEE;vertical-align:top;"';

export function renderReportEmail(input: RenderReportInput): RenderedReport {
  const { farmName, period, current, previous, cumulative } = input;
  const kindLabel = PERIOD_KIND_LABELS[period.kind];
  const metrics = snapshotMetrics(current);
  const prevMetrics = previous ? snapshotMetrics(previous) : null;
  const rows = buildMetricRows(metrics, prevMetrics);
  const topAlerts = current.summary.alertsByType.slice(0, 5);
  const subject = buildReportSubject(farmName, period);

  // ── HTML ──
  const rowsHtml = rows
    .map(
      (r) => `<tr>
      <td ${TD}><strong>${esc(r.label)}</strong></td>
      <td ${TD}>${esc(r.value)}${r.note ? `<div style="color:#757575;font-size:12px;margin-top:2px;">${esc(r.note)}</div>` : ''}</td>
      <td ${TD} align="right">${esc(r.delta)}</td>
    </tr>`,
    )
    .join('\n');

  const alertsHtml = topAlerts.length
    ? topAlerts
        .map(
          (a) => `<tr>
      <td ${TD}>${esc(a.label)}</td>
      <td ${TD} align="right">${fmtInt(a.count, '건')}</td>
    </tr>`,
        )
        .join('\n')
    : `<tr><td ${TD} colspan="2">이 기간에 발생한 알림이 없습니다.</td></tr>`;

  const cumulativeHtml = cumulative
    ? (() => {
        const c = snapshotMetrics(cumulative.report);
        return `
  <h3 style="margin:24px 0 8px;color:#1B5E20;font-size:16px;">파일럿 누적 성과 (${esc(cumulative.label)})</h3>
  <table cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;font-size:14px;">
    <tr><td ${TD}>누적 알림</td><td ${TD} align="right">${fmtInt(c.totalAlerts, '건')}</td></tr>
    <tr><td ${TD}>누적 건강 알림 / 치료 기록</td><td ${TD} align="right">${fmtInt(c.healthAlerts, '건')} / ${fmtInt(c.treatments, '건')}</td></tr>
    <tr><td ${TD}>누적 조치 완료</td><td ${TD} align="right">${fmtInt(c.decisionsCompleted, '건')}</td></tr>
    <tr><td ${TD}>누적 수정 건수</td><td ${TD} align="right">${fmtInt(c.inseminations, '건')}</td></tr>
    <tr><td ${TD}>누적 유량</td><td ${TD} align="right">${c.milkTotalL > 0 ? fmtInt(c.milkTotalL, 'L') : '기록 없음'}</td></tr>
  </table>`;
      })()
    : '';

  const html = `<div style="font-family:'Malgun Gothic','맑은 고딕',Apple SD Gothic Neo,sans-serif;color:#212121;max-width:680px;margin:0 auto;padding:16px;">
  <div style="border-left:4px solid #1B5E20;padding-left:12px;margin-bottom:16px;">
    <div style="font-size:12px;color:#757575;">CowTalk 자동 ${esc(kindLabel)} 보고서</div>
    <h2 style="margin:4px 0;font-size:20px;color:#1B5E20;">${esc(farmName)} · ${esc(period.title)}</h2>
    <div style="font-size:13px;color:#757575;">대상 기간 ${esc(period.label)}</div>
  </div>

  <h3 style="margin:20px 0 8px;color:#1B5E20;font-size:16px;">한눈에 보기</h3>
  <table cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;font-size:14px;">
    <tr><th ${TH}>항목</th><th ${TH}>이번 ${esc(kindLabel)}</th><th ${TH} align="right">직전 대비</th></tr>
${rowsHtml}
  </table>

  <h3 style="margin:24px 0 8px;color:#1B5E20;font-size:16px;">알림 유형 상위 ${String(topAlerts.length || 0)}건</h3>
  <table cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;font-size:14px;">
${alertsHtml}
  </table>
${cumulativeHtml}

  <h3 style="margin:24px 0 8px;color:#1B5E20;font-size:16px;">요약 코멘트</h3>
  <p style="font-size:14px;line-height:1.7;background:#F1F8E9;padding:12px;border-radius:6px;margin:0;">${esc(current.aiComment)}</p>

  <p style="font-size:12px;color:#757575;line-height:1.6;margin-top:24px;border-top:1px solid #EEEEEE;padding-top:12px;">
    이 메일은 CowTalk이 ${esc(kindLabel)} 주기로 자동 발송합니다. 수치는 smaXtec 센서 이벤트·목장 기록·공공데이터를 집계한 것이며,
    수의사의 임상 판단을 대체하지 않습니다. 유량·마진은 기록이 있는 항목만 계산되고, 없는 항목은 "기록 없음"으로 표기됩니다.
    수신 주기·수신자는 CowTalk 설정 &gt; 보고서 발송에서 바꿀 수 있습니다.
  </p>
</div>`;

  // ── 텍스트 (HTML 차단 환경·모바일 미리보기용) ──
  const textLines = [
    `[CowTalk] ${farmName} ${kindLabel} 보고서`,
    `${period.title} (${period.label})`,
    '',
    '■ 한눈에 보기',
    ...rows.map((r) => `- ${r.label}: ${r.value}${r.delta !== '—' ? ` / 직전 대비 ${r.delta}` : ''}${r.note ? ` (${r.note})` : ''}`),
    '',
    '■ 알림 유형 상위',
    ...(topAlerts.length
      ? topAlerts.map((a) => `- ${a.label}: ${fmtInt(a.count, '건')}`)
      : ['- 이 기간에 발생한 알림이 없습니다.']),
  ];

  if (cumulative) {
    const c = snapshotMetrics(cumulative.report);
    textLines.push(
      '',
      `■ 파일럿 누적 성과 (${cumulative.label})`,
      `- 누적 알림: ${fmtInt(c.totalAlerts, '건')}`,
      `- 누적 건강 알림/치료: ${fmtInt(c.healthAlerts, '건')} / ${fmtInt(c.treatments, '건')}`,
      `- 누적 조치 완료: ${fmtInt(c.decisionsCompleted, '건')}`,
      `- 누적 수정 건수: ${fmtInt(c.inseminations, '건')}`,
      `- 누적 유량: ${c.milkTotalL > 0 ? fmtInt(c.milkTotalL, 'L') : '기록 없음'}`,
    );
  }

  textLines.push(
    '',
    '■ 요약 코멘트',
    current.aiComment,
    '',
    `※ CowTalk 자동 ${kindLabel} 보고서. 수의사의 임상 판단을 대체하지 않습니다.`,
  );

  return { subject, html, text: textLines.join('\n') };
}

// ── 엑셀 첨부 (기존 xlsxGenerator 의 {title, sheets} 계약을 그대로 쓴다) ──

export interface XlsxSheetContent {
  readonly title: string;
  readonly sheets: readonly {
    readonly name: string;
    readonly headers: readonly string[];
    readonly rows: readonly (readonly unknown[])[];
    readonly column_widths?: readonly number[];
  }[];
}

export function buildReportSheets(input: RenderReportInput): XlsxSheetContent {
  const { farmName, period, current, previous, cumulative } = input;
  const kindLabel = PERIOD_KIND_LABELS[period.kind];
  const metrics = snapshotMetrics(current);
  const rows = buildMetricRows(metrics, previous ? snapshotMetrics(previous) : null);

  const sheets: XlsxSheetContent['sheets'] = [
    {
      name: '핵심지표',
      headers: ['항목', `이번 ${kindLabel}`, '직전 대비', '비고'],
      rows: rows.map((r) => [r.label, r.value, r.delta, r.note ?? '']),
      column_widths: [18, 26, 16, 44],
    },
    {
      name: '알림유형',
      headers: ['유형', '건수'],
      rows: current.summary.alertsByType.map((a) => [a.label, a.count]),
      column_widths: [24, 12],
    },
    {
      name: '건강이벤트',
      headers: ['분류', '건수'],
      rows: current.health.diseaseByType.map((d) => [d.type, d.count]),
      column_widths: [24, 12],
    },
    {
      name: '기간정보',
      headers: ['항목', '값'],
      rows: [
        ['목장', farmName],
        ['보고 주기', kindLabel],
        ['기간', period.label],
        ['기간 키', period.periodKey],
        ['생성 시각(UTC)', new Date().toISOString()],
        ['요약 코멘트', current.aiComment],
      ],
      column_widths: [18, 80],
    },
  ];

  if (cumulative) {
    const c = snapshotMetrics(cumulative.report);
    return {
      title: `${farmName} ${kindLabel} 보고서 ${period.title}`,
      sheets: [
        ...sheets,
        {
          name: '누적성과',
          headers: ['항목', '누적값'],
          rows: [
            ['누적 구간', cumulative.label],
            ['누적 알림(건)', c.totalAlerts],
            ['누적 건강 알림(건)', c.healthAlerts],
            ['누적 치료 기록(건)', c.treatments],
            ['누적 조치 완료(건)', c.decisionsCompleted],
            ['누적 수정(건)', c.inseminations],
            ['누적 유량(L)', c.milkTotalL],
          ],
          column_widths: [24, 28],
        },
      ],
    };
  }

  return { title: `${farmName} ${kindLabel} 보고서 ${period.title}`, sheets };
}

/** 첨부 파일명 — 받은편지함에서 정렬되도록 목장·주기·기간 키 순 */
export function buildAttachmentName(farmName: string, kind: ReportPeriodKind, periodKey: string): string {
  const safeFarm = farmName.replace(/[^\p{L}\p{N}_-]/gu, '_').slice(0, 30);
  const safeKey = periodKey.replace(/[^A-Za-z0-9-]/g, '_');
  return `cowtalk_${safeFarm}_${kind}_${safeKey}.xlsx`;
}
