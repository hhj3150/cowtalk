// 데모 신호 시드 — 대시보드를 '살아있게' 만드는 알림·센서·이벤트·건강이력 생성
// 실데이터(농장·개체)를 읽어 현실적인 최근 신호를 채운다. 멱등(중복 시 스킵).
//   - alerts: 활성 알림(체온/건강/발정/분만/반추) 다양한 우선순위
//   - smaxtec_events: 최근 14일 이벤트 타임라인
//   - sensor_daily_agg: 14일 체온/활동 추이(일부 발열 스파이크) → 차트
//   - health_events: 90일 진단 이력 → 농장 이력 차트
//
// 실행: tsx src/scripts/seed-demo-signals.ts

import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { getDatabaseUrl } from '../config/index';
import * as schema from '../db/schema';

function pick<T>(arr: readonly T[]): T { return arr[Math.floor(Math.random() * arr.length)]!; }
function rand(min: number, max: number): number { return min + Math.random() * (max - min); }
function daysAgo(d: number): Date { return new Date(Date.now() - d * 86_400_000); }

const ALERT_TEMPLATES = [
  { alertType: 'temperature_warning', priority: 'critical', engineType: 'disease', title: '고체온 경고', explanation: '직장온도 추정 40.1°C — 정상범위 상회, 급성 염증 의심.', recommendedAction: '즉시 수의사 호출 + 격리. 유방·자궁·호흡기 임상검사.' },
  { alertType: 'health_warning', priority: 'high', engineType: 'disease', title: '반추 급감 + 활동 저하', explanation: '반추 24h 평균 38% 감소, 활동량 동반 저하 — 케토시스/제4위변위 의심.', recommendedAction: 'BHB 케톤 검사 + 사료섭취 점검. 24h 내 재평가.' },
  { alertType: 'estrus', priority: 'medium', engineType: 'estrus', title: '발정 감지', explanation: '활동량 급증 + 반추 일시 저하 — 발정 징후. 수정 적기 진입.', recommendedAction: '수정 적기 06~14시. 보유정액 추천 확인 후 수정사 배정.' },
  { alertType: 'calving', priority: 'high', engineType: 'herd', title: '분만 임박', explanation: '활동 패턴 + 체온 하강(−0.6°C) — 24h 내 분만 가능성.', recommendedAction: '분만방 이동 + 야간 관찰 강화.' },
  { alertType: 'rumination_warning', priority: 'medium', engineType: 'nutrition', title: '반추 저하 추세', explanation: '3일 연속 반추 감소 추세 — 사료 전환/산독증 주의.', recommendedAction: 'TMR 입자도·급이 점검. 추세 모니터링.' },
];

const EVENT_TYPES = ['estrus', 'health_warning', 'calving', 'rumination_drop', 'temperature_high', 'insemination', 'pregnancy_result'] as const;
const DIAGNOSES = ['유방염', '케토시스', '자궁내막염', '제4위변위', '폐렴', '반추위 산독증'] as const;

async function main(): Promise<void> {
  const sql = postgres(getDatabaseUrl());
  const db = drizzle(sql, { schema });
  try {
    const animals = await db.select({ animalId: schema.animals.animalId, farmId: schema.animals.farmId }).from(schema.animals);
    if (animals.length === 0) { console.error('개체가 없습니다 — 먼저 npm run seed'); return; }

    // 멱등: 이미 데모 알림이 있으면 스킵
    const existing = await db.select({ c: schema.alerts.alertId }).from(schema.alerts).limit(1);
    if (existing.length > 0) { console.info('이미 신호가 존재 — 스킵'); return; }

    // 1) 활성 알림 (12건)
    const alertRows = Array.from({ length: 12 }, (_, i) => {
      const a = pick(animals); const t = pick(ALERT_TEMPLATES);
      return { ...t, animalId: a.animalId, farmId: a.farmId, status: 'new',
        dedupKey: `demo:${t.alertType}:${a.animalId}:${i}`, createdAt: daysAgo(rand(0, 3)), updatedAt: new Date() };
    });
    await db.insert(schema.alerts).values(alertRows);

    // 2) smaXtec 이벤트 (최근 14일, 40건)
    const eventRows = Array.from({ length: 40 }, () => {
      const a = pick(animals); const et = pick(EVENT_TYPES);
      const sev = et === 'temperature_high' || et === 'health_warning' ? pick(['high', 'medium']) : pick(['low', 'medium']);
      return { animalId: a.animalId, farmId: a.farmId, eventType: et, confidence: rand(0.82, 0.98),
        severity: sev, detectedAt: daysAgo(rand(0, 14)), acknowledged: Math.random() > 0.6 };
    });
    await db.insert(schema.smaxtecEvents).values(eventRows);

    // 3) 센서 일별집계 (30개체 × 14일 × temp/act), 일부 발열
    const sample = animals.slice(0, 30);
    const sensorRows: Array<typeof schema.sensorDailyAgg.$inferInsert> = [];
    for (const a of sample) {
      const feverish = Math.random() < 0.18; // 18% 개체 최근 발열
      for (let d = 13; d >= 0; d--) {
        const date = daysAgo(d).toISOString().slice(0, 10);
        const base = 38.6 + Math.sin(d / 3) * 0.15;
        const fever = feverish && d <= 2 ? rand(0.9, 1.6) : 0;
        const tAvg = base + fever + rand(-0.1, 0.1);
        sensorRows.push({ animalId: a.animalId, date, metricType: 'temp', avg: +tAvg.toFixed(2), min: +(tAvg - rand(0.2, 0.5)).toFixed(2), max: +(tAvg + rand(0.3, 0.8)).toFixed(2), stddev: 0.2, count: 24 });
        const actAvg = rand(70, 160) - (fever > 0 ? 30 : 0);
        sensorRows.push({ animalId: a.animalId, date, metricType: 'act', avg: +actAvg.toFixed(0), min: +(actAvg * 0.6).toFixed(0), max: +(actAvg * 1.5).toFixed(0), stddev: 12, count: 24 });
      }
    }
    await db.insert(schema.sensorDailyAgg).values(sensorRows);

    // 4) 건강 이력 (90일, 14건)
    const healthRows = Array.from({ length: 14 }, () => {
      const a = pick(animals);
      return { animalId: a.animalId, eventDate: daysAgo(rand(1, 90)), diagnosis: pick(DIAGNOSES), severity: pick(['high', 'medium', 'low']), notes: '데모 진단 이력' };
    });
    await db.insert(schema.healthEvents).values(healthRows);

    console.info('데모 신호 시드 완료:');
    console.info(`  - 알림 ${alertRows.length} / 이벤트 ${eventRows.length} / 센서 ${sensorRows.length} / 건강이력 ${healthRows.length}`);
  } catch (e) {
    console.error('데모 신호 시드 실패:', e); throw e;
  } finally {
    await sql.end();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
