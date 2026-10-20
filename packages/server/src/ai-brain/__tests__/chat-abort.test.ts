// AI-04 회귀 — 클라이언트가 끊어도 서버의 Claude·도구 루프가 계속 돌고 취소된 답변을 저장·학습하던 문제
import { describe, it, expect, vi, beforeEach } from 'vitest';

// 라운드마다 돌려줄 응답 — 첫 라운드는 도구 호출, 둘째는 텍스트 완료
let rounds: Array<{ text: string; toolUse: boolean }> = [];
let onStreamCreated: (() => void) | null = null;

class FakeStream {
  private textHandlers: Array<(t: string) => void> = [];
  constructor(private readonly r: { text: string; toolUse: boolean }, private readonly signal?: AbortSignal) {}
  on(ev: string, fn: (t: string) => void): this { if (ev === 'text') this.textHandlers.push(fn); return this; }
  async finalMessage(): Promise<unknown> {
    onStreamCreated?.();
    if (this.signal?.aborted) throw new Error('Request was aborted.');
    for (const h of this.textHandlers) h(this.r.text);
    return {
      stop_reason: this.r.toolUse ? 'tool_use' : 'end_turn',
      model: 'm',
      usage: { input_tokens: 1, output_tokens: 1 },
      content: this.r.toolUse
        ? [{ type: 'tool_use', id: 't1', name: 'query_animal', input: { earTag: '423' } }]
        : [{ type: 'text', text: this.r.text }],
    };
  }
}

vi.mock('@anthropic-ai/sdk', () => ({
  default: class {
    messages = {
      stream: (_body: unknown, opts?: { signal?: AbortSignal }) => new FakeStream(rounds.shift() ?? { text: '', toolUse: false }, opts?.signal),
    };
  },
}));
vi.mock('../../config/index.js', async (orig) => {
  const actual = await orig<typeof import('../../config/index.js')>();
  return { ...actual, config: { ...actual.config, ANTHROPIC_API_KEY: 'test-key' } };
});
const executeToolWithGateway = vi.fn(async () => ({ success: true, result: '{}', executionMs: 1 }));
vi.mock('../tools/tool-gateway.js', async (orig) => ({
  ...(await orig<typeof import('../tools/tool-gateway.js')>()),
  executeToolWithGateway: (...a: unknown[]) => executeToolWithGateway(...(a as [])),
}));
vi.mock('../../lib/logger.js', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));

const { callClaudeForChatWithTools } = await import('../claude-client.js');

function callbacks() {
  return { onText: vi.fn(), onDone: vi.fn(), onError: vi.fn(), onToolEvent: vi.fn() };
}

beforeEach(() => { rounds = []; onStreamCreated = null; executeToolWithGateway.mockClear(); });

describe('AI-04 callClaudeForChatWithTools abort', () => {
  it('정상: 도구 라운드 후 완료 → onDone', async () => {
    rounds = [{ text: '', toolUse: true }, { text: '423번은 정상입니다', toolUse: false }];
    const cb = callbacks();
    await callClaudeForChatWithTools('sys', 'q', cb, { role: 'farmer' }, {});
    expect(executeToolWithGateway).toHaveBeenCalledTimes(1);
    expect(cb.onDone).toHaveBeenCalledWith('423번은 정상입니다');
  });

  it('스트림 중 연결 종료 → 도구 실행·onDone 없음, 오류로 보고하지 않음', async () => {
    rounds = [{ text: '', toolUse: true }, { text: 'x', toolUse: false }];
    const ac = new AbortController();
    onStreamCreated = () => ac.abort();
    const cb = callbacks();
    await callClaudeForChatWithTools('sys', 'q', cb, { role: 'farmer' }, { signal: ac.signal });
    expect(executeToolWithGateway).not.toHaveBeenCalled();
    expect(cb.onDone).not.toHaveBeenCalled();
    expect(cb.onError).not.toHaveBeenCalled();
  });

  it('도구 라운드 뒤 연결 종료 → 다음 라운드로 가지 않고 onDone 없음', async () => {
    rounds = [{ text: '', toolUse: true }, { text: '답', toolUse: false }];
    const ac = new AbortController();
    executeToolWithGateway.mockImplementationOnce(async () => { ac.abort(); return { success: true, result: '{}', executionMs: 1 }; });
    const cb = callbacks();
    await callClaudeForChatWithTools('sys', 'q', cb, { role: 'farmer' }, { signal: ac.signal });
    expect(cb.onDone).not.toHaveBeenCalled();
  });
});
