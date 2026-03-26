// 건강 모니터링 차트 데이터 서비스 — smaXtec 실데이터 패턴 재현
// 실제 smaXtec 위내센서 데이터의 특성을 정밀하게 모사

import type { HealthChartDataPoint, AnimalChartInfo } from '@web/types/health-chart';

const INTERVAL_MIN = 10;
const MS_PER_MIN = 60 * 1000;

function rand(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

function clamp(val: number, min: number, max: number): number {
  return Math.min(Math.max(val, min), max);
}

// 가우시안 노이즈 (Box-Muller 변환)
function gaussianNoise(mean: number, stddev: number): number {
  const u1 = Math.random();
  const u2 = Math.random();
  const z = Math.sqrt(-2 * Math.log(u1 || 0.001)) * Math.cos(2 * Math.PI * u2);
  return mean + z * stddev;
}

/** smaXtec 패턴 기반 더미 데이터 생성 (10분 간격) */
export function generateDummyData(days = 11): readonly HealthChartDataPoint[] {
  const totalPoints = days * 24 * (60 / INTERVAL_MIN);
  const now = new Date();
  const startTime = new Date(now.getTime() - days * 24 * 60 * MS_PER_MIN);

  // ── 사전 계산: 음수 이벤트 스케줄 (하루 12~18회, 불규칙 간격) ──
  const drinkingEvents: Set<number> = new Set();
  for (let d = 0; d < days + 1; d++) {
    const dayStart = d * 144; // 144 = 24h * 6 (10분 간격)
    const drinksPerDay = Math.round(rand(12, 18));
    for (let j = 0; j < drinksPerDay; j++) {
      // 낮 시간(06~20시)에 더 많이 마심
      const hour = Math.random() < 0.7
        ? rand(6, 20) // 70%는 낮
        : rand(0, 6); // 30%는 새벽
      const idx = dayStart + Math.round(hour * 6);
      if (idx < totalPoints) {
        drinkingEvents.add(idx);
        // 음수 후 1~2 포인트 회복기
        if (idx + 1 < totalPoints) drinkingEvents.add(idx + 1);
      }
    }
  }

  // ── 사전 계산: 발정 이벤트 (데이터 중간쯤) ──
  const heatStartIdx = Math.floor(totalPoints * 0.4);
  const heatDuration = 30; // 5시간

  // ── 일별 음수량 (24h step) ──
  const dailyWater: number[] = [];
  for (let d = 0; d < days + 1; d++) {
    dailyWater.push(Math.round(rand(50, 100)));
  }

  // ── 온도 이전 값 (연속성 유지) ──
  let prevTemp = 39.0;
  // ── 반추 이전 값 (연속성) ──
  let prevRumination = 450;
  const points: HealthChartDataPoint[] = [];

  for (let i = 0; i < totalPoints; i++) {
    const ts = new Date(startTime.getTime() + i * INTERVAL_MIN * MS_PER_MIN);
    const hour = ts.getHours() + ts.getMinutes() / 60;
    const dayIndex = Math.floor(i / 144);

    // ═══════════════════════════════════════════════
    // 1. 온도 — smaXtec 위내센서 패턴
    // 기저: 38.5~39.5°C + 미세 변동(±0.15°C)
    // 음수 시: 급격 하강(20~36°C) → 10~20분 내 회복
    // ═══════════════════════════════════════════════
    let temperature: number;
    const isDrinking = drinkingEvents.has(i);

    if (isDrinking) {
      // 음수 이벤트: 찬물 섭취로 체온 급락
      const isRecovery = drinkingEvents.has(i - 1); // 이전 포인트도 음수면 회복기
      if (isRecovery) {
        // 회복 중: 기저로 돌아가는 중
        temperature = prevTemp + (39.0 - prevTemp) * rand(0.4, 0.7);
      } else {
        // 급락: 28~37°C까지 떨어짐 (smaXtec 실데이터 — 대부분 30°C 전후)
        temperature = rand(28.0, 37.0);
      }
    } else {
      // 정상: 38.5~39.5 범위에서 미세 변동
      const circadian = 0.2 * Math.sin((2 * Math.PI * (hour - 14)) / 24); // 오후에 약간 높음
      temperature = 39.0 + circadian + gaussianNoise(0, 0.12);
      temperature = clamp(temperature, 38.3, 39.8);
    }
    prevTemp = temperature;

    // 정상 체온 기준선 (부드러운 사인)
    const normalTemp = 39.0 + 0.2 * Math.sin((2 * Math.PI * (hour - 14)) / 24);

    // ═══════════════════════════════════════════════
    // 2. 반추 — smaXtec 패턴
    // 밤(20~06시): 높음 500~650분
    // 낮(06~20시): 낮음 300~450분
    // 불규칙 변동 + 먹이 시간대 급락
    // ═══════════════════════════════════════════════
    const isNight = hour >= 20 || hour < 6;
    const ruminationTarget = isNight
      ? rand(500, 620) // 밤: 높은 반추
      : rand(280, 420); // 낮: 낮은 반추 (착유/사료 시간)

    // 전환을 부드럽게 (이전 값과 블렌드)
    const blend = 0.15; // 느린 전환
    let rumination = prevRumination * (1 - blend) + ruminationTarget * blend;

    // 노이즈 추가 (±20)
    rumination += gaussianNoise(0, 15);

    // 간헐적 급락 (사료급여/착유 시간대)
    const feedingTimes = [5.5, 6, 12, 17.5, 18]; // 착유+급이 시간
    if (feedingTimes.some((ft) => Math.abs(hour - ft) < 0.5) && Math.random() < 0.4) {
      rumination = rand(200, 320); // 먹는 동안 반추 감소
    }

    rumination = clamp(rumination, 150, 700);
    prevRumination = rumination;

    // ═══════════════════════════════════════════════
    // 3. 활동량 — smaXtec 패턴
    // 대부분 낮은 값(0~20), 간헐적 높은 스파이크(50~100+)
    // 낮에 스파이크 빈도 높음, 밤에 거의 0
    // smaXtec 원본에서 분홍 스파이크 패턴
    // ═══════════════════════════════════════════════
    let activity: number;
    const activityHour = hour;
    const isDayTime = activityHour >= 5 && activityHour < 21;

    if (isDayTime) {
      // 낮: 기저 0~8, 가끔 작은 스파이크 (smaXtec 원본은 바닥에 머묾)
      const spikeChance = 0.06; // 10분마다 6% 확률 (드물게)
      if (Math.random() < spikeChance) {
        activity = rand(20, 50); // 중간 스파이크
      } else if (Math.random() < 0.03) {
        activity = rand(10, 25); // 작은 스파이크
      } else {
        activity = rand(0, 8); // 기저 — 바닥
      }
    } else {
      // 밤: 거의 0
      if (Math.random() < 0.02) {
        activity = rand(5, 15); // 드문 야간 활동
      } else {
        activity = rand(0, 4);
      }
    }

    // 착유 시간대만 약간 높음 (smaXtec에서 관찰되는 패턴)
    if ([5, 6, 17, 18].some((h) => Math.abs(hour - h) < 0.5)) {
      activity = Math.max(activity, rand(15, 40));
    }

    activity = clamp(activity, 0, 80);

    // ═══════════════════════════════════════════════
    // 4. 발정지수 — 대부분 0, 발정 시 상승
    // ═══════════════════════════════════════════════
    let heatIndex = 0;
    if (i >= heatStartIdx && i < heatStartIdx + heatDuration) {
      const progress = (i - heatStartIdx) / heatDuration;
      if (progress < 0.3) heatIndex = progress / 0.3 * 8;
      else if (progress < 0.5) heatIndex = 8 + (progress - 0.3) / 0.2 * 2;
      else heatIndex = 10 * (1 - (progress - 0.5) / 0.5);
      heatIndex = clamp(heatIndex, 0, 10);
    }

    // ═══════════════════════════════════════════════
    // 5. 분만지수, 음수량
    // ═══════════════════════════════════════════════
    const calvingIndex = 0;
    const waterIntake = dailyWater[dayIndex] ?? 70;

    points.push({
      timestamp: ts.toISOString(),
      temperature: Number(temperature.toFixed(2)),
      normalTemp: Number(normalTemp.toFixed(2)),
      activity: Number(activity.toFixed(1)),
      heatIndex: Number(heatIndex.toFixed(2)),
      rumination: Number(rumination.toFixed(0)),
      calvingIndex,
      waterIntake,
    });
  }

  return points;
}

/** 더미 동물 정보 (향후 API 교체) */
export function fetchAnimalChartInfo(): AnimalChartInfo {
  return {
    id: '612',
    milkingDay: '착유 156일',
    dic: 'DIC 89',
    daysSinceHeat: 54,
    cycles: '23|22',
    lactation: 0,
  };
}
