// 축산물품질평가원 (도체등급) — stub
// 향후 구현 예정: 도체중량, 근내지방, 등급(1++, 1+, 1, 2, 3)

import { AbstractConnector } from '../base.connector.js';
import type { ConnectorConfig, FetchResult } from '../base.connector.js';
import { logger } from '../../../lib/logger.js';

export interface QualityGradeRecord {
  readonly traceId: string;
  readonly gradeDate: string;
  readonly carcassWeight: number;
  readonly marblingScore: number;
  readonly qualityGrade: string;
  readonly yieldGrade: string;
}

export const QUALITY_GRADE_CONFIG: ConnectorConfig = {
  id: 'quality-grade',
  name: '축산물품질평가원',
  enabled: false,
  syncIntervalMs: 24 * 60 * 60 * 1000,
  retryCount: 3,
  retryDelayMs: 5000,
};

export class QualityGradeConnector extends AbstractConnector<QualityGradeRecord> {
  constructor() { super(QUALITY_GRADE_CONFIG); }
  async connect(): Promise<void> { logger.info('[QualityGrade] Stub — not implemented'); this.status = 'disconnected'; }
  async fetch(): Promise<FetchResult<QualityGradeRecord>> { return { data: [], count: 0, fetchedAt: new Date(), hasMore: false }; }
  async disconnect(): Promise<void> { this.status = 'disconnected'; }
}
