// AI-07·VO-04 회귀 — 검증 안내·중단 표시 문구
import { describe, it, expect } from 'vitest';
import { buildVerificationNote, INTERRUPTED_NOTE } from '../TinkerbellAssistant';

describe('buildVerificationNote', () => {
  it('확인되지 않은 값이 있으면 안내', () => {
    expect(buildVerificationNote({ earTags: ['777번'], temperatures: ['41.3°C'] })).toContain('777번, 41.3°C');
  });
  it('없으면 빈 문자열', () => {
    expect(buildVerificationNote({ earTags: [], temperatures: [] })).toBe('');
    expect(buildVerificationNote(undefined)).toBe('');
  });
  it('중단 표시 문구', () => {
    expect(INTERRUPTED_NOTE).toContain('끊겼습니다');
  });
});
