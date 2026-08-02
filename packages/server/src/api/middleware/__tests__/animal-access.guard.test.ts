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
 * 개체를 가리키는 경로 파라미터 이름들.
 *
 * 처음엔 ':animalId'만 봤는데, 그게 곧 사각지대가 됐다 —
 * prediction.routes는 ':cowId', calving.routes는 ':calfId'를 쓰는데 둘 다 실제 개체 id다.
 * 이름이 다르다는 이유로 검사에서 빠져 있었다.
 * 새 별칭을 쓸 거면 여기 등록해야 가드가 잡는다.
 */
const ANIMAL_PARAMS: readonly string[] = ['animalId', 'cowId', 'calfId'];

/**
 * 농장 소유 리소스를 가리키는 파라미터 → 요구되는 미들웨어.
 * 남의 목장 우군을 지우거나 처방전을 내려받는 것을 막는다.
 */
const RESOURCE_PARAMS: Readonly<Record<string, string>> = {
  groupId: 'requireGroupAccess',
  alertId: 'requireAlertAccess',
  actionId: 'requireActionAccess',
  prescriptionId: 'requirePrescriptionAccess',
  predictionId: 'requirePredictionAccess',
  treatmentId: 'requireTreatmentAccess',
};

/**
 * 접근 검사를 면제하는 라우트. 반드시 사유를 남긴다.
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

/** 라우트 정의를 전부 수집한다 (여러 줄에 걸친 정의는 시작줄만 본다) */
function collectRoutes(): RouteDef[] {
  const found: RouteDef[] = [];
  const files = readdirSync(ROUTES_DIR).filter((f) => f.endsWith('.routes.ts'));

  for (const file of files) {
    const text = readFileSync(join(ROUTES_DIR, file), 'utf8');
    text.split('\n').forEach((line, idx) => {
      const m = /^[A-Za-z]+Router\.(get|post|put|patch|delete)\(\s*'([^']*)'/.exec(line);
      if (!m) return;
      const [, method, path] = m;
      if (!path) return;
      found.push({ file, line: idx + 1, method: method ?? '', path, raw: line });
    });
  }
  return found;
}

const describeRoute = (r: RouteDef): string =>
  `${r.file}:${String(r.line)}  ${r.method.toUpperCase()} ${r.path}`;

const isExempt = (r: RouteDef): boolean => `${r.file}:${r.path}` in EXEMPT;

describe('개체 접근 커버리지 가드', () => {
  const allRoutes = collectRoutes();
  const animalRoutes = allRoutes.filter((r) =>
    ANIMAL_PARAMS.some((p) => r.path.includes(`:${p}`)),
  );

  it('개체 라우트가 실제로 수집된다 — 가드가 헛돌고 있지 않은지', () => {
    // 수집이 0이면 정규식이 깨진 것이고, 그러면 아래 검사가 무의미하게 통과한다.
    expect(animalRoutes.length).toBeGreaterThan(20);
  });

  it('개체를 가리키는 모든 파라미터(별칭 포함)가 requireAnimalAccess를 건다', () => {
    const unguarded = animalRoutes
      .filter((r) => !r.raw.includes('requireAnimalAccess'))
      .filter((r) => !isExempt(r))
      .map(describeRoute);

    // 실패 시 어디를 고쳐야 하는지 목록으로 보여준다
    expect(unguarded).toEqual([]);
  });

  it('개체 별칭도 실제로 존재한다 — ANIMAL_PARAMS가 죽은 목록이 아닌지', () => {
    // cowId/calfId가 코드에서 사라졌다면 목록에서 빼야 한다(가드가 거짓 안심을 주지 않도록)
    for (const p of ANIMAL_PARAMS) {
      const used = allRoutes.some((r) => r.path.includes(`:${p}`));
      expect(used, `ANIMAL_PARAMS의 '${p}'를 쓰는 라우트가 없음 — 목록에서 제거하라`).toBe(true);
    }
  });

  it('농장 소유 리소스 경로는 각자의 접근 검사를 건다', () => {
    const unguarded: string[] = [];
    for (const [param, middleware] of Object.entries(RESOURCE_PARAMS)) {
      for (const r of allRoutes) {
        if (!r.path.includes(`:${param}`)) continue;
        if (isExempt(r)) continue;
        if (!r.raw.includes(middleware)) {
          unguarded.push(`${describeRoute(r)}  → ${middleware} 필요`);
        }
      }
    }
    expect(unguarded).toEqual([]);
  });

  it('면제 목록은 사유가 비어 있지 않다', () => {
    for (const [route, reason] of Object.entries(EXEMPT)) {
      expect(reason.trim().length, `${route} 면제 사유 누락`).toBeGreaterThan(0);
    }
  });

  it('접근 검사를 쓰는 파일은 미들웨어를 import한다', () => {
    const files = readdirSync(ROUTES_DIR).filter((f) => f.endsWith('.routes.ts'));
    const missingImport: string[] = [];
    for (const f of files) {
      const text = readFileSync(join(ROUTES_DIR, f), 'utf8');
      if (text.includes('requireAnimalAccess(') && !text.includes('middleware/animal-access.js')) {
        missingImport.push(`${f} → animal-access`);
      }
      const usesResource = Object.values(RESOURCE_PARAMS).some((mw) => text.includes(mw));
      if (usesResource && !text.includes('middleware/resource-access.js')) {
        missingImport.push(`${f} → resource-access`);
      }
    }
    expect(missingImport).toEqual([]);
  });
});
