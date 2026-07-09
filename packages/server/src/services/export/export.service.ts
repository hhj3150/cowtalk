// 데이터 내보내기 서비스 — CSV/XLSX 실구현 (기존 downloadUrl:null 스텁 대체)
//
// 정직성: DB 실측 행만 내보낸다. 행 상한(MAX_ROWS) 초과 시 truncated 플래그를 세우고
// 라우트가 X-Export-Truncated 헤더 + XLSX 시트명에 명시한다 (조용한 잘림 금지).
// 개인정보: 농장 전화번호·소유주명은 어떤 대상에도 포함하지 않는다.

import ExcelJS from 'exceljs';
import { getDb } from '../../config/database.js';
import {
  animals,
  alerts,
  farms,
  predictions,
  regions,
  sensorDailyAgg,
} from '../../db/schema.js';
import { and, desc, eq, gte, inArray, isNull } from 'drizzle-orm';
import { resolveFarmProvince } from '../epidemiology/province-mapper.js';

const MS_PER_DAY = 86_400_000;
/** 단일 내보내기 최대 행 수 — 초과 시 최신순 상위만 담고 truncated 표시 */
const MAX_ROWS = 50_000;

export const EXPORT_TARGETS = ['animals', 'alerts', 'sensors', 'predictions', 'farms', 'regional'] as const;
export type ExportTarget = (typeof EXPORT_TARGETS)[number];

export function isExportTarget(value: string): value is ExportTarget {
  return (EXPORT_TARGETS as readonly string[]).includes(value);
}

export type ExportFormat = 'csv' | 'xlsx';

/** 웹은 'excel', 스키마는 'xlsx'를 보낸다 — 둘 다 xlsx로 정규화, 그 외 csv */
export function parseExportFormat(raw: unknown): ExportFormat {
  return raw === 'xlsx' || raw === 'excel' ? 'xlsx' : 'csv';
}

export type ExportCell = string | number | null;

export interface ExportSheet {
  readonly name: string;
  readonly headers: readonly string[];
  readonly rows: ReadonlyArray<ReadonlyArray<ExportCell>>;
  readonly truncated: boolean;
}

// ── 직렬화 (순수 함수 — 테스트 대상) ──────────────────────────────

function csvCell(value: ExportCell): string {
  if (value == null) return '';
  const s = String(value);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** UTF-8 BOM 포함 CSV — 한글 헤더를 Excel에서 바로 열 수 있게 */
export function toCsv(sheet: ExportSheet): string {
  const lines = [
    sheet.headers.map(csvCell).join(','),
    ...sheet.rows.map((row) => row.map(csvCell).join(',')),
  ];
  return '\uFEFF' + lines.join('\r\n');
}

export async function toXlsxBuffer(sheet: ExportSheet): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'CowTalk';
  const sheetName = (sheet.truncated ? `${sheet.name}(일부)` : sheet.name)
    .replace(/[\\/*?[\]:]/g, '_')
    .slice(0, 31) || 'Sheet1';
  const ws = workbook.addWorksheet(sheetName);

  const headerRow = ws.addRow([...sheet.headers]);
  headerRow.eachCell((cell) => {
    cell.font = { bold: true };
  });
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: Math.max(sheet.headers.length, 1) } };
  sheet.headers.forEach((h, i) => {
    ws.getColumn(i + 1).width = Math.max(12, h.length * 2 + 6);
  });
  for (const row of sheet.rows) {
    ws.addRow([...row]);
  }

  const buf = await workbook.xlsx.writeBuffer();
  return Buffer.from(buf as ArrayBuffer);
}

// ── 대상별 조회 ──────────────────────────────────────────────────

export interface ExportOptions {
  /** 스코프 농장 (undefined = 전체 — 관리 역할) */
  readonly farmIds?: readonly string[];
  /** 시계열 대상(alerts/sensors/predictions)의 조회 기간 */
  readonly days: number;
}

function farmScope(column: typeof animals.farmId | typeof alerts.farmId | typeof predictions.farmId, farmIds?: readonly string[]) {
  return farmIds && farmIds.length > 0 ? inArray(column, [...farmIds]) : undefined;
}

function isoDate(value: Date | string | null): string | null {
  if (value == null) return null;
  return (value instanceof Date ? value.toISOString() : value).slice(0, 10);
}

function isoDateTime(value: Date | null): string | null {
  return value ? value.toISOString().replace('T', ' ').slice(0, 16) : null;
}

async function buildAnimalsSheet(opts: ExportOptions): Promise<ExportSheet> {
  const db = getDb();
  const rows = await db
    .select({
      earTag: animals.earTag,
      traceId: animals.traceId,
      name: animals.name,
      breed: animals.breed,
      breedType: animals.breedType,
      sex: animals.sex,
      birthDate: animals.birthDate,
      parity: animals.parity,
      daysInMilk: animals.daysInMilk,
      lactationStatus: animals.lactationStatus,
      status: animals.status,
      farmName: farms.name,
    })
    .from(animals)
    .leftJoin(farms, eq(animals.farmId, farms.farmId))
    .where(and(isNull(animals.deletedAt), farmScope(animals.farmId, opts.farmIds)))
    .orderBy(farms.name, animals.earTag)
    .limit(MAX_ROWS + 1);
  return {
    name: '개체',
    headers: ['농장', '귀표번호', '이력번호', '이름', '품종', '유형', '성별', '출생일', '산차', '착유일수', '비유상태', '상태'],
    rows: rows.slice(0, MAX_ROWS).map((r) => [
      r.farmName, r.earTag, r.traceId, r.name, r.breed, r.breedType, r.sex,
      isoDate(r.birthDate), r.parity, r.daysInMilk, r.lactationStatus, r.status,
    ]),
    truncated: rows.length > MAX_ROWS,
  };
}

async function buildAlertsSheet(opts: ExportOptions): Promise<ExportSheet> {
  const db = getDb();
  const since = new Date(Date.now() - opts.days * MS_PER_DAY);
  const rows = await db
    .select({
      createdAt: alerts.createdAt,
      priority: alerts.priority,
      status: alerts.status,
      alertType: alerts.alertType,
      engineType: alerts.engineType,
      title: alerts.title,
      recommendedAction: alerts.recommendedAction,
      earTag: animals.earTag,
      farmName: farms.name,
    })
    .from(alerts)
    .leftJoin(animals, eq(alerts.animalId, animals.animalId))
    .leftJoin(farms, eq(alerts.farmId, farms.farmId))
    .where(and(gte(alerts.createdAt, since), farmScope(alerts.farmId, opts.farmIds)))
    .orderBy(desc(alerts.createdAt))
    .limit(MAX_ROWS + 1);
  return {
    name: `알림 최근${opts.days}일`,
    headers: ['발생시각', '농장', '귀표번호', '우선순위', '상태', '유형', '엔진', '제목', '권장조치'],
    rows: rows.slice(0, MAX_ROWS).map((r) => [
      isoDateTime(r.createdAt), r.farmName, r.earTag, r.priority, r.status,
      r.alertType, r.engineType, r.title, r.recommendedAction,
    ]),
    truncated: rows.length > MAX_ROWS,
  };
}

async function buildSensorsSheet(opts: ExportOptions): Promise<ExportSheet> {
  const db = getDb();
  const sinceDate = new Date(Date.now() - opts.days * MS_PER_DAY).toISOString().slice(0, 10);
  const rows = await db
    .select({
      date: sensorDailyAgg.date,
      metricType: sensorDailyAgg.metricType,
      avg: sensorDailyAgg.avg,
      min: sensorDailyAgg.min,
      max: sensorDailyAgg.max,
      count: sensorDailyAgg.count,
      earTag: animals.earTag,
      farmName: farms.name,
    })
    .from(sensorDailyAgg)
    .innerJoin(animals, eq(sensorDailyAgg.animalId, animals.animalId))
    .leftJoin(farms, eq(animals.farmId, farms.farmId))
    .where(and(gte(sensorDailyAgg.date, sinceDate), farmScope(animals.farmId, opts.farmIds)))
    .orderBy(desc(sensorDailyAgg.date), animals.earTag)
    .limit(MAX_ROWS + 1);
  const round = (v: number): number => Math.round(v * 100) / 100;
  return {
    name: `센서일별 최근${opts.days}일`,
    headers: ['날짜', '농장', '귀표번호', '지표', '평균', '최소', '최대', '측정수'],
    rows: rows.slice(0, MAX_ROWS).map((r) => [
      r.date, r.farmName, r.earTag, r.metricType, round(r.avg), round(r.min), round(r.max), r.count,
    ]),
    truncated: rows.length > MAX_ROWS,
  };
}

async function buildPredictionsSheet(opts: ExportOptions): Promise<ExportSheet> {
  const db = getDb();
  const since = new Date(Date.now() - opts.days * MS_PER_DAY);
  const rows = await db
    .select({
      timestamp: predictions.timestamp,
      engineType: predictions.engineType,
      predictionLabel: predictions.predictionLabel,
      probability: predictions.probability,
      confidence: predictions.confidence,
      severity: predictions.severity,
      recommendedAction: predictions.recommendedAction,
      earTag: animals.earTag,
      farmName: farms.name,
    })
    .from(predictions)
    .leftJoin(animals, eq(predictions.animalId, animals.animalId))
    .leftJoin(farms, eq(predictions.farmId, farms.farmId))
    .where(and(gte(predictions.timestamp, since), farmScope(predictions.farmId, opts.farmIds)))
    .orderBy(desc(predictions.timestamp))
    .limit(MAX_ROWS + 1);
  return {
    name: `AI예측 최근${opts.days}일`,
    headers: ['시각', '농장', '귀표번호', '엔진', '예측', '확률', '신뢰도', '심각도', '권장조치'],
    rows: rows.slice(0, MAX_ROWS).map((r) => [
      isoDateTime(r.timestamp), r.farmName, r.earTag, r.engineType, r.predictionLabel,
      Math.round(r.probability * 100) / 100, Math.round(r.confidence * 100) / 100,
      r.severity, r.recommendedAction,
    ]),
    truncated: rows.length > MAX_ROWS,
  };
}

interface FarmProvinceRow {
  readonly farmId: string;
  readonly name: string;
  readonly address: string;
  readonly lat: number;
  readonly lng: number;
  readonly currentHeadCount: number;
  readonly capacity: number;
  readonly status: string;
  readonly regionProvince: string | null;
  readonly createdAt: Date;
}

async function fetchFarmsWithProvince(farmIds?: readonly string[]): Promise<Array<FarmProvinceRow & { province: string }>> {
  const db = getDb();
  const rows: FarmProvinceRow[] = await db
    .select({
      farmId: farms.farmId,
      name: farms.name,
      address: farms.address,
      lat: farms.lat,
      lng: farms.lng,
      currentHeadCount: farms.currentHeadCount,
      capacity: farms.capacity,
      status: farms.status,
      regionProvince: regions.province,
      createdAt: farms.createdAt,
    })
    .from(farms)
    .leftJoin(regions, eq(farms.regionId, regions.regionId))
    .where(and(isNull(farms.deletedAt), farmIds && farmIds.length > 0 ? inArray(farms.farmId, [...farmIds]) : undefined));
  return rows.map((f) => ({
    ...f,
    province: resolveFarmProvince({
      regionProvince: f.regionProvince,
      address: f.address,
      lat: f.lat,
      lng: f.lng,
    }),
  }));
}

async function buildFarmsSheet(opts: ExportOptions): Promise<ExportSheet> {
  const farmRows = await fetchFarmsWithProvince(opts.farmIds);
  farmRows.sort((a, b) => a.province.localeCompare(b.province, 'ko') || a.name.localeCompare(b.name, 'ko'));
  return {
    name: '농장',
    headers: ['시도', '농장명', '주소', '사육두수', '수용두수', '상태', '등록일'],
    rows: farmRows.slice(0, MAX_ROWS).map((f) => [
      f.province, f.name, f.address, f.currentHeadCount, f.capacity, f.status, isoDate(f.createdAt),
    ]),
    truncated: farmRows.length > MAX_ROWS,
  };
}

async function buildRegionalSheet(opts: ExportOptions): Promise<ExportSheet> {
  const db = getDb();
  const farmRows = await fetchFarmsWithProvince(opts.farmIds);

  const since = new Date(Date.now() - opts.days * MS_PER_DAY);
  const alertRows = await db
    .select({ farmId: alerts.farmId, priority: alerts.priority })
    .from(alerts)
    .where(and(gte(alerts.createdAt, since), farmScope(alerts.farmId, opts.farmIds)));
  const provinceByFarm = new Map(farmRows.map((f) => [f.farmId, f.province]));

  interface Agg { farmCount: number; headCount: number; alertCount: number; urgentCount: number }
  const byProvince = new Map<string, Agg>();
  const getAgg = (province: string): Agg => {
    const existing = byProvince.get(province);
    if (existing) return existing;
    const created: Agg = { farmCount: 0, headCount: 0, alertCount: 0, urgentCount: 0 };
    byProvince.set(province, created);
    return created;
  };
  for (const f of farmRows) {
    const agg = getAgg(f.province);
    agg.farmCount += 1;
    agg.headCount += f.currentHeadCount;
  }
  for (const a of alertRows) {
    const province = provinceByFarm.get(a.farmId);
    if (!province) continue; // 삭제된 농장의 알림은 집계 제외
    const agg = getAgg(province);
    agg.alertCount += 1;
    if (a.priority === 'critical' || a.priority === 'high') agg.urgentCount += 1;
  }

  const sorted = [...byProvince.entries()].sort((a, b) => b[1].farmCount - a[1].farmCount);
  return {
    name: `시도별현황 최근${opts.days}일`,
    headers: ['시도', '농장수', '사육두수', `최근${opts.days}일 알림`, `최근${opts.days}일 긴급알림`],
    rows: sorted.map(([province, agg]) => [
      province, agg.farmCount, agg.headCount, agg.alertCount, agg.urgentCount,
    ]),
    truncated: false,
  };
}

export async function buildExportSheet(target: ExportTarget, opts: ExportOptions): Promise<ExportSheet> {
  switch (target) {
    case 'animals': return buildAnimalsSheet(opts);
    case 'alerts': return buildAlertsSheet(opts);
    case 'sensors': return buildSensorsSheet(opts);
    case 'predictions': return buildPredictionsSheet(opts);
    case 'farms': return buildFarmsSheet(opts);
    case 'regional': return buildRegionalSheet(opts);
  }
}
