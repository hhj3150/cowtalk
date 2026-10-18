// 세션 테스트 — "왜?"가 통하는지는 여기서 갈린다.
// Redis 없이 돌면 메모리 폴백을 쓰므로 단위 테스트가 가능하다.

import { describe, it, expect, beforeEach } from 'vitest';
import { loadSession, appendTurn, clearSession, isResetUtterance } from '../session.js';

const U = 'user-test-1';

describe('음성 대화 세션', () => {
  beforeEach(async () => { await clearSession(U); });

  it('빈 세션으로 시작한다', async () => {
    expect((await loadSession(U)).turns).toEqual([]);
  });

  it('한 왕복이 사용자·어시스턴트 두 턴으로 쌓인다', async () => {
    await appendTurn(U, '1877번 어때', '체온 39.8도입니다.');
    const s = await loadSession(U);
    expect(s.turns).toHaveLength(2);
    expect(s.turns[0]).toEqual({ role: 'user', content: '1877번 어때' });
    expect(s.turns[1]?.role).toBe('assistant');
  });

  it('개체번호를 이어받는다 — "왜?"의 대상이 유지된다', async () => {
    await appendTurn(U, '1877번 어때', '체온 39.8도입니다.', '1877');
    expect((await loadSession(U)).lastAnimalId).toBe('1877');
    // 번호를 말하지 않은 다음 턴에서도 유지된다
    await appendTurn(U, '왜?', '이틀째 39도를 넘었습니다.', undefined);
    expect((await loadSession(U)).lastAnimalId).toBe('1877');
  });

  it('오래된 턴은 밀려난다 — 컨텍스트가 길면 첫 토큰이 늦다', async () => {
    for (let i = 0; i < 8; i++) await appendTurn(U, `질문${i}`, `답변${i}`);
    const s = await loadSession(U);
    expect(s.turns).toHaveLength(8);
    expect(s.turns[0]?.content).toBe('질문4'); // 앞선 것은 사라졌다
  });

  it('긴 턴은 잘린다', async () => {
    await appendTurn(U, 'x'.repeat(500), 'y'.repeat(500));
    const s = await loadSession(U);
    expect(s.turns[0]!.content.length).toBe(300);
  });

  it('userId 가 없으면 아무것도 하지 않는다 (비로그인 경로 방어)', async () => {
    await appendTurn(undefined, 'a', 'b');
    expect((await loadSession(undefined)).turns).toEqual([]);
  });
});

describe('isResetUtterance', () => {
  it('대화를 끊는 발화를 알아본다', () => {
    for (const t of ['처음부터', '초기화', '새로 시작', '그만하자', '리셋']) {
      expect(isResetUtterance(t), t).toBe(true);
    }
  });
  it('일반 질문은 끊지 않는다', () => {
    for (const t of ['1877번 어때', '처음 보는 소야']) {
      expect(isResetUtterance(t), t).toBe(false);
    }
  });
});
