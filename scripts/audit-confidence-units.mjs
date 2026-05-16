#!/usr/bin/env node
// BUG-005 회귀 방지 — confidence 단위 audit (D4)
//
// 검사 대상: SovereignAlarm 룰의 모든 출력 `confidence:` 프로퍼티가
//   - toConfidence01(...) / clampConfidence01(...) 로 감싸졌거나
//   - 0-1 리터럴(0, 1, 0.xx) 이어야 한다.
// 0-100 정수(`confidence: 85`)가 다시 등장하면 D4 위반 → exit 1.
//
// 실행: node scripts/audit-confidence-units.mjs

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const RULES_DIR = join(ROOT, 'packages/server/src/services/sovereign-alarm/rules');

/** 디렉터리 내 .ts 파일 목록 (테스트 제외). */
function tsFiles(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) { out.push(...tsFiles(full)); continue; }
    if (name.endsWith('.ts') && !name.endsWith('.test.ts')) out.push(full);
  }
  return out;
}

const violations = [];

for (const file of tsFiles(RULES_DIR)) {
  const lines = readFileSync(file, 'utf8').split('\n');
  lines.forEach((line, idx) => {
    // 출력 객체 프로퍼티 `confidence:` (들여쓰기 + 콜론). `const confidence =` 는 제외.
    const m = /^\s+confidence:\s*(.+?),?\s*$/.exec(line);
    if (!m) return;
    const expr = m[1].trim();
    const ok =
      expr.includes('toConfidence01(') ||
      expr.includes('clampConfidence01(') ||
      /^0(\.\d+)?$/.test(expr) ||   // 0 또는 0.xx
      /^1(\.0+)?$/.test(expr);      // 1 또는 1.0
    if (!ok) {
      violations.push(`${file.replace(ROOT + '/', '')}:${idx + 1}  confidence: ${expr}`);
    }
  });
}

if (violations.length > 0) {
  console.error('❌ BUG-005 confidence 단위 위반 (D4): 0-100 정수 또는 미변환 confidence 발견');
  for (const v of violations) console.error('   ' + v);
  console.error(`\n총 ${violations.length}건. 모든 룰 출력 confidence 는 toConfidence01(...) 또는 0-1 리터럴이어야 합니다.`);
  process.exit(1);
}

console.log('✅ confidence 단위 audit 통과 — SovereignAlarm 룰 출력 전부 0-1 canonical (D4)');
process.exit(0);
