// 사료성분DB — stub

import { AbstractConnector } from '../base.connector.js';
import type { ConnectorConfig, FetchResult } from '../base.connector.js';
import { logger } from '../../../lib/logger.js';

export interface FeedRecord {
  readonly feedId: string;
  readonly feedName: string;
  readonly tdn: number;
  readonly cp: number;
  readonly ndf: number;
}

export const FEED_DB_CONFIG: ConnectorConfig = {
  id: 'feed-db',
  name: '사료성분DB',
  enabled: false,
  syncIntervalMs: 7 * 24 * 60 * 60 * 1000,
  retryCount: 3,
  retryDelayMs: 5000,
};

export class FeedDBConnector extends AbstractConnector<FeedRecord> {
  constructor() { super(FEED_DB_CONFIG); }
  async connect(): Promise<void> { logger.info('[FeedDB] Stub — not implemented'); this.status = 'disconnected'; }
  async fetch(): Promise<FetchResult<FeedRecord>> { return { data: [], count: 0, fetchedAt: new Date(), hasMore: false }; }
  async disconnect(): Promise<void> { this.status = 'disconnected'; }
}
