// 전문가 레이블 접근 제어 불변식 테스트
// 원칙: 진단·방역 판단 레이블(record_expert_label)은 수의사·방역관만 생성한다.
// 농장주·행정관의 추측은 정답 레이블로 삼지 않는다 (학습 데이터 오염 방지).
// DB 불필요 — 순수 상수/정의 검증.

import { describe, it, expect } from 'vitest';
import { ROLE_TOOL_ACCESS, TOOL_DOMAIN_MAP } from '../tool-gateway.js';
import { TINKERBELL_TOOLS } from '../tool-definitions.js';

const TOOL = 'record_expert_label';

describe('record_expert_label 도구 정의', () => {
  it('도구가 등록되어 있고 필수 입력이 animalId·diagnosis 이다', () => {
    const def = TINKERBELL_TOOLS.find((t) => t.name === TOOL);
    expect(def).toBeDefined();
    expect(def?.input_schema.required).toEqual(
      expect.arrayContaining(['animalId', 'diagnosis']),
    );
  });

  it('health 도메인으로 분류된다', () => {
    expect(TOOL_DOMAIN_MAP[TOOL]).toBe('health');
  });
});

describe('전문가 레이블 역할 게이팅 (전문가에 한해서만)', () => {
  it('수의사는 접근 가능', () => {
    expect(ROLE_TOOL_ACCESS.veterinarian).toContain(TOOL);
  });

  it('방역관은 접근 가능', () => {
    expect(ROLE_TOOL_ACCESS.quarantine_officer).toContain(TOOL);
  });

  it('농장주는 접근 불가 (추측을 정답 레이블로 삼지 않음)', () => {
    expect(ROLE_TOOL_ACCESS.farmer).not.toContain(TOOL);
  });

  it('행정관은 접근 불가', () => {
    expect(ROLE_TOOL_ACCESS.government_admin).not.toContain(TOOL);
  });
});
