// 커버리지 가드 — "개체 id를 받는 라우트는 반드시 개체 접근 검사를 통과한다"
//
// 이 테스트가 이 작업의 핵심이다.
//
// 라우트마다 검사를 손으로 붙이는 방식은 반드시 실패한다. 실제로 그렇게 되어 있었다 —
// rbac.ts는 잘 만들어져 있었지만 `/sensors/latest/:animalId` 같이 farmId가 없는 경로에는
// 아무 검사도 걸리지 않아, animalId만 알면 남의 목장 데이터가 열렸다.
//
// 그래서 "지금 다 고쳤다"로 끝내지 않고, **새 라우트가 검사를 빠뜨리면 CI가 깨지도록** 만든다.
// 사람의 주의력이 아니라 파이프라인이 불변식을 지킨다.
//
// 새 라우트를 추가하는 사람에게:
//   :animalId 경로를 만들면 requireAnimalAccess()를 함께 넣어라.
//   정말 공개해야 하는 경로라면 EXEMPT에 사유와 함께 등록하라 — 침묵으로 통과시키지 않는다.

import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROUTES_DIR = join(dirname(fileURLToPath(import.meta.url)), '../../routes');

/**
 * 개체 접근 검사를 면제하는 라우트. 반드시 사유를 남긴다.
 * 비어 있는 게 정상이다 — 추가하려면 그만한 근거가 있어야 한다.
 */
const EXEMPT: Readonly<Record<string, string>> = {
  // 예: 'public-stats.routes.ts:/animal/:animalId': '집계만 반환, 개체 식별 정보 없음',
};

interface RouteDef {
  readonly file: string;
  readonly line: number;
  readonly method: string;
  readonly path: string;
  readonly raw: string;
}

/** 라우트 정의 한 줄을 파싱한다 (여러 줄에 걸친 정의는 시작줄만 본다) */
function collectAnimalRoutes(): RouteDef[] {
  const found: RouteDef[] = [];
  const files = readdirSync(ROUTES_DIR).filter((f) => f.endsWith('.routes.ts'));

  for (const file of files) {
    const text = readFileSync(join(ROUTES_DIR, file), 'utf8');
    const lines = text.split('\n');

    lines.forEach((line, idx) => {
      const m = /^[A-Za-z]+Router\.(get|post|put|patch|delete)\(\s*'([^']*)'/.exec(line);
      if (!m) return;
      const [, method, path] = m;
      if (!path || !path.includes(':animalId')) return;
      found.push({ file, line: idx + 1, method: method ?? '', path, raw: line });
    });
  }
  return found;
}

describe('개체 접근 커버리지 가드', () => {
  const routes = collectAnimalRoutes();

  it('개체 라우트가 실제로 수집된다 — 가드가 헛돌고 있지 않은지', () => {
    // 수집이 0이면 정규식이 깨진 것이고, 그러면 아래 검사가 무의미하게 통과한다.
    expect(routes.length).toBeGreaterThan(20);
  });

  it(':animalId 라우트는 전부 requireAnimalAccess를 건다', () => {
    const unguarded = routes
      .filter((r) => !r.raw.includes('requireAnimalAccess'))
      .filter((r) => !(`${r.file}:${r.path}` in EXEMPT))
      .map((r) => `${r.file}:${String(r.line)}  ${r.method.toUpperCase()} ${r.path}`);

    // 실패 시 어디를 고쳐야 하는지 목록으로 보여준다
    expect(unguarded).toEqual([]);
  });

  it('면제 목록은 사유가 비어 있지 않다', () => {
    for (const [route, reason] of Object.entries(EXEMPT)) {
      expect(reason.trim().length, `${route} 면제 사유 누락`).toBeGreaterThan(0);
    }
  });

  it('requireAnimalAccess를 쓰는 파일은 미들웨어를 import한다', () => {
    const files = readdirSync(ROUTES_DIR).filter((f) => f.endsWith('.routes.ts'));
    const missingImport = files.filter((f) => {
      const text = readFileSync(join(ROUTES_DIR, f), 'utf8');
      return text.includes('requireAnimalAccess(') && !text.includes("middleware/animal-access.js");
    });
    expect(missingImport).toEqual([]);
  });
});
