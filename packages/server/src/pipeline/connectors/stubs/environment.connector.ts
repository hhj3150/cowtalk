// 축사환경관리시스템 — stub

import { AbstractConnector } from '../base.connector.js';
import type { ConnectorConfig, FetchResult } from '../base.connector.js';
import { logger } from '../../../lib/logger.js';

export interface BarnEnvironmentRecord {
  readonly barnId: string;
  readonly farmId: string;
  readonly temperature: number;
  readonly humidity: number;
  readonly co2: number;
  readonly ammonia: number;
  readonly measuredAt: string;
}

export const ENVIRONMENT_CONFIG: ConnectorConfig = {
  id: 'barn-environment',
  name: '축사환경관리시스템',
  enabled: false,
  syncIntervalMs: 30 * 60 * 1000,
  retryCount: 3,
  retryDelayMs: 3000,
};

export class EnvironmentConnector extends AbstractConnector<BarnEnvironmentRecord> {
  constructor() { super(ENVIRONMENT_CONFIG); }
  async connect(): Promise<void> { logger.info('[BarnEnvironment] Stub — not implemented'); this.status = 'disconnected'; }
  async fetch(): Promise<FetchResult<BarnEnvironmentRecord>> { return { data: [], count: 0, fetchedAt: new Date(), hasMore: false }; }
  async disconnect(): Promise<void> { this.status = 'disconnected'; }
}
