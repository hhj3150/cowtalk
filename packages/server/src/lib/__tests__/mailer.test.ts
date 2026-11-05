import { describe, it, expect } from 'vitest';
import { isValidEmail, normalizeRecipients, isMailConfigured, sendMail } from '../mailer.js';

describe('이메일 주소 검증', () => {
  it('형식이 맞는 주소만 통과시킨다', () => {
    expect(isValidEmail('hhj3150@hanmail.net')).toBe(true);
    expect(isValidEmail(' hhj3150@hanmail.net ')).toBe(true); // 앞뒤 공백은 정리 대상
    expect(isValidEmail('hhj3150@hanmail')).toBe(false);      // TLD 없음
    expect(isValidEmail('hhj3150')).toBe(false);
    expect(isValidEmail('a@b.c, c@d.e')).toBe(false);         // 콤마 주입 차단
    expect(isValidEmail(`${'a'.repeat(250)}@b.co`)).toBe(false);
  });
});

describe('수신자 정규화', () => {
  it('공백·대소문자·중복을 정리하고 불량 주소는 버린다', () => {
    expect(normalizeRecipients([' HHJ3150@Hanmail.net ', 'hhj3150@hanmail.net', 'bad-address', ''])).toEqual([
      'hhj3150@hanmail.net',
    ]);
  });

  it('전부 불량이면 빈 배열 (발송 시도 자체를 막는다)', () => {
    expect(normalizeRecipients(['nope', '@x.com'])).toEqual([]);
  });
});

describe('sendMail — SMTP 미설정 환경', () => {
  it('설정이 없으면 발송하지 않고 testMode 로 알린다 (보냈다고 속이지 않는다)', async () => {
    expect(isMailConfigured()).toBe(false); // 테스트 환경에는 SMTP_HOST 가 없다
    const result = await sendMail({
      to: ['hhj3150@hanmail.net'],
      subject: '[CowTalk] 테스트',
      html: '<p>본문</p>',
      text: '본문',
    });
    expect(result).toEqual({ success: true, testMode: true });
  });

  it('유효한 수신자가 하나도 없으면 실패로 돌려준다', async () => {
    const result = await sendMail({ to: ['nope'], subject: 's', html: 'h', text: 't' });
    expect(result.success).toBe(false);
    expect(result.error).toContain('수신자');
  });
});
