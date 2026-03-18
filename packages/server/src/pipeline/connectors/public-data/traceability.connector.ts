// 축산물이력추적 커넥터 — 소 이력번호, 이동이력, 도축정보
// API: 축산물이력추적시스템 (data.go.kr)

import { AbstractConnector } from '../base.connector.js';
import type { ConnectorConfig, FetchResult } from '../base.connector.js';
import { config } from '../../../config/index.js';
import { logger } from '../../../lib/logger.js';

export interface TraceabilityRecord {
  readonly traceId: string;        // 이력번호 (12자리)
  readonly earTag: string;          // 귀표번호
  readonly birthDate: string;
  readonly sex: string;
  readonly breed: string;
  readonly farmId: string;          // 농장 식별번호
  readonly farmName: string;
  readonly farmAddress: string;
  readonly movements: readonly MovementRecord[];
  readonly slaughterInfo: SlaughterInfo | null;
}

export interface MovementRecord {
  readonly date: string;
  readonly fromFarm: string;
  readonly toFarm: string;
  readonly reason: string;
}

export interface SlaughterInfo {
  readonly date: string;
  readonly facility: string;
  readonly grade: string | null;
  readonly weight: number | null;
}

export const TRACEABILITY_CONFIG: ConnectorConfig = {
  id: 'traceability',
  name: '축산물이력추적',
  enabled: true,
  syncIntervalMs: 24 * 60 * 60 * 1000, // 1일 1회
  retryCount: 3,
  retryDelayMs: 5000,
};

export class TraceabilityConnector extends AbstractConnector<TraceabilityRecord> {
  private readonly apiBase = 'https://data.ekape.or.kr/openapi-data/rest';

  constructor(connectorConfig: ConnectorConfig = TRACEABILITY_CONFIG) {
    super(connectorConfig);
  }

  async connect(): Promise<void> {
    const apiKey = config.PUBLIC_DATA_API_KEY;
    if (!apiKey) {
      logger.warn('[Traceability] No API key — connector disabled');
      this.status = 'disconnected';
      return;
    }
    this.status = 'connected';
    logger.info('[Traceability] Ready');
  }

  async fetch(since?: Date): Promise<FetchResult<TraceabilityRecord>> {
    return this.fetchWithRetry(async () => {
      const apiKey = config.PUBLIC_DATA_API_KEY;
      if (!apiKey) {
        return { data: [], count: 0, fetchedAt: new Date(), hasMore: false };
      }

      // 실제 API 호출은 운영 환경에서 구현
      // 현재는 빈 결과 반환 (API 키 + 엔드포인트 준비 완료)
      logger.info({ since }, '[Traceability] Fetching records');

      return {
        data: [],
        count: 0,
        fetchedAt: new Date(),
        hasMore: false,
      };
    });
  }

  /** 특정 이력번호로 단건 조회 */
  async fetchByTraceId(traceId: string): Promise<TraceabilityRecord | null> {
    const apiKey = config.PUBLIC_DATA_API_KEY;
    if (!apiKey) return null;

    try {
      const url = `${this.apiBase}/cattleTrace/cattleTraceInfo?serviceKey=${apiKey}&traceNo=${traceId}&_type=json`;
      const res = await fetch(url);
      if (!res.ok) return null;

      const data = (await res.json()) as Record<string, unknown>;
      // 실제 응답 파싱은 운영 환경에서 구현
      logger.debug({ traceId }, '[Traceability] Fetched single record');
      return data as unknown as TraceabilityRecord;
    } catch (error) {
      logger.error({ err: error, traceId }, '[Traceability] Fetch failed');
      return null;
    }
  }

  async disconnect(): Promise<void> {
    this.status = 'disconnected';
  }
}
