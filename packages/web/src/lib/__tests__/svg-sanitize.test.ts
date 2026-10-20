// SEC-15 회귀 — AI 가 만든 SVG 의 정규식 정화 우회
import { describe, it, expect } from 'vitest';
import { sanitizeSvg } from '../svg-sanitize';

describe('SEC-15 sanitizeSvg (허용 목록)', () => {
  it('감사 재현 페이로드: <image href=x /onerror=…> 가 남지 않는다', () => {
    const out = sanitizeSvg('<svg xmlns="http://www.w3.org/2000/svg"><image href=x /onerror=alert(1)></svg>');
    expect(out).not.toMatch(/onerror|<image/i);
  });
  it.each([
    '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>',
    '<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"><rect/></svg>',
    '<svg xmlns="http://www.w3.org/2000/svg"><a href="javascript:alert(1)"><text>x</text></a></svg>',
    '<svg xmlns="http://www.w3.org/2000/svg"><foreignObject><img src=x onerror=alert(1)></foreignObject></svg>',
    '<svg xmlns="http://www.w3.org/2000/svg"><use href="https://evil.example/x.svg#a"/></svg>',
    '<svg xmlns="http://www.w3.org/2000/svg"><rect style="background:url(javascript:alert(1))"/></svg>',
    '<svg xmlns="http://www.w3.org/2000/svg"><animate attributeName="href" to="javascript:alert(1)"/></svg>',
  ])('위험 요소 제거: %s', (input) => {
    const out = sanitizeSvg(input);
    expect(out).not.toMatch(/script|onload|onerror|javascript:|foreignObject|evil\.example|<animate/i);
  });
  it('정상 차트 요소는 유지', () => {
    const out = sanitizeSvg('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10" width="200"><rect x="1" y="1" width="5" height="5" fill="#f00"/><text x="1" y="9">38.7°C</text><use href="#a"/></svg>');
    expect(out).toContain('<rect');
    expect(out).toContain('38.7°C');
    expect(out).toContain('href="#a"');
    expect(out).not.toContain('width="200"');
  });
  it('SVG 가 아니거나 깨진 입력은 빈 문자열', () => {
    expect(sanitizeSvg('<div>hi</div>')).toBe('');
    expect(sanitizeSvg('<svg><rect')).toBe('');
  });
});
