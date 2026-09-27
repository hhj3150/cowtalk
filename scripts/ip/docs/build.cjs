#!/usr/bin/env node
/**
 * 저작권 등록 문서(.docx) 재생성 — 내용 수정은 spec.cjs / contract.cjs 에서 한다.
 *
 *   npm i --no-save docx            # 최초 1회 (저장소 의존성에 넣지 않음)
 *   node scripts/ip/docs/build.cjs
 *
 * 목차 쪽번호는 pages-*.json 에 수동으로 둔다(자동 TOC 필드 금지 규칙).
 * 내용이 늘어 쪽이 밀리면 PDF로 변환해 확인한 뒤 JSON 값을 고친다.
 */
const { execFileSync } = require('node:child_process');
const { join, resolve } = require('node:path');

try {
  require.resolve('docx');
} catch {
  console.error('docx 패키지가 없습니다. 먼저 실행: npm i --no-save docx');
  process.exit(1);
}

const ROOT = resolve(__dirname, '../../..');
const OUT = join(ROOT, 'docs/ip-registration');
const jobs = [
  ['spec.cjs', '01_프로그램명세서_초안.docx'],
  ['contract.cjs', '03_저작재산권양도계약서_초안.docx'],
];
for (const [script, file] of jobs) {
  execFileSync(process.execPath, [join(__dirname, script), join(OUT, file)], { stdio: 'inherit' });
  console.log(`생성: docs/ip-registration/${file}`);
}
