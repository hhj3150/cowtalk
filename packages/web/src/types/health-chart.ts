// 건강 모니터링 차트 타입 — API 연동 대비 구조

export interface HealthChartDataPoint {
  readonly timestamp: string; // ISO 8601
  readonly temperature: number; // °C
  readonly normalTemp: number; // °C (정상 체온 기준선)
  readonly activity: number; // 활동량
  readonly heatIndex: number; // 발정지수
  readonly rumination: number; // 반추 min/24h
  readonly calvingIndex: number; // 분만지수
  readonly waterIntake: number; // 음수량 l/24h
}

export interface AnimalChartInfo {
  readonly id: string; // 소 번호
  readonly milkingDay: string; // 착유일
  readonly dic: string; // DIC
  readonly daysSinceHeat: number; // 발정 후 경과일수
  readonly cycles: string; // "23|22" 형식
  readonly lactation: number; // Lact. 번호
}

export type ViewMode = 'all' | 'rumination';
export type PeriodTab = 'day' | 'week' | 'month';

export interface DateRange {
  readonly start: Date;
  readonly end: Date;
}

// 차트 라인 설정
export interface ChartLineConfig {
  readonly key: keyof Omit<HealthChartDataPoint, 'timestamp'>;
  readonly label: string;
  readonly color: string;
  readonly yAxisId: string;
  readonly strokeWidth: number;
  readonly opacity?: number;
  readonly type?: 'monotone' | 'step' | 'stepAfter';
  readonly showInRuminationMode?: boolean;
}

export const CHART_LINES: readonly ChartLineConfig[] = [
  { key: 'temperature', label: '온도 (°C)', color: '#5C6BC0', yAxisId: 'temp', strokeWidth: 1.5 },
  { key: 'normalTemp', label: '정상 체온 (°C)', color: '#9E9E9E', yAxisId: 'temp', strokeWidth: 1, opacity: 0.7 },
  { key: 'activity', label: '활동량', color: '#E91E63', yAxisId: 'activity', strokeWidth: 1 },
  { key: 'heatIndex', label: '발정지수', color: '#FF4081', yAxisId: 'activity', strokeWidth: 1 },
  { key: 'rumination', label: '반추 (min/24h)', color: '#8BC34A', yAxisId: 'rumination', strokeWidth: 2, showInRuminationMode: true },
  { key: 'calvingIndex', label: '분만지수', color: '#FFC107', yAxisId: 'activity', strokeWidth: 1 },
  { key: 'waterIntake', label: '음수량 (l/24h)', color: '#4FC3F7', yAxisId: 'water', strokeWidth: 1.5, type: 'stepAfter', showInRuminationMode: true },
];
