// 보고서 데이터 수집 전 스코프 검증 — 채팅·REST 공용
//
// 왜 필요한가:
//   collectReportData는 params를 그대로 믿는다. farmId·animalId·traceNo 중 무엇이든
//   넣으면 그 목장·개체의 데이터를 모은다. 이력번호(traceNo)는 귀표에 인쇄돼 누구나 볼 수 있어,
//   "002132665191 보고서 만들어줘" 한 마디로 남의 소 진료·번식 이력이 문서로 나왔다.
//   또 식별자가 하나도 없으면 수집기가 전체 목장을 집계한다.
//
// 규칙 (JWT 배정 목장 = rbac.scopedFarmIds):
//   - scope === null → 그대로 (마스터·미배정 관리역할)
//   - farmId / animalId / traceNo 는 각각 실제 소속 목장이 범위 안이어야 한다
//   - 식별자가 하나도 없으면: 배정 목장이 하나면 그 목장으로, 아니면 거부(목장 선택 요구)

import { NO_FARM_SENTINEL } from '../../api/middleware/rbac.js';

export interface ReportScopeParams {
  readonly farmId?: string;
  readonly animalId?: string;
  readonly traceNo?: string;
  readonly [key: string]: string | number | undefined;
}

export interface ReportScopeResolvers {
  readonly animalFarm: (animalId: string) => Promise<string | null>;
  /** 이력번호로 찾은 개체들의 소속 목장 (같은 번호가 여러 행이면 모두) */
  readonly traceFarms: (traceNo: string) => Promise<readonly string[]>;
}

export type ReportScopeResult =
  | { readonly ok: true; readonly params: ReportScopeParams }
  | { readonly ok: false; readonly reason: 'out_of_scope' | 'farm_required' | 'not_found'; readonly message: string };

export async function scopeReportParams(
  params: ReportScopeParams,
  scope: readonly string[] | null,
  resolvers: ReportScopeResolvers,
): Promise<ReportScopeResult> {
  if (scope === null) return { ok: true, params };

  const allowed = scope.filter((f) => f !== NO_FARM_SENTINEL);
  const deny = (message: string): ReportScopeResult => ({ ok: false, reason: 'out_of_scope', message });

  if (params.farmId && !allowed.includes(params.farmId)) {
    return deny('담당하지 않는 목장의 보고서는 만들 수 없습니다');
  }

  if (params.animalId) {
    const owner = await resolvers.animalFarm(params.animalId);
    if (!owner) return { ok: false, reason: 'not_found', message: '개체를 찾을 수 없습니다' };
    if (!allowed.includes(owner)) return deny('담당하지 않는 목장의 개체입니다');
  }

  if (params.traceNo) {
    const owners = await resolvers.traceFarms(params.traceNo);
    if (owners.length === 0) return { ok: false, reason: 'not_found', message: '이력번호에 해당하는 개체가 없습니다' };
    if (!owners.every((f) => allowed.includes(f))) return deny('담당하지 않는 목장의 개체입니다');
  }

  if (!params.farmId && !params.animalId && !params.traceNo) {
    if (allowed.length === 1) return { ok: true, params: { ...params, farmId: allowed[0] } };
    return {
      ok: false,
      reason: 'farm_required',
      message: allowed.length === 0
        ? '배정된 목장이 없습니다 — 관리자에게 목장 배정을 요청하세요'
        : '보고서를 만들 목장을 먼저 선택해 주세요',
    };
  }

  return { ok: true, params };
}
