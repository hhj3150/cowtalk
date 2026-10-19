// SEC-10 회귀 — AI 목장 요약 도구의 농장명 검색
import { describe, it, expect } from 'vitest';
import { escapeLikePattern } from '../tool-executor.js';

describe('SEC-10 escapeLikePattern', () => {
  it("'%' 한 글자로 모든 농장과 일치하던 것을 글자 그대로 취급", () => {
    expect(escapeLikePattern('%')).toBe('\\%');
    expect(escapeLikePattern('송영_신')).toBe('송영\\_신');
    expect(escapeLikePattern('a\\b')).toBe('a\\\\b');
  });
  it('일반 이름은 그대로', () => {
    expect(escapeLikePattern('송영신목장')).toBe('송영신목장');
  });
});
