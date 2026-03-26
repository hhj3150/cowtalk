// 건강 모니터링 차트 데이터 서비스 — 더미 데이터 생성 (API 연동 시 교체)

import type { HealthChartDataPoint, AnimalChartInfo } from '@web/types/health-chart';

const INTERVAL_MIN = 10;
const MS_PER_MIN = 60 * 1000;

function rand(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

function clamp(val: number, min: number, max: number): number {
  return Math.min(Math.max(val, min), max);
}

/** 11일치 더미 데이터 생성 (10분 간격, ~1584 포인트) */
export function generateDummyData(days = 11): readonly HealthChartDataPoint[] {
  const totalPoints = days * 24 * (60 / INTERVAL_MIN);
  const now = new Date();
  const startTime = new Date(now.getTime() - days * 24 * 60 * MS_PER_MIN);

  // 발정 이벤트 시점 (데이터 중간쯤)
  const heatStartIdx = Math.floor(totalPoints * 0.4);
  const heatDuration = 30; // 5시간 (30 포인트)

  // 일별 음수량 (24h 계단형)
  const dailyWater: number[] = [];
  for (let d = 0; d < days + 1; d++) {
    dailyWater.push(Math.round(rand(50, 100)));
  }

  const points: HealthChartDataPoint[] = [];

  for (let i = 0; i < totalPoints; i++) {
    const ts = new Date(startTime.getTime() + i * INTERVAL_MIN * MS_PER_MIN);
    const hour = ts.getHours() + ts.getMinutes() / 60;
    const dayIndex = Math.floor(i / (24 * 6)); // 하루 = 144포인트
    const hourOfDay = hour;

    // 온도: 기본 39.2 + 노이즈, 음수 스파이크
    let temperature = 39.2 + rand(-0.5, 0.5);
    // 하루에 5~10회 음수 스파이크 (랜덤 시점)
    const spikeChance = 7 / (24 * 6); // 하루 ~7회
    if (Math.random() < spikeChance) {
      temperature = rand(36.0, 38.0);
    }
    temperature = clamp(temperature, 35.5, 41.0);

    // 정상 체온: 완만한 사인파
    const normalTemp = 39.2 + 0.3 * Math.sin((2 * Math.PI * hour) / 24);

    // 활동량: 낮에 높고 밤에 낮은 일주기
    const isDay = hourOfDay >= 6 && hourOfDay < 18;
    const activityBase = isDay ? 8 : 2;
    let activity = activityBase + rand(-5, 5);
    // 간헐적 피크
    if (Math.random() < 0.02) {
      activity = rand(15, 25);
    }
    activity = clamp(activity, 0, 30);

    // 발정지수: 대부분 0, 이벤트 시 상승
    let heatIndex = 0;
    if (i >= heatStartIdx && i < heatStartIdx + heatDuration) {
      const progress = (i - heatStartIdx) / heatDuration;
      if (progress < 0.3) heatIndex = progress / 0.3 * 8;
      else if (progress < 0.5) heatIndex = 8 + (progress - 0.3) / 0.2 * 2; // peak 10
      else heatIndex = 10 * (1 - (progress - 0.5) / 0.5);
      heatIndex = clamp(heatIndex, 0, 10);
    }

    // 반추: 24h 사인파 300~650분, 밤에 높고 낮에 낮음
    const ruminationBase = 475 + 175 * Math.sin((2 * Math.PI * (hour - 6)) / 24);
    const rumination = clamp(ruminationBase + rand(-30, 30), 200, 700);

    // 분만지수: 전부 0
    const calvingIndex = 0;

    // 음수량: 24h 계단형
    const waterIntake = dailyWater[dayIndex] ?? 70;

    points.push({
      timestamp: ts.toISOString(),
      temperature: Number(temperature.toFixed(2)),
      normalTemp: Number(normalTemp.toFixed(2)),
      activity: Number(activity.toFixed(2)),
      heatIndex: Number(heatIndex.toFixed(2)),
      rumination: Number(rumination.toFixed(2)),
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
