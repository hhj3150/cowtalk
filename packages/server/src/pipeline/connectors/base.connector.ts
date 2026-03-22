// 커넥터 기본 인터페이스 + 재시도 유틸리티

import type { ConnectorStatus, ConnectorHealth } from '@cowtalk/shared';
import { logger } from '../../lib/logger.js';

// ===========================
// 커넥터 인터페이스
// ===========================

export interface ConnectorConfig {
  readonly id: string;
  readonly name: string;
  readonly enabled: boolean;
  readonly syncIntervalMs: number; // 동기화 주기 (ms)
  readonly retryCount: number;
  readonly retryDelayMs: number; // 기본 재시도 대기 (exponential backoff)
}

export interface FetchResult<T> {
  readonly data: readonly T[];
  readonly count: number;
  readonly fetchedAt: Date;
  readonly hasMore: boolean;
}

export interface BaseConnector<T = unknown> {
  readonly config: ConnectorConfig;

  /** 연결 초기화 (인증 등) */
  connect(): Promise<void>;

  /** 데이터 수신 */
  fetch(since?: Date): Promise<FetchResult<T>>;

  /** 연결 상태 확인 */
  healthCheck(): Promise<ConnectorHealth>;

  /** 마지막 동기화 시각 */
  getLastSyncTime(): Promise<Date | null>;

  /** 연결 종료 */
  disconnect(): Promise<void>;
}

// ===========================
// 재시도 유틸리티 (exponential backoff)
// ===========================

export async function withRetry<T>(
  fn: () => Promise<T>,
  options: {
    readonly retries: number;
    readonly delayMs: number;
    readonly label: string;
  },
): Promise<T> {
  let lastError: Error | undefined;

  for (let attempt = 1; attempt <= options.retries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      const delay = options.delayMs * Math.pow(2, attempt - 1);

      logger.warn(
        { attempt, maxRetries: options.retries, delay, label: options.label },
        `Retry ${String(attempt)}/${String(options.retries)} for ${options.label}`,
      );

      if (attempt < options.retries) {
        await sleep(delay);
      }
    }
  }

  throw lastError ?? new Error(`All ${String(options.retries)} retries failed for ${options.label}`);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ===========================
// 추상 기본 클래스
// ===========================

export abstract class AbstractConnector<T = unknown> implements BaseConnector<T> {
  readonly config: ConnectorConfig;
  protected status: ConnectorStatus = 'disconnected';
  protected lastSyncAt: Date | null = null;
  protected lastError: string | null = null;
  protected recordsProcessed = 0;

  constructor(config: ConnectorConfig) {
    this.config = config;
  }

  abstract connect(): Promise<void>;
  abstract fetch(since?: Date): Promise<FetchResult<T>>;
  abstract disconnect(): Promise<void>;

  getStatus(): ConnectorStatus {
    return this.status;
  }

  async healthCheck(): Promise<ConnectorHealth> {
    return {
      connectorId: this.config.id,
      name: this.config.name,
      status: this.status,
      lastSyncAt: this.lastSyncAt,
      lastError: this.lastError,
      recordsProcessed: this.recordsProcessed,
    };
  }

  async getLastSyncTime(): Promise<Date | null> {
    return this.lastSyncAt;
  }

  protected async fetchWithRetry(fn: () => Promise<FetchResult<T>>): Promise<FetchResult<T>> {
    this.status = 'syncing';
    try {
      const result = await withRetry(fn, {
        retries: this.config.retryCount,
        delayMs: this.config.retryDelayMs,
        label: this.config.name,
      });
      this.status = 'connected';
      this.lastSyncAt = new Date();
      this.lastError = null;
      this.recordsProcessed += result.count;
      return result;
    } catch (error) {
      this.status = 'error';
      this.lastError = error instanceof Error ? error.message : String(error);
      throw error;
    }
  }
}
