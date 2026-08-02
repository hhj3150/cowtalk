import { describe, it, expect } from 'vitest';
import { EchoGuard, toBigrams, containmentRatio } from '../echo-guard';

describe('toBigrams', () => {
  it('음절 2-gram으로 쪼갠다', () => {
    expect([...toBigrams('발정')]).toEqual(['발정']);
    expect([...toBigrams('발정이왔')]).toEqual(['발정', '정이', '이왔']);
  });

  it('공백·문장부호를 무시한다', () => {
    expect(toBigrams('발정, 왔어!')).toEqual(toBigrams('발정왔어'));
  });

  it('빈 문자열에 안전하다', () => {
    expect(toBigrams('').size).toBe(0);
  });
});

describe('containmentRatio', () => {
  it('들린 쪽이 기억에 완전히 포함되면 1', () => {
    const spoken = toBigrams('423번 소의 체온이 높습니다');
    const heard = toBigrams('체온이 높습니다');
    expect(containmentRatio(heard, spoken)).toBe(1);
  });

  it('전혀 겹치지 않으면 0', () => {
    expect(containmentRatio(toBigrams('사료 주문해줘'), toBigrams('체온이 높습니다'))).toBe(0);
  });
});

describe('EchoGuard', () => {
  it('방금 말한 내용이 되들어오면 에코로 판정한다', () => {
    const guard = new EchoGuard();
    guard.noteSpoken('423번 소의 체온이 39.2도로 높습니다. 유방염 초기 신호일 수 있습니다.');
    expect(guard.isEcho('체온이 39.2도로 높습니다')).toBe(true);
  });

  it('사용자의 새 질문은 통과시킨다', () => {
    const guard = new EchoGuard();
    guard.noteSpoken('423번 소의 체온이 39.2도로 높습니다.');
    expect(guard.isEcho('그러면 사료는 어떻게 바꿔야 해')).toBe(false);
  });

  it('아무것도 말하지 않았으면 항상 통과', () => {
    const guard = new EchoGuard();
    expect(guard.isEcho('체온이 높습니다')).toBe(false);
  });

  it('짧은 명령은 에코로 보지 않는다 — "그만"을 살려야 한다', () => {
    const guard = new EchoGuard();
    guard.noteSpoken('그만하면 괜찮은 상태입니다');
    expect(guard.isEcho('그만')).toBe(false);
  });

  it('기억은 시간이 지나면 만료된다', () => {
    let now = 1_000_000;
    const guard = new EchoGuard({ memoryMs: 5000, now: () => now });
    guard.noteSpoken('423번 소의 체온이 높습니다');
    expect(guard.isEcho('체온이 높습니다')).toBe(true);
    now += 6000;
    expect(guard.isEcho('체온이 높습니다')).toBe(false);
  });

  it('clear로 즉시 잊는다', () => {
    const guard = new EchoGuard();
    guard.noteSpoken('423번 소의 체온이 높습니다');
    guard.clear();
    expect(guard.isEcho('체온이 높습니다')).toBe(false);
  });

  it('여러 문장을 기억해 어느 것과 겹쳐도 잡는다', () => {
    const guard = new EchoGuard();
    guard.noteSpoken('첫 번째 문장은 체온에 관한 내용입니다');
    guard.noteSpoken('두 번째 문장은 수정 적기에 관한 내용입니다');
    expect(guard.isEcho('수정 적기에 관한 내용입니다')).toBe(true);
  });
});
