// 보고서 인텐트 감지 테스트

import { describe, it, expect } from 'vitest';
import { detectReportIntent } from '../intentDetector.js';

describe('detectReportIntent', () => {

  describe('보고서 트리거 감지', () => {
    it('보고서 키워드가 없으면 isReport: false를 반환한다', () => {
      const result = detectReportIntent('이 소 건강 상태가 어때?');
      expect(result.isReport).toBe(false);
    });

    it('"보고서" 키워드를 감지한다', () => {
      const result = detectReportIntent('이번 달 건강 보고서 만들어줘');
      expect(result.isReport).toBe(true);
    });

    it('"리포트" 키워드를 감지한다', () => {
      const result = detectReportIntent('번식 리포트 작성해줘');
      expect(result.isReport).toBe(true);
    });

    it('"엑셀로" 키워드를 감지한다', () => {
      const result = detectReportIntent('전체 데이터 엑셀로 정리해줘');
      expect(result.isReport).toBe(true);
    });

    it('"pdf로" 키워드를 감지한다', () => {
      const result = detectReportIntent('월간 분석 pdf로 뽑아줘');
      expect(result.isReport).toBe(true);
    });

    it('"다운로드" 키워드를 감지한다', () => {
      const result = detectReportIntent('이 데이터 다운로드 해줘');
      expect(result.isReport).toBe(true);
    });

    it('대소문자를 구분하지 않는다', () => {
      const result = detectReportIntent('월간 REPORT 만들어줘');
      expect(result.isReport).toBe(true);
    });
  });

  describe('출력 형식 감지', () => {
    it('"엑셀" 키워드 → xlsx 형식', () => {
      const result = detectReportIntent('엑셀 보고서 만들어줘');
      expect(result.format).toBe('xlsx');
    });

    it('"ppt" 키워드 → pptx 형식', () => {
      const result = detectReportIntent('발표용 ppt 보고서 만들어줘');
      expect(result.format).toBe('pptx');
    });

    it('"pdf" 키워드 → pdf 형식', () => {
      const result = detectReportIntent('pdf 보고서 생성해줘');
      expect(result.format).toBe('pdf');
    });

    it('"워드" 키워드 → docx 형식', () => {
      const result = detectReportIntent('워드 보고서 만들어줘');
      expect(result.format).toBe('docx');
    });

    it('형식 명시 없으면 기본값 docx', () => {
      const result = detectReportIntent('보고서 만들어줘');
      expect(result.format).toBe('docx');
    });

    it('"발표" 키워드 → pptx 형식', () => {
      const result = detectReportIntent('발표 자료 보고서 만들어줘');
      expect(result.format).toBe('pptx');
    });
  });

  describe('보고서 유형 감지', () => {
    it('"발정" 키워드 → heat_detection 유형', () => {
      const result = detectReportIntent('발정 보고서 엑셀로 뽑아줘');
      expect(result.reportType).toBe('heat_detection');
    });

    it('"번식" 키워드 → breeding 유형', () => {
      const result = detectReportIntent('번식 성적 보고서 만들어줘');
      expect(result.reportType).toBe('breeding');
    });

    it('"건강" 키워드 → herd_health 유형', () => {
      const result = detectReportIntent('군 건강 보고서 만들어줘');
      expect(result.reportType).toBe('herd_health');
    });

    it('"일일" 키워드 → farm_daily 유형', () => {
      const result = detectReportIntent('오늘 일일 보고서 만들어줘');
      expect(result.reportType).toBe('farm_daily');
    });

    it('"월간" 키워드 → farm_monthly 유형', () => {
      const result = detectReportIntent('이번달 월간 보고서 만들어줘');
      expect(result.reportType).toBe('farm_monthly');
    });

    it('"알람" 키워드 → sensor_alert 유형', () => {
      const result = detectReportIntent('센서 알람 보고서 만들어줘');
      expect(result.reportType).toBe('sensor_alert');
    });

    it('"개체" 키워드 → animal_detail 유형', () => {
      const result = detectReportIntent('개체 상세 보고서 만들어줘');
      expect(result.reportType).toBe('animal_detail');
    });

    it('유형 명시 없으면 기본값 custom', () => {
      const result = detectReportIntent('보고서 만들어줘');
      expect(result.reportType).toBe('custom');
    });
  });

  describe('이력제 번호(12자리) 추출', () => {
    it('메시지에서 12자리 숫자를 추출한다', () => {
      const result = detectReportIntent('002132665191 개체 보고서 만들어줘');
      expect(result.traceNo).toBe('002132665191');
    });

    it('12자리 번호 없으면 traceNo는 null이다', () => {
      const result = detectReportIntent('보고서 만들어줘');
      expect(result.traceNo).toBeNull();
    });

    it('12자리 미만 숫자는 추출하지 않는다', () => {
      const result = detectReportIntent('423번 소 보고서 만들어줘');
      expect(result.traceNo).toBeNull();
    });
  });

  describe('isReport: false인 경우 다른 필드 없음', () => {
    it('isReport false이면 format, reportType, traceNo 없음', () => {
      const result = detectReportIntent('소가 열이 있어요');
      expect(result.isReport).toBe(false);
      expect(result.format).toBeUndefined();
      expect(result.reportType).toBeUndefined();
      expect(result.traceNo).toBeUndefined();
    });
  });
});
