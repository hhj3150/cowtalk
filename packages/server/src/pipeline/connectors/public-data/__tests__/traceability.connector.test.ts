import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TraceabilityConnector } from '../traceability.connector.js';

// ekape-client 모듈을 모킹
vi.mock('../ekape-client.js', () => ({
  ekapeGet: vi.fn(),
  extractItems: vi.fn(),
}));

// config 모듈을 모킹
vi.mock('../../../../config/index.js', () => ({
  config: { PUBLIC_DATA_API_KEY: 'test-key-for-unit-test' },
}));

vi.mock('../../../../lib/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

import { ekapeGet, extractItems } from '../ekape-client.js';

const mockEkapeGet = vi.mocked(ekapeGet);
const mockExtractItems = vi.mocked(extractItems);

describe('TraceabilityConnector', () => {
  let connector: TraceabilityConnector;

  beforeEach(() => {
    vi.clearAllMocks();
    connector = new TraceabilityConnector();
  });

  describe('connect()', () => {
    it('API 키가 있으면 connected 상태', async () => {
      await connector.connect();
      expect(connector.getStatus()).toBe('connected');
    });
  });

  describe('fetchByTraceId()', () => {
    const TRACE_ID = '002132665191';

    it('optionNo 1,2,5,7 4개 병렬 호출', async () => {
      await connector.connect();

      // 4개 호출 모두 성공 시나리오
      mockEkapeGet.mockResolvedValue({
        resultCode: '00',
        resultMsg: 'NORMAL SERVICE.',
        body: { items: { item: [] } },
        raw: {},
      });

      // optionNo=1 기본정보 반환
      mockExtractItems
        .mockReturnValueOnce([{
          cattleNo: '410002132665191',
          birthYmd: '20180703',
          sexNm: '암',
          lsTypeNm: '젖소',
          farmNo: '481892',
          farmUniqueNo: '107974',
        }])
        // optionNo=2 이동이력
        .mockReturnValueOnce([
          { regYmd: '20180703', farmAddr: '경기도 포천시', regType: '전산등록', farmerNm: '김종산' },
          { regYmd: '20250403', farmAddr: '경기도 포천시', regType: '양수', farmerNm: '김범태' },
        ])
        // optionNo=5 백신
        .mockReturnValueOnce([
          { injectionYmd: '20260305', vaccineorder: '15차', injectiondayCnt: '접종 후 20일 경과' },
        ])
        // optionNo=7 방역검사
        .mockReturnValueOnce([
          { inspectDt: '20240319', inspectYn: '음성', tbcInspctYmd: '20250404', tbcInspctRsltNm: '음성' },
        ]);

      const result = await connector.fetchByTraceId(TRACE_ID);

      // 4번 호출 확인
      expect(mockEkapeGet).toHaveBeenCalledTimes(4);

      // optionNo 파라미터 검증
      expect(mockEkapeGet).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ traceNo: TRACE_ID, optionNo: '1' }),
        'Trace-Basic',
      );
      expect(mockEkapeGet).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ optionNo: '5' }),
        'Trace-Vaccine',
      );

      expect(result).not.toBeNull();

      // 기본정보
      expect(result!.birthDate).toBe('2018-07-03');
      expect(result!.sex).toBe('암');
      expect(result!.breed).toBe('젖소');
      expect(result!.farmUniqueNo).toBe('107974');

      // 이동이력 2건
      expect(result!.movements).toHaveLength(2);
      expect(result!.movements[0]!.reason).toBe('전산등록');
      expect(result!.movements[1]!.farmerName).toBe('김범태');

      // 백신 1건
      expect(result!.vaccinations).toHaveLength(1);
      expect(result!.vaccinations[0]!.date).toBe('2026-03-05');
      expect(result!.vaccinations[0]!.order).toBe('15차');

      // 방역검사 1건
      expect(result!.inspections).toHaveLength(1);
      expect(result!.inspections[0]!.result).toBe('음성');
      expect(result!.inspections[0]!.tbcResult).toBe('음성');
    });

    it('기본정보 없으면 fallback (fetchByCattleApi) 호출', async () => {
      await connector.connect();

      // 기본정보 비어있음 → fallback 경로
      mockEkapeGet.mockResolvedValue({
        resultCode: '00',
        resultMsg: 'NORMAL SERVICE.',
        body: { items: { item: [] } },
        raw: {},
      });
      mockExtractItems
        .mockReturnValueOnce([]) // optionNo=1 비어있음
        .mockReturnValueOnce([]) // optionNo=2
        .mockReturnValueOnce([]) // optionNo=5
        .mockReturnValueOnce([]) // optionNo=7
        .mockReturnValueOnce([]) // fallback cattle
        .mockReturnValueOnce([]) // fallback cattleMove
        .mockReturnValueOnce([]) // fallback vaccine
        .mockReturnValueOnce([]); // fallback inspect

      const result = await connector.fetchByTraceId(TRACE_ID);
      expect(result).toBeNull();

      // 4번(병렬) + 4번(fallback: cattle+move+vaccine+inspect) = 총 8번 호출
      expect(mockEkapeGet).toHaveBeenCalledTimes(8);
    });

    it('API 키 없으면 null 반환', async () => {
      // 키 없는 커넥터
      const { config: mockConfig } = await import('../../../../config/index.js');
      const original = mockConfig.PUBLIC_DATA_API_KEY;
      (mockConfig as Record<string, unknown>).PUBLIC_DATA_API_KEY = '';

      const result = await connector.fetchByTraceId(TRACE_ID);
      expect(result).toBeNull();
      expect(mockEkapeGet).not.toHaveBeenCalled();

      (mockConfig as Record<string, unknown>).PUBLIC_DATA_API_KEY = original;
    });

    it('일부 optionNo 실패해도 나머지 데이터로 프로필 생성', async () => {
      await connector.connect();

      // optionNo=1 성공, optionNo=2 실패, optionNo=5,7 성공
      mockEkapeGet
        .mockResolvedValueOnce({ resultCode: '00', resultMsg: 'OK', body: {}, raw: {} })
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce({ resultCode: '00', resultMsg: 'OK', body: {}, raw: {} })
        .mockResolvedValueOnce({ resultCode: '00', resultMsg: 'OK', body: {}, raw: {} });

      mockExtractItems
        .mockReturnValueOnce([{ cattleNo: '410002132665191', birthYmd: '20180703', sexNm: '암', lsTypeNm: '젖소', farmNo: '481892', farmUniqueNo: '107974' }])
        .mockReturnValueOnce([{ injectionYmd: '20260305', vaccineorder: '15차', injectiondayCnt: '접종 후 20일' }])
        .mockReturnValueOnce([{ inspectDt: '20240319', inspectYn: '음성', tbcInspctYmd: '20250404', tbcInspctRsltNm: '음성' }]);

      const result = await connector.fetchByTraceId(TRACE_ID);

      expect(result).not.toBeNull();
      expect(result!.movements).toHaveLength(0); // 이동이력은 실패했으므로 빈 배열
      expect(result!.vaccinations).toHaveLength(1); // 백신은 성공
      expect(result!.inspections).toHaveLength(1); // 방역도 성공
    });
  });

  describe('fmtDate()', () => {
    it('YYYYMMDD를 YYYY-MM-DD로 변환', async () => {
      await connector.connect();

      mockEkapeGet.mockResolvedValue({ resultCode: '00', resultMsg: 'OK', body: {}, raw: {} });
      mockExtractItems
        .mockReturnValueOnce([{ cattleNo: '410001234567890', birthYmd: '20200115', sexNm: '수', lsTypeNm: '한우', farmNo: '123', farmUniqueNo: '456' }])
        .mockReturnValueOnce([])
        .mockReturnValueOnce([])
        .mockReturnValueOnce([]);

      const result = await connector.fetchByTraceId('001234567890');
      expect(result!.birthDate).toBe('2020-01-15');
    });
  });
});
