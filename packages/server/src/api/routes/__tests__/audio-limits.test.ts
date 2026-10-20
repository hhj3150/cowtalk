// VO-09 회귀 — 클라이언트가 HD 모델·4000자·말투를 지정하고, 계정별 한도 없이 TTS/STT 를 호출할 수 있던 문제
import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import { signAccessToken } from '../../../lib/auth.js';

const synthesize = vi.fn(async () => ({ audio: Buffer.from('ID3'), contentType: 'audio/mpeg', cached: false, truncated: false, originalLength: 1, synthesizedLength: 1 }));
vi.mock('../../../services/audio/tts.service.js', () => ({ synthesize }));
vi.mock('../../../services/audio/stt.service.js', () => ({ transcribe: vi.fn(async () => ({ text: 'x' })) }));
vi.mock('../../../lib/redis.js', () => ({ getRedis: () => null }));
vi.mock('../../../config/index.js', async (orig) => {
  const actual = await orig<typeof import('../../../config/index.js')>();
  return { ...actual, config: { ...actual.config, TTS_HOURLY_LIMIT_PER_USER: 3, OPENAI_TTS_MAX_CHARS: 800 } };
});
vi.mock('../../../services/auth/approval.service.js', async (orig) => ({
  ...(await orig<typeof import('../../../services/auth/approval.service.js')>()),
  isUserApproved: vi.fn(async () => true),
}));

const { audioRouter } = await import('../audio.routes.js');
const app = express();
app.use(express.json());
app.use('/audio', audioRouter);
const tok = (u: string) => `Bearer ${signAccessToken({ userId: u, role: 'farmer', farmIds: [] } as never)}`;

beforeEach(() => { synthesize.mockClear(); });

describe('VO-09 /audio/speak', () => {
  it('모델·말투는 무시하고 길이는 서버 상한으로 자른다', async () => {
    await request(app).post('/audio/speak').set('Authorization', tok('u-a'))
      .send({ text: '안녕', model: 'tts-1-hd', maxChars: 4000, instructions: '아주 길게' });
    const arg = (synthesize.mock.calls[0] as unknown as [Record<string, unknown>])[0];
    expect(arg).not.toHaveProperty('model');
    expect(arg).not.toHaveProperty('instructions');
    expect(arg.maxChars).toBe(800);
  });
  it('계정별 시간당 한도 (다른 계정은 별도)', async () => {
    const codes = [];
    for (let i = 0; i < 4; i++) codes.push((await request(app).post('/audio/speak').set('Authorization', tok('u-b')).send({ text: '가' })).status);
    expect(codes).toEqual([200, 200, 200, 429]);
    expect((await request(app).post('/audio/speak').set('Authorization', tok('u-c')).send({ text: '가' })).status).toBe(200);
  });
});
