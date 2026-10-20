// AI-07 회귀 — 답변의 개체번호·체온을 근거와 대조하는 사후 검증
import { describe, it, expect } from 'vitest';
import { findUnverifiedClaims, hasUnverified } from '../answer-verifier.js';

const evidence = '{"earTag":"423","latestTemp":40.2,"farm":"송영신목장"} 개체 사백이십삼 관련 맥락 512번 이력';

describe('AI-07 findUnverifiedClaims', () => {
  it('근거에 있는 개체번호·체온은 통과', () => {
    const r = findUnverifiedClaims('423번 소 체온 40.2°C 로 발열입니다. 512번도 확인하세요.', evidence);
    expect(hasUnverified(r)).toBe(false);
  });
  it('근거에 없는 개체번호·체온은 표시', () => {
    const r = findUnverifiedClaims('777번 소가 41.3℃ 입니다.', evidence);
    expect(r).toEqual({ earTags: ['777번'], temperatures: ['41.3°C'] });
  });
  it('정상 범위 참고값·순서 표현은 검사하지 않는다', () => {
    const r = findUnverifiedClaims('정상 체온은 38.5°C 입니다. 3번째 수정이고 2번 더 확인하세요.', evidence);
    expect(hasUnverified(r)).toBe(false);
  });
});
