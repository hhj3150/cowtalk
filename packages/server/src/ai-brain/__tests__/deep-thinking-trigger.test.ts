// Extended Thinking 트리거 판정 — 사용자 원문 기준이어야 한다.
//
// 회귀 방지 대상: 프런트가 조립한 프롬프트(모드 헤더 + 개체 컨텍스트 + 범위 지시문)로
// 판정하면 "무엇을 물었나"가 아니라 "어느 화면에서 물었나"로 추론 깊이가 갈렸다.
// 개체 전담 모드는 헤더만으로 400자를 넘겨 상시 thinking(= temperature 1 강제)이었고,
// 대시보드는 지역 필터를 켜는 순간 갑자기 thinking이 붙었다.

import { describe, it, expect, vi, beforeEach } from 'vitest';

// claude-client는 logger를 통해 config.LOG_LEVEL/NODE_ENV도 읽는다 (import 시점 평가)
vi.mock('../../config/index.js', () => ({
  config: { ANTHROPIC_THINKING_BUDGET: 2048, LOG_LEVEL: 'silent', NODE_ENV: 'test' },
}));

const { shouldUseDeepThinking } = await import('../claude-client.js');
const { config } = await import('../../config/index.js');

/**
 * 개체 전담 모드에서 프런트가 question 필드에 조립해 보내는 프롬프트 (TinkerbellAssistant).
 * 헤더 208자 + CowProfilePage가 만드는 개체 컨텍스트(개체ID·농장ID UUID 포함).
 */
const ANIMAL_MODE_HEADER =
  '[팅커벨 AI — 개체 전담 모드]\n이 개체의 센서·알람·번식·건강 데이터를 기반으로 답하세요.\n\n' +
  '응답 규칙:\n- 자연스러운 대화체로 답하세요. ASCII 차트·표 금지.\n' +
  '- 수치는 문장으로 설명하세요 ("체온 38.7°C로 정상" 처럼).\n' +
  '- 일반 축산 질문은 전문 지식으로 자유롭게 답하세요.\n' +
  '- **bold**, - 목록 등 마크다운 활용 가능.\n\n';

const ANIMAL_CONTEXT =
  '[팅커벨 AI — 개체 정밀 분석]\n' +
  '[개체ID] 63e4a444-dcb0-d886-4da8-21eb00000000\n' +
  '[농장ID] 8f1c2d3e-4a5b-6c7d-8e9f-0a1b2c3d4e5f\n' +
  '[개체정보] #423 , 송영신목장, 홀스타인, 암소, 3산차, 착유우, 상태: active\n' +
  '[센서] 체온 38.7°C, 활동량 412, 반추 480분\n' +
  '[최근 알람 3건] temperature_high(high), rumination_decrease(medium), estrus(low)\n' +
  '[번식이력] insemination(2026-06-11), pregnancy_check(2026-07-09)\n\n';

describe('shouldUseDeepThinking — 사용자 원문 기준 판정', () => {
  beforeEach(() => {
    (config as { ANTHROPIC_THINKING_BUDGET: number }).ANTHROPIC_THINKING_BUDGET = 2048;
  });

  it('일상 질문은 thinking을 켜지 않는다', () => {
    expect(shouldUseDeepThinking('체온 어때?')).toBe(false);
    expect(shouldUseDeepThinking('오늘 할 일 알려줘')).toBe(false);
  });

  it('개체 모드 헤더가 붙으면 400자를 넘겨 오탐이 난다 — 그래서 원문으로 판정해야 한다', () => {
    const assembled = `${ANIMAL_MODE_HEADER}${ANIMAL_CONTEXT}사용자 질문: 체온 어때?`;
    // 조립 프롬프트는 길이만으로 thinking이 켜진다 (회귀 시 이 값이 근거)
    expect(assembled.length).toBeGreaterThanOrEqual(400);
    expect(shouldUseDeepThinking(assembled)).toBe(true);
    // 같은 질문의 원문은 켜지지 않아야 한다 — 서버는 이쪽(rawQuestion)을 넘긴다
    expect(shouldUseDeepThinking('체온 어때?')).toBe(false);
  });

  it('깊은 추론 키워드는 짧아도 켠다', () => {
    expect(shouldUseDeepThinking('감별진단 해줘')).toBe(true);
    expect(shouldUseDeepThinking('근교계수 확인')).toBe(true);
    expect(shouldUseDeepThinking('differential diagnosis please')).toBe(true);
  });

  it('사용자가 명시적으로 요청한 정밀·종합 분석은 켠다', () => {
    expect(shouldUseDeepThinking('이 소 정밀 분석해줘')).toBe(true);
    expect(shouldUseDeepThinking('종합 분석 부탁해')).toBe(true);
  });

  it('사용자 원문이 실제로 길면(400자+) 켠다', () => {
    expect(shouldUseDeepThinking('가'.repeat(400))).toBe(true);
    expect(shouldUseDeepThinking('가'.repeat(399))).toBe(false);
  });

  it('thinking 예산이 0이면 어떤 경우에도 켜지 않는다', () => {
    (config as { ANTHROPIC_THINKING_BUDGET: number }).ANTHROPIC_THINKING_BUDGET = 0;
    expect(shouldUseDeepThinking('감별진단 해줘')).toBe(false);
    expect(shouldUseDeepThinking('가'.repeat(500))).toBe(false);
  });
});
