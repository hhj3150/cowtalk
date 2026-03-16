import { describe, it, expect } from 'vitest';
import { COWTALK_VERSION } from '@shared/index';

describe('CowTalk v5 Smoke Test', () => {
  it('should export correct version', () => {
    expect(COWTALK_VERSION).toBe('5.0.0');
  });

  it('should have TypeScript strict mode working', () => {
    const value: string = 'hello';
    expect(typeof value).toBe('string');
  });
});
