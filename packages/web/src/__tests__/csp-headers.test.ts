// CSP 가드 — 브라우저가 조용히 막아버리는 것들을 코드로 잡는다
//
// 배경: 팅커벨 음성이 안 들리는 원인을 찾는 데 다섯 번을 왕복했다.
// 최종 원인은 _headers의 CSP에 media-src 지시자가 없어서
// default-src 'self'로 떨어졌고, 거기에 blob:이 없어 <audio src="blob:...">가 차단된 것이었다.
//
// CSP 위반은 기능을 조용히 죽인다 — 코드는 정상인데 브라우저가 막으므로
// 서버 로그에도, 네트워크 탭에도 흔적이 남지 않는다. 그래서 사람이 찾기 가장 어렵다.
// _headers는 순수 텍스트 파일이라 리뷰에서도 놓치기 쉽다 → 필수 항목을 테스트로 고정한다.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HEADERS_PATH = join(dirname(fileURLToPath(import.meta.url)), '../../public/_headers');

function readCsp(): string {
  const text = readFileSync(HEADERS_PATH, 'utf8');
  const line = text.split('\n').find((l) => l.includes('Content-Security-Policy:'));
  if (!line) throw new Error('_headers에 Content-Security-Policy가 없습니다');
  return line.slice(line.indexOf(':') + 1).trim();
}

/** CSP 문자열에서 특정 지시자의 소스 목록을 뽑는다 */
function directive(csp: string, name: string): string | null {
  const found = csp
    .split(';')
    .map((d) => d.trim())
    .find((d) => d === name || d.startsWith(`${name} `));
  return found ?? null;
}

describe('CSP — 기능을 조용히 죽이지 않는지', () => {
  const csp = readCsp();

  it('media-src가 명시돼 있다 — 없으면 default-src로 떨어져 오디오가 막힌다', () => {
    expect(directive(csp, 'media-src')).not.toBeNull();
  });

  it('media-src가 blob:을 허용한다 — TTS 음성은 blob URL로 재생된다', () => {
    // 이게 빠져서 audio.play()가 NotSupportedError로 죽었다 (원인 추적에 다섯 번 왕복)
    expect(directive(csp, 'media-src')).toContain('blob:');
  });

  it('media-src가 data:를 허용한다 — 자동재생 잠금 해제용 무음 MP3가 data URI다', () => {
    expect(directive(csp, 'media-src')).toContain('data:');
  });

  it('connect-src가 Railway를 허용한다 — SSE·음성 합성·전사가 직접 호출한다', () => {
    const connect = directive(csp, 'connect-src');
    expect(connect).toContain('railway.app');
  });

  it('worker-src가 blob:을 허용한다', () => {
    expect(directive(csp, 'worker-src')).toContain('blob:');
  });

  it('img-src가 blob:과 data:를 허용한다 — 첨부 이미지 미리보기', () => {
    const img = directive(csp, 'img-src');
    expect(img).toContain('blob:');
    expect(img).toContain('data:');
  });

  it('object-src는 none으로 잠겨 있다 — 보안 기준선은 유지한다', () => {
    expect(directive(csp, "object-src")).toContain("'none'");
  });

  it('마이크 권한이 열려 있다 — 음성 입력에 필요하다', () => {
    const text = readFileSync(HEADERS_PATH, 'utf8');
    expect(text).toMatch(/Permissions-Policy:.*microphone=\(self\)/);
  });
});
