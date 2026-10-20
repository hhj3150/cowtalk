// AI 응답의 SVG 코드블록 정화 — 허용 목록(allowlist) 방식 (SEC-15)
//
// 예전엔 정규식으로 <script>·on*·javascript: 를 지웠는데, `<image href=x /onerror=alert(1)>` 처럼
// 속성 구분자를 비틀면 통과했다. AI 응답은 데이터(이벤트 메모 등)를 통한 프롬프트 주입으로 조작될 수 있다.
// 이제 DOMParser 로 실제 구조를 만든 뒤 허용된 태그·속성만 남겨 다시 직렬화한다.

const ALLOWED_TAGS = new Set([
  'svg', 'g', 'defs', 'title', 'desc', 'path', 'rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon',
  'text', 'tspan', 'lineargradient', 'radialgradient', 'stop', 'clippath', 'mask', 'pattern', 'marker', 'symbol', 'use',
]);

const ALLOWED_ATTRS = new Set([
  'viewbox', 'width', 'height', 'x', 'y', 'x1', 'y1', 'x2', 'y2', 'cx', 'cy', 'r', 'rx', 'ry', 'd', 'points',
  'fill', 'fill-opacity', 'fill-rule', 'stroke', 'stroke-width', 'stroke-opacity', 'stroke-linecap', 'stroke-linejoin',
  'stroke-dasharray', 'stroke-dashoffset', 'opacity', 'transform', 'font-size', 'font-family', 'font-weight',
  'text-anchor', 'dominant-baseline', 'dx', 'dy', 'id', 'class', 'offset', 'stop-color', 'stop-opacity',
  'gradientunits', 'gradienttransform', 'clip-path', 'mask', 'marker-start', 'marker-mid', 'marker-end',
  'markerwidth', 'markerheight', 'refx', 'refy', 'orient', 'preserveaspectratio', 'patternunits', 'xmlns',
  'href', 'xlink:href', 'xmlns:xlink', 'style',
]);

/** href 는 문서 내부 참조(#id)만 — 외부 URL·javascript:·data: 차단 */
function isSafeHref(value: string): boolean {
  return /^#[A-Za-z][\w:.-]*$/.test(value.trim());
}

/** style 은 url()·expression·@import 를 담을 수 없게 */
function isSafeStyle(value: string): boolean {
  return !/url\s*\(|expression\s*\(|@import|javascript:/i.test(value);
}

function cleanNode(el: Element): void {
  for (const child of Array.from(el.children)) {
    if (!ALLOWED_TAGS.has(child.tagName.toLowerCase())) {
      child.remove();
      continue;
    }
    cleanNode(child);
  }
  for (const attr of Array.from(el.attributes)) {
    const name = attr.name.toLowerCase();
    const keep = ALLOWED_ATTRS.has(name)
      && (name !== 'href' && name !== 'xlink:href' || isSafeHref(attr.value))
      && (name !== 'style' || isSafeStyle(attr.value));
    if (!keep) el.removeAttribute(attr.name);
  }
}

/** 정화된 SVG 문자열. 파싱 실패·최상위가 svg 가 아니면 빈 문자열 (렌더링하지 않음) */
export function sanitizeSvg(rawSvg: string): string {
  const doc = new DOMParser().parseFromString(rawSvg.trim(), 'image/svg+xml');
  const root = doc.documentElement;
  if (!root || root.tagName.toLowerCase() !== 'svg' || doc.getElementsByTagName('parsererror').length > 0) return '';
  cleanNode(root);
  // 반응형: 컨테이너 폭에 맞게
  root.removeAttribute('width');
  root.removeAttribute('height');
  if (!root.getAttribute('style')) root.setAttribute('style', 'width:100%;height:auto;display:block');
  return new XMLSerializer().serializeToString(root);
}
