import { describe, it, expect } from 'vitest';
import { matchesInterrupt } from '../useWakeWord';

describe('matchesInterrupt — 발화 전체가 중지 명령일 때만', () => {
  it('짧은 중지 명령은 인정', () => {
    for (const t of ['그만', '그만해', '조용히 해', '멈춰!', '팅커벨 그만', '그만 그만', 'Stop', 'shut up']) {
      expect(matchesInterrupt(t), t).toBe(true);
    }
  });

  it('답변 속 문장(스피커 에코)은 중지로 보지 않는다', () => {
    for (const t of ['그만큼 반추 시간이 줄었습니다', '조용히 쉬게 해 주세요', '사료 급여를 멈춰야 할 정도는 아닙니다', '그만큼']) {
      expect(matchesInterrupt(t), t).toBe(false);
    }
  });
});
