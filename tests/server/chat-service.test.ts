// Chat 서비스 유닛 테스트

import { describe, it, expect, vi } from 'vitest';

// Claude API mock
vi.mock('@server/ai-brain/claude-client', () => ({
  callClaudeForAnalysis: vi.fn().mockResolvedValue(null),
  callClaudeForChatJson: vi.fn().mockResolvedValue(null),
  callClaudeForChat: vi.fn(),
  isClaudeAvailable: vi.fn().mockReturnValue(false),
}));

// profile-builder mock
vi.mock('@server/pipeline/profile-builder', () => ({
  buildAnimalProfile: vi.fn().mockResolvedValue(null),
  buildFarmProfile: vi.fn().mockResolvedValue(null),
  buildRegionalProfile: vi.fn().mockResolvedValue(null),
  buildTenantProfile: vi.fn().mockResolvedValue(null),
}));

import { handleChatMessage } from '@server/chat/chat-service';
import { getRoleTone } from '@server/chat/role-tone';
import { resolveContext } from '@server/chat/context-builder';

describe('getRoleTone', () => {
  it('농장주 톤 설정', () => {
    const tone = getRoleTone('farmer');
    expect(tone.systemAddendum).toContain('쉽');
    expect(tone.exampleTone).toBeTruthy();
  });

  it('수의사 톤 설정', () => {
    const tone = getRoleTone('veterinarian');
    expect(tone.systemAddendum).toContain('임상');
  });

  it('모든 역할 톤 존재', () => {
    const roles = ['farmer', 'veterinarian', 'government_admin', 'quarantine_officer'] as const;
    for (const role of roles) {
      const tone = getRoleTone(role);
      expect(tone.systemAddendum).toBeTruthy();
      expect(tone.exampleTone).toBeTruthy();
    }
  });
});

describe('resolveContext', () => {
  it('animalId 없고 farmId 없음 → general', async () => {
    const result = await resolveContext('안녕하세요', null, null, 'farmer');
    expect(result.detectedType).toBe('general');
    expect(result.context.type).toBe('general');
  });
});

describe('handleChatMessage', () => {
  it('Claude 불가 → fallback 메시지', async () => {
    const result = await handleChatMessage({
      question: '117번 소 상태 어때?',
      role: 'farmer',
      farmId: null,
      animalId: null,
      conversationHistory: [],
    });

    expect(result.answer).toContain('사용 불가');
    expect(result.role).toBe('farmer');
  });
});
