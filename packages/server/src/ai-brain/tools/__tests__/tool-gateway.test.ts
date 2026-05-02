// MCP 도구 권한 매트릭스 일관성 테스트.
// 시연 안전성 핵심 — 4역할 × 22도구 매트릭스가 정의된 도구만 참조하는지,
// 역할 경계가 의도대로 작동하는지를 코드 레벨에서 검증한다.

import { describe, it, expect } from 'vitest';
import { TINKERBELL_TOOLS } from '../tool-definitions.js';
import { ROLE_TOOL_ACCESS, TOOL_DOMAIN_MAP } from '../tool-gateway.js';

const TOOL_NAMES = new Set(TINKERBELL_TOOLS.map((t) => t.name));

describe('Tool Gateway — 권한 매트릭스 일관성', () => {
  describe('ROLE_TOOL_ACCESS', () => {
    it('정의된 4역할(farmer/veterinarian/government_admin/quarantine_officer)을 모두 포함한다', () => {
      expect(Object.keys(ROLE_TOOL_ACCESS).sort()).toEqual([
        'farmer',
        'government_admin',
        'quarantine_officer',
        'veterinarian',
      ]);
    });

    it('각 역할이 참조하는 도구는 모두 TINKERBELL_TOOLS에 존재한다 (오타·드리프트 방지)', () => {
      for (const [role, tools] of Object.entries(ROLE_TOOL_ACCESS)) {
        for (const toolName of tools) {
          expect(TOOL_NAMES.has(toolName), `역할 '${role}'의 '${toolName}'은 TINKERBELL_TOOLS에 정의 안 됨`).toBe(true);
        }
      }
    });

    it('모든 역할은 query_animal 기본 도구에 접근할 수 있다', () => {
      for (const tools of Object.values(ROLE_TOOL_ACCESS)) {
        expect(tools).toContain('query_animal');
      }
    });

    it('농장주(farmer)는 방역관 전용 도구에 접근할 수 없다', () => {
      const farmerTools = ROLE_TOOL_ACCESS['farmer'] ?? [];
      expect(farmerTools).not.toContain('query_quarantine_dashboard');
      expect(farmerTools).not.toContain('query_national_situation');
    });

    it('행정관(government_admin)은 개별 치료/수정 기록 도구에 접근할 수 없다', () => {
      const adminTools = ROLE_TOOL_ACCESS['government_admin'] ?? [];
      expect(adminTools).not.toContain('record_treatment');
      expect(adminTools).not.toContain('record_insemination');
      expect(adminTools).not.toContain('record_pregnancy_check');
    });

    it('수의사(veterinarian)는 진료/번식 기록 도구를 사용할 수 있다', () => {
      const vetTools = ROLE_TOOL_ACCESS['veterinarian'] ?? [];
      expect(vetTools).toContain('record_treatment');
      expect(vetTools).toContain('record_insemination');
      expect(vetTools).toContain('query_differential_diagnosis');
    });

    it('방역관(quarantine_officer)은 방역 대시보드/전국 현황 도구에 접근한다', () => {
      const qoTools = ROLE_TOOL_ACCESS['quarantine_officer'] ?? [];
      expect(qoTools).toContain('query_quarantine_dashboard');
      expect(qoTools).toContain('query_national_situation');
    });
  });

  describe('TOOL_DOMAIN_MAP', () => {
    it('TINKERBELL_TOOLS의 모든 도구는 도메인 매핑이 있다', () => {
      const unmapped: string[] = [];
      for (const tool of TINKERBELL_TOOLS) {
        if (!TOOL_DOMAIN_MAP[tool.name]) {
          unmapped.push(tool.name);
        }
      }
      expect(unmapped, `도메인 미매핑 도구: ${unmapped.join(', ')}`).toEqual([]);
    });

    it('도메인은 정의된 카테고리(sensor/farm/repro/public_data/genetics/health) 중 하나다', () => {
      const validDomains = new Set(['sensor', 'farm', 'repro', 'public_data', 'genetics', 'health']);
      for (const [tool, domain] of Object.entries(TOOL_DOMAIN_MAP)) {
        expect(validDomains.has(domain), `'${tool}'의 도메인 '${domain}'은 정의된 카테고리에 속하지 않음`).toBe(true);
      }
    });
  });

  describe('도구 정의 — 22개 시연 도구 인벤토리', () => {
    it('정확히 22개 도구가 정의되어 있다 (CLAUDE.md MCP 도구 체계와 일치)', () => {
      expect(TINKERBELL_TOOLS.length).toBe(22);
    });

    it('모든 도구는 name과 description을 갖는다', () => {
      for (const tool of TINKERBELL_TOOLS) {
        expect(tool.name).toBeTruthy();
        expect(tool.name.length).toBeGreaterThan(2);
        expect(tool.description).toBeTruthy();
        expect(tool.description!.length).toBeGreaterThan(10);
      }
    });

    it('도구 이름은 모두 고유하다 (중복 없음)', () => {
      const names = TINKERBELL_TOOLS.map((t) => t.name);
      expect(new Set(names).size).toBe(names.length);
    });
  });
});
