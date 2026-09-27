#!/usr/bin/env node
/**
 * 한국저작권위원회 컴퓨터프로그램저작물 등록용 "복제물(소스코드)" 생성기
 *
 * 사용법:
 *   node scripts/ip/build-copyright-submission.mjs [--include-tests] [--excerpt-pages 30] [--out <dir>]
 *
 * 산출물 (기본: docs/ip-registration/out/ — git 추적 제외):
 *   - cowtalk-source-full.txt     직접 작성한 전체 소스 (파일 헤더 + 줄번호)
 *   - cowtalk-source-excerpt.txt  앞 N쪽 + 뒤 N쪽 발췌 (1쪽 = 50줄) — 영업비밀 보호용 일부 제출안
 *   - manifest.csv                파일별 줄수·SHA-256 (제출본 동일성 입증용)
 *   - summary.json                규모 요약 + 전체 해시 + 기준 커밋
 *
 * 원칙:
 *   - 직접 작성한 코드만 포함 (node_modules·빌드 산출물·외부 라이브러리 제외)
 *   - 비밀정보 스캔: 키/토큰 패턴이 발견되면 산출물을 만들지 않고 종료 (제출물 유출 방지)
 */
import { createHash } from 'node:crypto';
import { execSync } from 'node:child_process';
import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

const ROOT = resolve(new URL('../..', import.meta.url).pathname);
const PACKAGES = ['shared', 'server', 'web'];
const EXTENSIONS = ['.ts', '.tsx', '.css'];
const LINES_PER_PAGE = 50;

const args = process.argv.slice(2);
const includeTests = args.includes('--include-tests');
const excerptPages = Number(argValue('--excerpt-pages') ?? 30);
const outDir = resolve(ROOT, argValue('--out') ?? 'docs/ip-registration/out');

const SECRET_PATTERNS = [
  { name: 'Anthropic API key', re: /sk-ant-[A-Za-z0-9_-]{20,}/ },
  { name: 'OpenAI-style key', re: /\bsk-[A-Za-z0-9]{32,}\b/ },
  { name: 'AWS access key', re: /\bAKIA[0-9A-Z]{16}\b/ },
  { name: 'Private key block', re: /-----BEGIN [A-Z ]*PRIVATE KEY-----/ },
  { name: 'GitHub token', re: /\bgh[pousr]_[A-Za-z0-9]{36,}\b/ },
  // 값에 숫자가 섞인 경우만 — i18n 라벨(password: 'Password')은 제외
  { name: 'Hard-coded password', re: /password\s*[:=]\s*['"](?=[^'"]*\d)[^'"\s]{6,}['"]/i },
];

// 알려진 비실서비스 값은 스캔을 통과시키되 제출본에서는 가린다 (등록 복제물은 제3자 열람 가능)
const REDACTIONS = [
  {
    path: 'packages/web/src/pages/auth/LoginPage.tsx',
    re: /(DEMO_SEED_PASSWORD\s*=\s*)'[^']*'/,
    replace: "$1'********'",
    reason: '데모 시드 계정 비밀번호 (실서비스 자격증명 아님)',
  },
];

function argValue(flag) {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : undefined;
}

function isTestPath(path) {
  return path.includes('__tests__') || /\.(test|spec)\.tsx?$/.test(path);
}

function walk(dir) {
  const result = [];
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === 'dist' || entry.startsWith('.')) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      result.push(...walk(full));
    } else if (EXTENSIONS.some((ext) => entry.endsWith(ext))) {
      result.push(full);
    }
  }
  return result;
}

function git(cmd) {
  try {
    return execSync(`git ${cmd}`, { cwd: ROOT, encoding: 'utf8' }).trim();
  } catch {
    return 'unknown';
  }
}

const files = PACKAGES.flatMap((pkg) => walk(join(ROOT, 'packages', pkg, 'src')))
  .map((full) => relative(ROOT, full))
  .filter((path) => includeTests || !isTestPath(path))
  .sort();

// 1) 비밀정보 스캔 — 하나라도 걸리면 중단
const secretHits = [];
const contents = new Map();
for (const path of files) {
  let text = readFileSync(join(ROOT, path), 'utf8').replace(/\r\n/g, '\n');
  for (const r of REDACTIONS) {
    if (r.path === path) text = text.replace(r.re, r.replace);
  }
  contents.set(path, text);
  text.split('\n').forEach((line, idx) => {
    for (const { name, re } of SECRET_PATTERNS) {
      if (re.test(line)) secretHits.push(`${path}:${idx + 1} [${name}]`);
    }
  });
}
if (secretHits.length > 0) {
  console.error('비밀정보로 의심되는 패턴이 발견되어 중단합니다. 제거 후 다시 실행하세요:');
  for (const hit of secretHits) console.error(`  - ${hit}`);
  process.exit(1);
}

// 2) 전체 소스 목록 생성
const commit = git('rev-parse --short HEAD');
const commitDate = git('log -1 --format=%ad --date=short');
const header = [
  '프로그램 제호 : CowTalk v5.0 (카우톡) — 축산 디지털 운영체제',
  `기준 커밋     : ${commit} (${commitDate})`,
  `생성 일시     : ${new Date().toISOString()}`,
  `수록 범위     : packages/{${PACKAGES.join(',')}}/src ${EXTENSIONS.join(' ')}${includeTests ? ' (테스트 포함)' : ' (테스트 제외)'}`,
  '제외 대상     : node_modules, 빌드 산출물, 환경변수 파일, 외부 오픈소스 라이브러리',
  ...REDACTIONS.map((r) => `가림 처리     : ${r.path} — ${r.reason}`),
  '',
];

const bodyLines = [];
const manifest = ['path,lines,sha256'];
const overallHash = createHash('sha256');
let totalLines = 0;

for (const path of files) {
  const text = contents.get(path);
  const lines = text.split('\n');
  if (lines.at(-1) === '') lines.pop();
  const sha = createHash('sha256').update(text).digest('hex');
  overallHash.update(`${path}\0${sha}\n`);
  manifest.push(`${path},${lines.length},${sha}`);
  totalLines += lines.length;

  bodyLines.push('='.repeat(78));
  bodyLines.push(`■ ${path}  (${lines.length}줄)`);
  bodyLines.push('='.repeat(78));
  lines.forEach((line, idx) => bodyLines.push(`${String(idx + 1).padStart(5)}  ${line}`));
  bodyLines.push('');
}

const totalPages = Math.ceil(bodyLines.length / LINES_PER_PAGE);
const paginate = (lines, startPage) => {
  const out = [];
  for (let i = 0; i < lines.length; i += LINES_PER_PAGE) {
    const page = startPage + i / LINES_PER_PAGE;
    out.push(`--- ${page} / ${totalPages} 쪽 ---`, ...lines.slice(i, i + LINES_PER_PAGE));
  }
  return out;
};

mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, 'cowtalk-source-full.txt'), [...header, ...paginate(bodyLines, 1)].join('\n') + '\n');

// 3) 발췌본: 앞 N쪽 + 뒤 N쪽
const cut = excerptPages * LINES_PER_PAGE;
const excerpt =
  bodyLines.length <= cut * 2
    ? paginate(bodyLines, 1)
    : [
        ...paginate(bodyLines.slice(0, cut), 1),
        '',
        `… (중략: ${excerptPages + 1}쪽 ~ ${totalPages - excerptPages}쪽 — 영업비밀 보호를 위해 생략) …`,
        '',
        ...paginate(bodyLines.slice(bodyLines.length - cut), totalPages - excerptPages + 1),
      ];
writeFileSync(
  join(outDir, 'cowtalk-source-excerpt.txt'),
  [...header, `발췌 기준     : 전체 ${totalPages}쪽 중 앞 ${excerptPages}쪽 + 뒤 ${excerptPages}쪽 (1쪽 = ${LINES_PER_PAGE}줄)`, '', ...excerpt].join('\n') + '\n',
);

writeFileSync(join(outDir, 'manifest.csv'), manifest.join('\n') + '\n');

const byPackage = Object.fromEntries(
  PACKAGES.map((pkg) => {
    const pkgFiles = files.filter((p) => p.startsWith(`packages/${pkg}/`));
    const lines = pkgFiles.reduce((sum, p) => sum + contents.get(p).split('\n').length, 0);
    return [pkg, { files: pkgFiles.length, lines }];
  }),
);
const summary = {
  program: 'CowTalk v5.0',
  commit,
  commitDate,
  includeTests,
  files: files.length,
  totalLines,
  totalPages,
  byPackage,
  overallSha256: overallHash.digest('hex'),
};
writeFileSync(join(outDir, 'summary.json'), JSON.stringify(summary, null, 2) + '\n');

console.log(`완료: ${files.length}개 파일, ${totalLines.toLocaleString()}줄, ${totalPages.toLocaleString()}쪽 → ${relative(ROOT, outDir)}/`);
console.log(`전체 SHA-256: ${summary.overallSha256}`);
