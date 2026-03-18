// 정액카탈로그 — stub

import { AbstractConnector } from '../base.connector.js';
import type { ConnectorConfig, FetchResult } from '../base.connector.js';
import { logger } from '../../../lib/logger.js';

export interface SemenRecord {
  readonly semenId: string;
  readonly bullName: string;
  readonly breed: string;
  readonly traits: Record<string, number>;
}

export const SEMEN_CATALOG_CONFIG: ConnectorConfig = {
  id: 'semen-catalog',
  name: '정액카탈로그',
  enabled: false,
  syncIntervalMs: 7 * 24 * 60 * 60 * 1000,
  retryCount: 3,
  retryDelayMs: 5000,
};

export class SemenCatalogConnector extends AbstractConnector<SemenRecord> {
  constructor() { super(SEMEN_CATALOG_CONFIG); }
  async connect(): Promise<void> { logger.info('[SemenCatalog] Stub — not implemented'); this.status = 'disconnected'; }
  async fetch(): Promise<FetchResult<SemenRecord>> { return { data: [], count: 0, fetchedAt: new Date(), hasMore: false }; }
  async disconnect(): Promise<void> { this.status = 'disconnected'; }
}
