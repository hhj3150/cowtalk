// Tool Gateway RBAC 테스트 — 역할별 도구 접근 권한 매트릭스
import { describe, it, expect } from 'vitest';
import { ROLE_TOOL_ACCESS, TOOL_DOMAIN_MAP } from '../../packages/server/src/ai-brain/tools/tool-gateway.js';

describe('TOOL_DOMAIN_MAP — 도구→도메인 매핑', () => {
  const ALL_TOOLS = [
    'query_animal', 'query_animal_events', 'query_farm_summary',
    'query_breeding_stats', 'query_sensor_data', 'query_conception_stats',
    'query_traceability', 'query_grade', 'query_auction_prices', 'query_sire_info',
    'record_insemination', 'record_pregnancy_check', 'recommend_insemination_window',
    'record_treatment', 'get_farm_kpis',
  ];

  it('모든 실행 가능 도구가 도메인 매핑에 존재', () => {
    for (const tool of ALL_TOOLS) {
      expect(TOOL_DOMAIN_MAP[tool], `${tool}이 TOOL_DOMAIN_MAP에 없음`).toBeDefined();
    }
  });

  it('공공데이터 도구는 public_data 또는 genetics 도메인', () => {
    expect(TOOL_DOMAIN_MAP.query_traceability).toBe('public_data');
    expect(TOOL_DOMAIN_MAP.query_grade).toBe('public_data');
    expect(TOOL_DOMAIN_MAP.query_auction_prices).toBe('public_data');
    expect(TOOL_DOMAIN_MAP.query_sire_info).toBe('genetics');
  });

  it('번식 도구는 repro 도메인', () => {
    expect(TOOL_DOMAIN_MAP.record_insemination).toBe('repro');
    expect(TOOL_DOMAIN_MAP.record_pregnancy_check).toBe('repro');
    expect(TOOL_DOMAIN_MAP.recommend_insemination_window).toBe('repro');
    expect(TOOL_DOMAIN_MAP.query_breeding_stats).toBe('repro');
  });
});

describe('ROLE_TOOL_ACCESS — 역할별 도구 접근 권한', () => {
  // === 신규 도구 3개 접근 권한 검증 ===

  describe('query_grade 접근 권한', () => {
    it('farmer → 접근 가능', () => {
      expect(ROLE_TOOL_ACCESS.farmer).toContain('query_grade');
    });

    it('veterinarian → 접근 가능', () => {
      expect(ROLE_TOOL_ACCESS.veterinarian).toContain('query_grade');
    });

    it('government_admin → 접근 가능', () => {
      expect(ROLE_TOOL_ACCESS.government_admin).toContain('query_grade');
    });

    it('inseminator → 접근 불가', () => {
      expect(ROLE_TOOL_ACCESS.inseminator).not.toContain('query_grade');
    });

    it('feed_company → 접근 불가', () => {
      expect(ROLE_TOOL_ACCESS.feed_company).not.toContain('query_grade');
    });
  });

  describe('query_auction_prices 접근 권한', () => {
    it('farmer → 접근 가능 (출하 시세 확인)', () => {
      expect(ROLE_TOOL_ACCESS.farmer).toContain('query_auction_prices');
    });

    it('government_admin → 접근 가능 (수급 조절)', () => {
      expect(ROLE_TOOL_ACCESS.government_admin).toContain('query_auction_prices');
    });

    it('veterinarian → 접근 불가', () => {
      expect(ROLE_TOOL_ACCESS.veterinarian).not.toContain('query_auction_prices');
    });
  });

  describe('query_sire_info 접근 권한', () => {
    it('inseminator → 접근 가능 (정액 선택)', () => {
      expect(ROLE_TOOL_ACCESS.inseminator).toContain('query_sire_info');
    });

    it('farmer → 접근 불가 (수정사 전용)', () => {
      expect(ROLE_TOOL_ACCESS.farmer).not.toContain('query_sire_info');
    });

    it('quarantine_officer → 접근 불가', () => {
      expect(ROLE_TOOL_ACCESS.quarantine_officer).not.toContain('query_sire_info');
    });
  });

  // === 기존 도구 접근 권한 무결성 ===

  describe('기존 도구 접근 권한 유지', () => {
    it('모든 역할이 query_animal 접근 가능 (feed_company 제외)', () => {
      expect(ROLE_TOOL_ACCESS.farmer).toContain('query_animal');
      expect(ROLE_TOOL_ACCESS.veterinarian).toContain('query_animal');
      expect(ROLE_TOOL_ACCESS.inseminator).toContain('query_animal');
      expect(ROLE_TOOL_ACCESS.government_admin).toContain('query_animal');
      expect(ROLE_TOOL_ACCESS.quarantine_officer).toContain('query_animal');
    });

    it('수정 기록은 inseminator만 가능', () => {
      expect(ROLE_TOOL_ACCESS.inseminator).toContain('record_insemination');
      expect(ROLE_TOOL_ACCESS.farmer).not.toContain('record_insemination');
      expect(ROLE_TOOL_ACCESS.veterinarian).not.toContain('record_insemination');
    });

    it('치료 기록은 farmer + veterinarian만 가능', () => {
      expect(ROLE_TOOL_ACCESS.farmer).toContain('record_treatment');
      expect(ROLE_TOOL_ACCESS.veterinarian).toContain('record_treatment');
      expect(ROLE_TOOL_ACCESS.inseminator).not.toContain('record_treatment');
    });
  });

  // === 6개 역할 모두 정의 확인 ===

  it('6개 역할 모두 정의됨', () => {
    const roles = ['farmer', 'veterinarian', 'inseminator', 'government_admin', 'quarantine_officer', 'feed_company'];
    for (const role of roles) {
      expect(ROLE_TOOL_ACCESS[role], `${role} 역할이 정의되지 않음`).toBeDefined();
      expect(Array.isArray(ROLE_TOOL_ACCESS[role])).toBe(true);
    }
  });
});
