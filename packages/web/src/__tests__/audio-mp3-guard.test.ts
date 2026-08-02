// MP3 무결성 검사 — "소리가 안 난다"의 원인을 바이트 단계에서 잡는다
//
// 배경: 서버는 audio/mpeg를 보냈는데 중간 게이트웨이가 본문을 변형하면
// 브라우저는 NotSupportedError만 던지고 원인을 말해주지 않는다.
// 그래서 재생을 시도하기 전에 실제 바이트를 확인한다.

import { describe, it, expect } from 'vitest';
import { looksLikeMp3 } from '@web/api/audio.api';

const bytes = (...v: number[]): ArrayBuffer => new Uint8Array(v).buffer;

describe('looksLikeMp3', () => {
  it('ID3 태그로 시작하는 MP3를 인정한다', () => {
    expect(looksLikeMp3(bytes(0x49, 0x44, 0x33, 0x04, 0x00))).toBe(true);
  });

  it('프레임 싱크로 시작하는 MP3를 인정한다', () => {
    expect(looksLikeMp3(bytes(0xff, 0xfb, 0x90, 0x00))).toBe(true);
    expect(looksLikeMp3(bytes(0xff, 0xe3, 0x00, 0x00))).toBe(true);
  });

  it('gzip으로 압축된 채 도착한 응답을 거부한다 — 실제로 겪은 실패 모드', () => {
    expect(looksLikeMp3(bytes(0x1f, 0x8b, 0x08, 0x00))).toBe(false);
  });

  it('HTML 오류 페이지를 거부한다', () => {
    // "<!D"
    expect(looksLikeMp3(bytes(0x3c, 0x21, 0x44))).toBe(false);
  });

  it('JSON 응답을 거부한다', () => {
    // '{"e'
    expect(looksLikeMp3(bytes(0x7b, 0x22, 0x65))).toBe(false);
  });

  it('너무 짧은 응답을 거부한다', () => {
    expect(looksLikeMp3(bytes(0xff))).toBe(false);
    expect(looksLikeMp3(new ArrayBuffer(0))).toBe(false);
  });
});
