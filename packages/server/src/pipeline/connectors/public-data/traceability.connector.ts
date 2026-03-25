// 축산물이력추적 커넥터 — 소 이력번호, 이동이력, 도축정보, 백신접종, 방역검사
// API: 축산물이력추적시스템 (data.go.kr)
// optionNo: 1=기본정보, 2=이동이력, 3=도축정보, 4=포장처리,
//           5=백신접종, 6=부위별가격, 7=방역검사, 8=농장명, 9=전체

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
  readonly farmUniqueNo: string;    // 농장 고유번호
  readonly farmName: string;
  readonly farmAddress: string;
  readonly movements: readonly MovementRecord[];
  readonly slaughterInfo: SlaughterInfo | null;
  readonly vaccinations: readonly VaccinationRecord[];
  readonly inspections: readonly InspectionRecord[];
}

export interface MovementRecord {
  readonly date: string;
  readonly fromFarm: string;
  readonly toFarm: string;
  readonly reason: string;
  readonly farmerName: string;
}

export interface SlaughterInfo {
  readonly date: string;
  readonly facility: string;
  readonly grade: string | null;
  readonly weight: number | null;
}

export interface VaccinationRecord {
  readonly date: string;           // 접종일 (YYYY-MM-DD)
  readonly order: string;          // 접종 차수 (예: "15차")
  readonly daysSince: string;      // 경과일 (예: "접종 후 20일 경과")
}

export interface InspectionRecord {
  readonly inspectDate: string;       // 검사일 (브루셀라)
  readonly result: string;            // 결과 (음성/양성)
  readonly tbcInspectDate: string;    // 결핵 검사일
  readonly tbcResult: string;         // 결핵 결과 (음성/양성)
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
   * 특정 이력번호로 종합 조회
   * optionNo 1(기본) + 2(이동) + 5(백신) + 7(방역) 병렬 호출
   * 하나의 API로 개체의 전체 이력을 조합한다.
   */
  async fetchByTraceId(traceId: string): Promise<TraceabilityRecord | null> {
    if (!config.PUBLIC_DATA_API_KEY) {
      logger.warn('[Traceability] No API key — skipping trace lookup');
      return null;
    }

    try {
      // 4개 optionNo를 병렬 호출하여 풍부한 프로필 생성
      const [basicRes, moveRes, vaccineRes, inspectRes] = await Promise.allSettled([
        ekapeGet(this.apiBase, { traceNo: traceId, optionNo: '1' }, 'Trace-Basic'),
        ekapeGet(this.apiBase, { traceNo: traceId, optionNo: '2' }, 'Trace-Move'),
        ekapeGet(this.apiBase, { traceNo: traceId, optionNo: '5' }, 'Trace-Vaccine'),
        ekapeGet(this.apiBase, { traceNo: traceId, optionNo: '7' }, 'Trace-Inspect'),
      ]);

      const basicItems = basicRes.status === 'fulfilled' ? extractItems(basicRes.value.body) : [];
      const moveItems = moveRes.status === 'fulfilled' ? extractItems(moveRes.value.body) : [];
      const vaccineItems = vaccineRes.status === 'fulfilled' ? extractItems(vaccineRes.value.body) : [];
      const inspectItems = inspectRes.status === 'fulfilled' ? extractItems(inspectRes.value.body) : [];

      const basic = basicItems[0];
      if (!basic) {
        // 기본정보 없으면 fallback: 쇠고기이력정보 cattle API
        return this.fetchByCattleApi(traceId);
      }

      // 이동이력 조합
      const movements: readonly MovementRecord[] = moveItems.map((m) => ({
        date: this.fmtDate(String(m.regYmd ?? m.moveYmd ?? '')),
        fromFarm: '',
        toFarm: String(m.farmAddr ?? ''),
        reason: String(m.regType ?? ''),
        farmerName: String(m.farmerNm ?? ''),
      }));

      // 백신접종 이력 조합
      const vaccinations: readonly VaccinationRecord[] = vaccineItems.map((v) => ({
        date: this.fmtDate(String(v.injectionYmd ?? '')),
        order: String(v.vaccineorder ?? ''),
        daysSince: String(v.injectiondayCnt ?? ''),
      }));

      // 방역검사 결과 조합
      const inspections: readonly InspectionRecord[] = inspectItems.map((i) => ({
        inspectDate: this.fmtDate(String(i.inspectDt ?? '')),
        result: String(i.inspectYn ?? ''),
        tbcInspectDate: this.fmtDate(String(i.tbcInspctYmd ?? '')),
        tbcResult: String(i.tbcInspctRsltNm ?? ''),
      }));

      logger.info(
        { traceId, moves: movements.length, vaccines: vaccinations.length, inspects: inspections.length },
        '[Traceability] Profile assembled',
      );

      return {
        traceId: String(basic.cattleNo ?? traceId).replace(/^410/, ''),
        earTag: '',
        birthDate: this.fmtDate(String(basic.birthYmd ?? '')),
        sex: this.sexLabel(String(basic.sexNm ?? basic.sexCd ?? '')),
        breed: this.breedLabel(String(basic.lsTypeNm ?? basic.lsTypeCd ?? '')),
        farmId: String(basic.farmNo ?? ''),
        farmUniqueNo: String(basic.farmUniqueNo ?? ''),
        farmName: '',
        farmAddress: '',
        movements,
        slaughterInfo: null,
        vaccinations,
        inspections,
      };
    } catch (error) {
      logger.error({ err: error, traceId }, '[Traceability] Fetch failed');
      return null;
    }
  }

  /** 쇠고기이력정보 API (15056898) — 개체정보 + 이동정보 + 백신 + 방역 */
  private async fetchByCattleApi(traceId: string): Promise<TraceabilityRecord | null> {
    const cattleUrl = 'http://data.ekape.or.kr/openapi-data/service/user/mtrace/breeding/cattle';
    const moveUrl = 'http://data.ekape.or.kr/openapi-data/service/user/mtrace/breeding/cattleMove';

    // 개체정보 + 이동 + 백신(optionNo=5) + 방역(optionNo=7) 병렬 호출
    const [cattleRes, moveRes, vaccineRes, inspectRes] = await Promise.allSettled([
      ekapeGet(cattleUrl, { cattleNo: traceId }, 'Traceability-Cattle'),
      ekapeGet(moveUrl, { cattleNo: traceId }, 'Traceability-CattleMove'),
      ekapeGet(this.apiBase, { traceNo: traceId, optionNo: '5' }, 'Trace-Vaccine-Fallback'),
      ekapeGet(this.apiBase, { traceNo: traceId, optionNo: '7' }, 'Trace-Inspect-Fallback'),
    ]);

    const cattleItems = cattleRes.status === 'fulfilled' ? extractItems(cattleRes.value.body) : [];
    const moveItems = moveRes.status === 'fulfilled' ? extractItems(moveRes.value.body) : [];
    const vaccineItems = vaccineRes.status === 'fulfilled' ? extractItems(vaccineRes.value.body) : [];
    const inspectItems = inspectRes.status === 'fulfilled' ? extractItems(inspectRes.value.body) : [];

    const item = cattleItems[0];
    if (!item) return null;

    const movements: MovementRecord[] = moveItems.map((m) => ({
      date: this.fmtDate(String(m.moveYmd ?? m.occrYmd ?? '')),
      fromFarm: String(m.fromFarmNo ?? m.befFarmAddr ?? ''),
      toFarm: String(m.toFarmNo ?? m.farmAddr ?? ''),
      reason: this.moveReasonLabel(String(m.moveType ?? m.movePurps ?? '')),
      farmerName: String(m.farmerNm ?? ''),
    }));

    const vaccinations: readonly VaccinationRecord[] = vaccineItems.map((v) => ({
      date: this.fmtDate(String(v.injectionYmd ?? '')),
      order: String(v.vaccineorder ?? ''),
      daysSince: String(v.injectiondayCnt ?? ''),
    }));

    const inspections: readonly InspectionRecord[] = inspectItems.map((i) => ({
      inspectDate: this.fmtDate(String(i.inspectDt ?? '')),
      result: String(i.inspectYn ?? ''),
      tbcInspectDate: this.fmtDate(String(i.tbcInspctYmd ?? '')),
      tbcResult: String(i.tbcInspctRsltNm ?? ''),
    }));

    logger.info(
      { traceId, vaccines: vaccinations.length, inspects: inspections.length },
      '[Traceability] Cattle API fallback — vaccine/inspect assembled',
    );

    return {
      traceId: String(item.cattleNo ?? traceId),
      earTag: String(item.earTagNo ?? ''),
      birthDate: this.fmtDate(String(item.birthYmd ?? '')),
      sex: this.sexLabel(String(item.sexCd ?? item.sexNm ?? '')),
      breed: this.breedLabel(String(item.lsTypeCd ?? item.lsTypeNm ?? '')),
      farmId: String(item.farmNo ?? ''),
      farmUniqueNo: '',
      farmName: String(item.farmNm ?? ''),
      farmAddress: String(item.farmAddr ?? ''),
      movements,
      slaughterInfo: null,
      vaccinations,
      inspections,
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
