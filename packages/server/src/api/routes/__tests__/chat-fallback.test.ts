// AI-10 회귀 — 실행 중 Claude 오류(529·타임아웃)면 규칙 기반 대체 없이 원문 오류(상태코드·모델명)를 보여 주던 문제
import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import { signAccessToken } from '../../../lib/auth.js';

let mode: 'error-before-text' | 'error-after-text' = 'error-before-text';
vi.mock('../../../chat/chat-service.js', () => ({
  handleChatMessage: vi.fn(),
  buildStreamFallback: vi.fn(() => '오늘 알림 3건 (데이터 기반)'),
  handleChatStream: vi.fn(async (_r: unknown, cb: { onText: (t: string) => void; onError: (e: Error) => void }) => {
    if (mode === 'error-after-text') cb.onText('일부 답');
    cb.onError(new Error('[Claude 529] overloaded (model=secret-model)'));
  }),
}));
vi.mock('../../../chat/context-builder.js', () => ({ resolveContext: vi.fn(async () => ({ context: { type: 'general' } })) }));
vi.mock('../../../ai-brain/claude-client.js', () => ({ isClaudeAvailable: () => true }));
vi.mock('../../../lib/redis.js', () => ({ getRedis: () => null }));
vi.mock('../../../chat/chat-scope.js', () => ({ sanitizeChatScope: async (s: object) => ({ ...s, narrowed: false }) }));
vi.mock('../../../services/auth/approval.service.js', async (orig) => ({
  ...(await orig<typeof import('../../../services/auth/approval.service.js')>()),
  isUserApproved: vi.fn(async () => true),
}));

const { chatRouter } = await import('../chat.routes.js');
const app = express();
app.use(express.json());
app.use('/chat', chatRouter);
const auth = `Bearer ${signAccessToken({ userId: 'u1', role: 'government_admin', farmIds: [] } as never)}`;

beforeEach(() => { mode = 'error-before-text'; });

describe('AI-10 /chat/stream 실행 중 Claude 오류', () => {
  it('아직 보낸 글이 없으면 규칙 기반 답으로 대체 (원문 오류 미노출)', async () => {
    const r = await request(app).post('/chat/stream').set('Authorization', auth).send({ question: '오늘 상황' });
    expect(r.text).toContain('데이터 기반 요약으로 답합니다');
    expect(r.text).toContain('오늘 알림 3건');
    expect(r.text).toContain('"type":"done"');
    expect(r.text).not.toContain('secret-model');
  });
  it('일부를 이미 보냈으면 짧은 끊김 안내만', async () => {
    mode = 'error-after-text';
    const r = await request(app).post('/chat/stream').set('Authorization', auth).send({ question: '오늘 상황' });
    expect(r.text).toContain('중간에 끊겼습니다');
    expect(r.text).not.toContain('secret-model');
  });
});
