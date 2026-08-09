// 실제 호출 경로가 Anthropic 에 무엇을 보내는지 가로채 확인한다.
//
// 왜 헬퍼 단위테스트로 부족한가: claude-model-params 가 아무리 정확해도 호출부가
// 그걸 타지 않으면 소용이 없다. 실제로 tool-use 경로에는 import 한 thinkingParam 을
// 가리는 동명 지역 변수가 있었고, 그 안에서 { type: 'enabled', budget_tokens } 를
// 하드코딩하고 있었다. 헬퍼 테스트는 전부 초록이었지만 모델을 바꾸는 순간
// 채팅 전 요청이 400 이 될 상태였다. 그 배선을 여기서 고정한다.
//
// 기대값을 특정 모델로 못박지 않는다 — 설정된 모델에 대해 헬퍼가 내린 판정과
// 실제 요청이 일치하는지를 본다. 모델을 바꿔도 이 테스트는 그대로 유효하고,
// 배선이 헬퍼에서 떨어져 나가는 순간에만 깨진다.

import { describe, it, expect, vi, beforeEach } from 'vitest';

// config 는 로드 시점에 process.env 를 한 번 읽고 굳는다. 아래 import 보다 먼저
// 키를 세워두지 않으면 클라이언트가 null 로 초기화돼 요청이 아예 나가지 않는다.
vi.hoisted(() => {
  process.env.ANTHROPIC_API_KEY = 'test-key-for-wire-check';
});

import { config } from '../../config/index.js';
import { temperatureParam, thinkingParam } from '../claude-model-params.js';

/** SDK 로 넘어간 요청 파라미터 */
const sent: Record<string, unknown>[] = [];

vi.mock('@anthropic-ai/sdk', () => {
  class FakeStream {
    on(): this {
      return this;
    }
    async finalMessage(): Promise<unknown> {
      return {
        content: [{ type: 'text', text: 'ok' }],
        usage: { input_tokens: 1, output_tokens: 1 },
        stop_reason: 'end_turn',
      };
    }
    abort(): void {}
  }
  class FakeAnthropic {
    messages = {
      stream: (params: Record<string, unknown>) => {
        sent.push(params);
        return new FakeStream();
      },
      create: async (params: Record<string, unknown>) => {
        sent.push(params);
        return {
          content: [{ type: 'text', text: '{}' }],
          usage: { input_tokens: 1, output_tokens: 1 },
        };
      },
    };
  }
  return { default: FakeAnthropic };
});

const NOOP_CALLBACKS = {
  onText: (): void => {},
  onComplete: (): void => {},
  onError: (): void => {},
};

/** 설정된 모델이 temperature 를 받는가 — 기대값의 단일 기준 */
const acceptsTemperature = Object.hasOwn(temperatureParam(config.ANTHROPIC_MODEL, 0.4), 'temperature');

describe('Anthropic 요청 파라미터 배선', () => {
  beforeEach(() => {
    sent.length = 0;
  });

  it('기본 채팅 스트림의 temperature 유무가 모델 판정과 일치한다', async () => {
    const { callClaudeForChat } = await import('../claude-client.js');
    await callClaudeForChat('안녕', '시스템', NOOP_CALLBACKS);

    expect(sent.length).toBeGreaterThan(0);
    expect(Object.hasOwn(sent[0]!, 'temperature')).toBe(acceptsTemperature);
  });

  it('tool-use + deep thinking 경로가 헬퍼가 정한 thinking 형태를 그대로 보낸다', async () => {
    const { callClaudeForChatWithTools } = await import('../claude-client.js');
    await callClaudeForChatWithTools('시스템', '감별진단 해줘', NOOP_CALLBACKS, undefined, {
      useDeepThinking: true,
    });

    const params = sent[0]!;
    // 여기가 지역 변수 shadowing 으로 하드코딩돼 있던 자리다.
    const expected = thinkingParam(config.ANTHROPIC_MODEL, config.ANTHROPIC_THINKING_BUDGET);
    expect(params.thinking).toEqual(expected.thinking);
    expect(Object.hasOwn(params, 'temperature')).toBe(acceptsTemperature);
  });

  it('추론 여지를 남길 만큼 max_tokens 상한이 확보돼 있다', async () => {
    // adaptive thinking 은 추론 토큰이 max_tokens 를 잠식한다. 상한이 낮으면
    // 정작 추론이 깊은 질문에서 답변이 잘린다.
    const { callClaudeForChat } = await import('../claude-client.js');
    await callClaudeForChat('안녕', '시스템', NOOP_CALLBACKS);

    expect(Number(sent[0]!.max_tokens)).toBeGreaterThanOrEqual(8000);
  });
});
