import { describe, it, expect } from 'vitest';
import { EchoGuard, longestCommonRun, echoRatio } from '../echo-guard';

/** 실제 팅커벨 답변 길이 수준의 문장 — 오판은 답변이 길수록 심해지므로 긴 것으로 검증한다 */
const ANSWER =
  '423번 소는 어제 오후 6시에 발정 알람이 있었습니다. 체온은 38.9도로 정상 범위이고 ' +
  '반추 시간도 안정적입니다. 수정 적기는 오늘 아침 6시경으로 계산됩니다.';

describe('longestCommonRun', () => {
  it('연속으로 겹치는 가장 긴 구간을 잰다', () => {
    // '반추시간도안정적' 8자가 그대로 들어 있다 (공백 제거 후 비교)
    expect(longestCommonRun('반추 시간도 안정적', ANSWER)).toBe(8);
  });

  it('공백·문장부호를 무시하고 비교한다', () => {
    expect(longestCommonRun('체온은 38.9도!!', '체온은389도로 정상')).toBeGreaterThanOrEqual(7);
  });

  it('겹치는 게 없으면 0', () => {
    expect(longestCommonRun('사료 주문해줘', ANSWER)).toBeLessThan(3);
  });

  it('빈 입력에 안전하다', () => {
    expect(longestCommonRun('', ANSWER)).toBe(0);
    expect(longestCommonRun('테스트', '')).toBe(0);
  });
});

describe('echoRatio', () => {
  it('그대로 따라 한 말은 1에 가깝다', () => {
    expect(echoRatio('수정 적기는 오늘 아침 6시경으로 계산됩니다', ANSWER)).toBeGreaterThan(0.9);
  });

  it('단어만 빌려 쓴 질문은 낮다', () => {
    expect(echoRatio('반추 시간은 어때', ANSWER)).toBeLessThan(0.7);
  });

  it('짧은 우연 일치는 0으로 눌러 버린다', () => {
    // 6자 미만 연속 일치는 우연으로 본다
    expect(echoRatio('오늘은?', ANSWER)).toBe(0);
  });
});

describe('EchoGuard — 실제 에코만 차단한다', () => {
  it('스피커로 되돌아온 자기 발화를 차단한다', () => {
    const guard = new EchoGuard();
    guard.noteSpoken(ANSWER);
    expect(guard.isEcho('체온은 38.9도로 정상 범위이고 반추 시간도 안정적입니다')).toBe(true);
    expect(guard.isEcho('수정 적기는 오늘 아침 6시경으로 계산됩니다')).toBe(true);
  });

  // 이 그룹이 이 파일의 존재 이유다.
  // 2-gram 겹침 방식이 여기서 무너져 "음성 인식이 안 된다"는 신고로 이어졌다.
  it('답변 어휘를 되쓰는 후속 질문을 삼키지 않는다', () => {
    const guard = new EchoGuard();
    guard.noteSpoken(ANSWER);

    const followUps = [
      '그러면 수정은 언제 해야 돼',
      '오늘 아침에 수정하면 되나',
      '423번 체온 다시 알려줘',
      '반추 시간은 어때',
      '발정 알람 언제 왔다고',
      '정액은 뭘로 해야 돼',
      '수정 적기가 언제라고 했지',
      '알겠어 고마워',
    ];
    const swallowed = followUps.filter((q) => guard.isEcho(q));
    expect(swallowed).toEqual([]);
  });

  it('짧은 중단 명령은 절대 삼키지 않는다', () => {
    const guard = new EchoGuard();
    guard.noteSpoken(ANSWER);
    expect(guard.isEcho('그만')).toBe(false);
    expect(guard.isEcho('조용히 해')).toBe(false);
    expect(guard.isEcho('팅커벨')).toBe(false);
  });

  it('아무것도 말하지 않았으면 항상 통과', () => {
    expect(new EchoGuard().isEcho('체온이 높습니다')).toBe(false);
  });

  it('기억은 짧게만 유지된다 — 사용자의 다음 발언까지 잡아먹지 않도록', () => {
    let now = 1_000_000;
    const guard = new EchoGuard({ memoryMs: 4000, now: () => now });
    guard.noteSpoken(ANSWER);
    expect(guard.isEcho('수정 적기는 오늘 아침 6시경으로 계산됩니다')).toBe(true);
    now += 5000;
    expect(guard.isEcho('수정 적기는 오늘 아침 6시경으로 계산됩니다')).toBe(false);
  });

  it('clear로 즉시 잊는다 — 마이크를 사용자에게 여는 순간 호출된다', () => {
    const guard = new EchoGuard();
    guard.noteSpoken(ANSWER);
    guard.clear();
    expect(guard.isEcho('수정 적기는 오늘 아침 6시경으로 계산됩니다')).toBe(false);
  });

  it('여러 청크를 기억해 어느 것과 겹쳐도 잡는다', () => {
    const guard = new EchoGuard();
    guard.noteSpoken('첫 번째 문장은 체온에 관한 내용입니다');
    guard.noteSpoken('두 번째 문장은 수정 적기에 관한 내용입니다');
    expect(guard.isEcho('두 번째 문장은 수정 적기에 관한 내용입니다')).toBe(true);
  });
});
