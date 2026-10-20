// VO-07 회귀 — 같은 발화(clientRequestId)가 처리 중일 때 두 번째 요청도 실행되던 문제
import { describe, it, expect, vi } from 'vitest';
import express from 'express';
import type { AddressInfo } from 'node:net';
import { signAccessToken } from '../../../lib/auth.js';

let finishFirst: (() => void) | null = null;
const handleChatStream = vi.fn((_req: unknown, cb: { onDone: (t: string) => void }) => new Promise<void>((resolve) => {
  finishFirst = () => { cb.onDone('답'); resolve(); };
}));
vi.mock('../../../chat/chat-service.js', () => ({ handleChatStream, handleChatMessage: vi.fn(), buildStreamFallback: vi.fn() }));
vi.mock('../../../ai-brain/claude-client.js', () => ({ isClaudeAvailable: () => true }));
vi.mock('../../../lib/redis.js', () => ({ getRedis: () => null }));
vi.mock('../../../services/auth/approval.service.js', async (orig) => ({
  ...(await orig<typeof import('../../../services/auth/approval.service.js')>()),
  isUserApproved: vi.fn(async () => true),
}));
vi.mock('../../../chat/chat-scope.js', () => ({ sanitizeChatScope: async (s: object) => ({ ...s, narrowed: false }) }));

const { chatRouter } = await import('../chat.routes.js');

describe('VO-07 /chat/stream 중복 발화', () => {
  it('처리 중인 같은 clientRequestId 는 409, 끝난 뒤에는 다시 허용', async () => {
    const app = express();
    app.use(express.json());
    app.use('/chat', chatRouter);
    const server = app.listen(0);
    const base = `http://127.0.0.1:${String((server.address() as AddressInfo).port)}`;
    const auth = `Bearer ${signAccessToken({ userId: 'u1', role: 'government_admin', farmIds: [] } as never)}`;
    const send = () => fetch(`${base}/chat/stream`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: auth },
      body: JSON.stringify({ question: '423번 상태', userText: '423번 상태', clientRequestId: 'v-tab-7' }),
    });
    try {
      const first = await send();
      expect(first.status).toBe(200);
      await vi.waitFor(() => expect(handleChatStream).toHaveBeenCalledTimes(1));
      const second = await send();
      expect(second.status).toBe(409);
      expect(handleChatStream).toHaveBeenCalledTimes(1);
      finishFirst?.();
      await first.text();
      await new Promise((r) => setTimeout(r, 20));
      const third = await send();
      expect(third.status).toBe(200);
      finishFirst?.();
      await third.text();
    } finally {
      server.close();
    }
  });
});
