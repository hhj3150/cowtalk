// 축산물이력추적 커넥터 — 소 이력번호, 이동이력, 도축정보
// API: 축산물이력추적시스템 (data.go.kr)

import { AbstractConnector } from '../base.connector.js';
import type { ConnectorConfig, FetchResult } from '../base.connector.js';
import { config } from '../../../config/index.js';
import { logger } from '../../../lib/logger.js';
import { ekapeGet, extractItems } from './ekape-client.js';

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
  // 축산물통합이력정보 (구독 완료) — data.go.kr ID: 15058923
  private readonly apiBase = 'http://data.ekape.or.kr/openapi-data/service/user/animalTrace/traceNoSearch';

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

  /**
   * 특정 이력번호로 단건 조회
   * API 1) 축산물통합이력정보: traceNoSearch (optionNo=9 전체조회)
   * API 3) 쇠고기이력정보: cattle (개체상세) + cattleMove (이동이력)
   */
  async fetchByTraceId(traceId: string): Promise<TraceabilityRecord | null> {
    if (!config.PUBLIC_DATA_API_KEY) {
      logger.warn('[Traceability] No API key — skipping trace lookup');
      return null;
    }

    try {
      // 1차: 축산물통합이력정보 (optionNo=9: 전체)
      const integ = await ekapeGet(
        this.apiBase,
        { traceNo: traceId, optionNo: '9' },
        'Traceability-Integrated',
      );

      const items = extractItems(integ.body);
      const item = items[0];

      if (!item) {
        // 2차 fallback: 쇠고기이력정보 cattle
        return this.fetchByCattleApi(traceId);
      }

      return this.parseItem(item, traceId);
    } catch (error) {
      logger.error({ err: error, traceId }, '[Traceability] Fetch failed');
      return null;
    }
  }

  /** 쇠고기이력정보 API (15056898) — 개체정보 + 이동정보 */
  private async fetchByCattleApi(traceId: string): Promise<TraceabilityRecord | null> {
    const cattleUrl = 'http://data.ekape.or.kr/openapi-data/service/user/mtrace/breeding/cattle';
    const moveUrl = 'http://data.ekape.or.kr/openapi-data/service/user/mtrace/breeding/cattleMove';

    const [cattleRes, moveRes] = await Promise.allSettled([
      ekapeGet(cattleUrl, { cattleNo: traceId }, 'Traceability-Cattle'),
      ekapeGet(moveUrl, { cattleNo: traceId }, 'Traceability-CattleMove'),
    ]);

    const cattleItems = cattleRes.status === 'fulfilled' ? extractItems(cattleRes.value.body) : [];
    const moveItems = moveRes.status === 'fulfilled' ? extractItems(moveRes.value.body) : [];

    const item = cattleItems[0];
    if (!item) return null;

    const movements: MovementRecord[] = moveItems.map((m) => ({
      date: this.fmtDate(String(m.moveYmd ?? m.occrYmd ?? '')),
      fromFarm: String(m.fromFarmNo ?? m.befFarmAddr ?? ''),
      toFarm: String(m.toFarmNo ?? m.farmAddr ?? ''),
      reason: this.moveReasonLabel(String(m.moveType ?? m.movePurps ?? '')),
    }));

    return {
      traceId: String(item.cattleNo ?? traceId),
      earTag: String(item.earTagNo ?? ''),
      birthDate: this.fmtDate(String(item.birthYmd ?? '')),
      sex: this.sexLabel(String(item.sexCd ?? item.sexNm ?? '')),
      breed: this.breedLabel(String(item.lsTypeCd ?? item.lsTypeNm ?? '')),
      farmId: String(item.farmNo ?? ''),
      farmName: String(item.farmNm ?? ''),
      farmAddress: String(item.farmAddr ?? ''),
      movements,
      slaughterInfo: null,
    };
  }

  /** API 응답 item → TraceabilityRecord 변환 */
  private parseItem(item: Record<string, unknown>, traceId: string): TraceabilityRecord {
    // 이동이력
    const rawMove = item.moveList ?? item.moves;
    const moveArr: Record<string, unknown>[] = Array.isArray(rawMove)
      ? rawMove as Record<string, unknown>[]
      : rawMove != null ? [rawMove as Record<string, unknown>] : [];

    const movements: MovementRecord[] = moveArr.map((m) => ({
      date: this.fmtDate(String(m.moveYmd ?? m.occrYmd ?? '')),
      fromFarm: String(m.fromFarmNo ?? m.befFarmAddr ?? ''),
      toFarm: String(m.toFarmNo ?? m.farmAddr ?? ''),
      reason: this.moveReasonLabel(String(m.movePurps ?? m.moveType ?? '')),
    }));

    // 도축정보
    const rawSlaughter = item.slaughterList ?? item.slaughterInfo;
    const slaughterArr: Record<string, unknown>[] = Array.isArray(rawSlaughter)
      ? rawSlaughter as Record<string, unknown>[]
      : rawSlaughter != null ? [rawSlaughter as Record<string, unknown>] : [];

    const slaughterInfo: SlaughterInfo | null = slaughterArr.length > 0
      ? {
          date: this.fmtDate(String(slaughterArr[0]!.slaughterYmd ?? slaughterArr[0]!.date ?? '')),
          facility: String(slaughterArr[0]!.slaughterPlaceNm ?? slaughterArr[0]!.facility ?? ''),
          grade: String(slaughterArr[0]!.gradeNm ?? slaughterArr[0]!.grade ?? '') || null,
          weight: Number(slaughterArr[0]!.weight ?? 0) || null,
        }
      : null;

    return {
      traceId: String(item.traceNo ?? item.cattleNo ?? traceId),
      earTag: String(item.earTagNo ?? item.earTag ?? ''),
      birthDate: this.fmtDate(String(item.birthYmd ?? item.birthDate ?? '')),
      sex: this.sexLabel(String(item.sexCd ?? item.sexNm ?? item.gender ?? '')),
      breed: this.breedLabel(String(item.lsTypeCd ?? item.lsTypeNm ?? item.lsType ?? '')),
      farmId: String(item.farmNo ?? item.farmId ?? ''),
      farmName: String(item.farmNm ?? item.farmName ?? ''),
      farmAddress: String(item.farmAddr ?? item.farmAddress ?? ''),
      movements,
      slaughterInfo,
    };
  }

  /** YYYYMMDD → YYYY-MM-DD */
  private fmtDate(raw: string): string {
    const s = raw.replace(/\D/g, '');
    if (s.length === 8) return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
    return raw;
  }

  /** 성별 코드 → 한글 */
  private sexLabel(code: string): string {
    const map: Record<string, string> = { '1': '수', '2': '암', 'M': '수', 'F': '암' };
    return map[code] ?? code;
  }

  /** 가축종류 코드 → 한글 */
  private breedLabel(code: string): string {
    const map: Record<string, string> = { '1': '한우', '2': '젖소', '3': '육우', '4': '교잡우' };
    return map[code] ?? code;
  }

  /** 이동 목적 코드 → 한글 */
  private moveReasonLabel(code: string): string {
    const map: Record<string, string> = {
      '1': '출생', '2': '구입', '3': '판매', '4': '도축출하',
      '5': '폐사', '6': '수출', '7': '기타',
    };
    return map[code] ?? code;
  }

  async disconnect(): Promise<void> {
    this.status = 'disconnected';
  }
}
