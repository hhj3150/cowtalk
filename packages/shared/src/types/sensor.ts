// 센서 데이터 + 디바이스

import type { DataQuality } from './common';

export type MetricType =
  | 'temperature'
  | 'activity'
  | 'rumination'
  | 'water_intake'
  | 'ph';

export type DeviceType = 'smaxtec_bolus' | 'ear_tag' | 'collar' | 'other';

export type DeviceStatus = 'active' | 'inactive' | 'faulty' | 'removed';

export interface SensorDevice {
  readonly deviceId: string;
  readonly externalId: string | null;  // smaXtec device ID
  readonly animalId: string;
  readonly deviceType: DeviceType;
  readonly installDate: Date;
  readonly removeDate: Date | null;
  readonly status: DeviceStatus;
}

export interface SensorMeasurement {
  readonly animalId: string;
  readonly timestamp: Date;
  readonly metricType: MetricType;
  readonly value: number;
  readonly qualityFlag: 'good' | 'suspect' | 'bad';
}

export interface SensorHourlyAgg {
  readonly animalId: string;
  readonly hour: Date;            // bucket (시간 시작)
  readonly metricType: MetricType;
  readonly avg: number;
  readonly min: number;
  readonly max: number;
  readonly stddev: number;
  readonly count: number;
}

export interface SensorDailyAgg {
  readonly animalId: string;
  readonly date: Date;
  readonly metricType: MetricType;
  readonly avg: number;
  readonly min: number;
  readonly max: number;
  readonly stddev: number;
  readonly count: number;
}

// 피처 스토어
export interface AnimalFeatures {
  readonly animalId: string;
  readonly timestamp: Date;
  readonly temperature: SensorFeatureSet;
  readonly activity: SensorFeatureSet;
  readonly rumination: SensorFeatureSet;
  readonly waterIntake: SensorFeatureSet;
  readonly ph: SensorFeatureSet;
  readonly estrusSignatureScore: number;
  readonly diseaseSignatureScore: number;
  readonly dataQuality: DataQuality;
}

export interface SensorFeatureSet {
  readonly current: number;
  readonly baseline: number;        // 7일 이동평균
  readonly deviation: number;       // 기준선 대비 편차
  readonly zScore: number;          // 표준화 점수
  readonly trend: 'rising' | 'falling' | 'stable';
  readonly circadianDeviation: number; // 일주기 대비 편차
}

export interface FeatureDefinition {
  readonly featureId: string;
  readonly name: string;
  readonly description: string;
  readonly source: MetricType | 'derived';
  readonly calculation: string;
  readonly engineUsage: readonly string[]; // 어떤 엔진이 사용하는지
  readonly version: string;
}

export interface SensorReading {
  readonly metricType: MetricType;
  readonly value: number;
  readonly timestamp: Date;
}

// 센서 정상 범위 (v4 이식)
export interface SensorNormalRange {
  readonly metricType: MetricType;
  readonly min: number;
  readonly max: number;
  readonly unit: string;
}
