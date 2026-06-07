// KAHIS 약물사용 보고 — 제출 커넥터 (stub)
// 실제 KAHIS 연동 전까지 테스트모드로 동작: 페이로드 검증 후 모의 접수번호 발급.
// 향후 실엔드포인트 연결 시 submit()만 교체하면 된다(AbstractConnector 패턴 유지).

import { AbstractConnector } from '../base.connector.js';
import type { ConnectorConfig, FetchResult } from '../base.connector.js';
import { logger } from '../../../lib/logger.js';

export const KAHIS_DRUG_REPORT_CONFIG: ConnectorConfig = {
  id: 'kahis-drug-report',
  name: 'KAHIS 약물사용 보고',
  enabled: false, // 실엔드포인트 미연결 — 테스트모드
  syncIntervalMs: 0,
  retryCount: 3,
  retryDelayMs: 2000,
};

export interface DrugReportSubmitResult {
  readonly accepted: boolean;
  readonly receiptNo: string;
  readonly testMode: boolean;
}

export class KahisDrugReportConnector extends AbstractConnector {
  constructor() { super(KAHIS_DRUG_REPORT_CONFIG); }

  async connect(): Promise<void> { this.status = this.config.enabled ? 'connected' : 'disconnected'; }
  async fetch(): Promise<FetchResult<unknown>> {
    return { data: [], count: 0, fetchedAt: new Date(), hasMore: false };
  }
  async disconnect(): Promise<void> { this.status = 'disconnected'; }

  // 약물사용 보고 제출 — 실연동 시 여기서 KAHIS API 호출.
  async submit(payload: Record<string, unknown>): Promise<DrugReportSubmitResult> {
    if (!this.config.enabled) {
      // 테스트모드: 모의 접수번호 발급(실제 전송 없음)
      const receiptNo = `KAHIS-TEST-${Date.now().toString(36).toUpperCase()}`;
      logger.info({ receiptNo, drug: payload.drug_name }, '[KahisDrugReport] 테스트모드 제출(모의 접수)');
      return { accepted: true, receiptNo, testMode: true };
    }
    // 실연동 자리 (미구현)
    throw new Error('KAHIS 실엔드포인트 미연결');
  }
}

export const kahisDrugReportConnector = new KahisDrugReportConnector();
