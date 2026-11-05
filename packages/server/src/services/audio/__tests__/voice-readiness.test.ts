import { describe, it, expect, vi } from 'vitest';

vi.mock('../../../ai-brain/claude-client.js', () => ({ pingClaude: vi.fn() }));
vi.mock('../tts.service.js', () => ({ synthesize: vi.fn() }));
vi.mock('../stt.service.js', () => ({ transcribe: vi.fn() }));

import { runVoiceReadiness } from '../voice-readiness.service.js';
import type { ReadinessDeps } from '../voice-readiness.service.js';

function deps(over: Partial<ReadinessDeps> = {}): ReadinessDeps {
  let t = 0;
  return {
    now: () => (t += 100),
    pingClaude: async () => ({ ok: true, model: 'claude-x', latencyMs: 900 }),
    synthesize: async () => ({ audio: Buffer.alloc(4096), contentType: 'audio/mpeg', cached: false, truncated: false, originalLength: 20, synthesizedLength: 20 }),
    transcribe: async () => ({ text: '카우톡 음성 점검입니다.' }),
    ...over,
  };
}

describe('runVoiceReadiness — 시연 전 음성 점검', () => {
  it('세 경로 모두 정상이면 ready', async () => {
    const r = await runVoiceReadiness(deps());
    expect(r.ready).toBe(true);
    expect(r.checks.map((c) => `${c.name}:${c.status}`)).toEqual(['claude:ok', 'tts:ok', 'stt:ok']);
  });

  it('대화 모델 실패 → ready=false, 원인 문구', async () => {
    const r = await runVoiceReadiness(deps({ pingClaude: async () => ({ ok: false, model: 'claude-x', latencyMs: 15000, error: 'overloaded' }) }));
    expect(r.ready).toBe(false);
    expect(r.checks[0]).toMatchObject({ status: 'fail', detail: '실패: overloaded' });
  });

  it('느린 대화 모델은 실패가 아니라 "느림" (시연은 가능)', async () => {
    const r = await runVoiceReadiness(deps({ pingClaude: async () => ({ ok: true, model: 'claude-x', latencyMs: 9000 }) }));
    expect(r.ready).toBe(true);
    expect(r.checks[0]!.status).toBe('slow');
  });

  it('합성 실패 → 인식은 확인 불가로 실패 처리', async () => {
    const r = await runVoiceReadiness(deps({ synthesize: async () => { throw new Error('OpenAI TTS 실패 (HTTP 429)'); } }));
    expect(r.ready).toBe(false);
    expect(r.checks.find((c) => c.name === 'tts')!.status).toBe('fail');
    expect(r.checks.find((c) => c.name === 'stt')!.detail).toContain('확인하지 못함');
  });

  it('인식은 됐지만 엉뚱한 문장이면 실패', async () => {
    const r = await runVoiceReadiness(deps({ transcribe: async () => ({ text: '감사합니다' }) }));
    expect(r.checks.find((c) => c.name === 'stt')!.status).toBe('fail');
  });
});
