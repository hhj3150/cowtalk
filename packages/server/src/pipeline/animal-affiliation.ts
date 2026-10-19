// 개체 소속 목장 판정 — smaXtec 동기화용 순수 함수 (DI-02)
//
// 사고: 동기화가 기존 개체를 갱신할 때 farmId 를 바꾸지 않았다. 다른 목장으로 팔려 간 소는
// 옛 목장 소속으로 남고, 새 목장에서 올라온 이벤트·센서가 옛 목장 개체에 붙어 두 목장 데이터가 섞였다.
//
// 기본 동작 (안전한 쪽):
//   - smaXtec 에서 **활성(active)** 으로 올라온 목장이 현재 소속이다 → 다르면 이동
//   - 비활성 목록(옛 목장에 남은 기록)은 소속을 끌어오지 않는다 (왔다 갔다 방지)
//   - 이동하면 animal_transfers 에 이력을 남긴다 (방역 역학 추적에도 쓰임)
//   - 과거 이벤트·진료 기록의 farm_id 는 고치지 않는다 — 귀속 정책은 별도 결정 사항

export interface SyncedAnimalRecord {
  readonly extId: string;
  readonly active: boolean;
  readonly targetFarmId: string;
}

/**
 * 한 번의 동기화에 같은 개체가 여러 목장 목록에 나오면(이동 직후 옛 목장에 비활성으로 남은 경우)
 * 활성 기록을 우선한다. 활성끼리·비활성끼리면 먼저 나온 것을 쓴다.
 */
export function pickCurrentRecords<T extends SyncedAnimalRecord>(records: readonly T[]): T[] {
  const chosen = new Map<string, T>();
  for (const r of records) {
    if (!r.extId) continue;
    const prev = chosen.get(r.extId);
    if (!prev || (!prev.active && r.active)) chosen.set(r.extId, r);
  }
  return [...chosen.values()];
}

export interface AffiliationDecision {
  /** 갱신할 farmId (변경 없으면 현재 값) */
  readonly farmId: string;
  readonly moved: boolean;
  /** 이 기록으로 status 를 갱신해도 되는가 — 다른 목장의 비활성 잔존 기록이면 false */
  readonly applyStatus: boolean;
}

export function decideAffiliation(currentFarmId: string, targetFarmId: string, active: boolean): AffiliationDecision {
  if (currentFarmId === targetFarmId) return { farmId: currentFarmId, moved: false, applyStatus: true };
  if (active) return { farmId: targetFarmId, moved: true, applyStatus: true };
  return { farmId: currentFarmId, moved: false, applyStatus: false };
}

// ── DI-05: 동기화가 로컬 값을 덮어쓰지 않게 ──

/** 목장에서 확정한 종료 상태 — smaXtec 의 active 플래그로 되살리지 않는다 */
const LOCAL_TERMINAL_STATUSES: ReadonlySet<string> = new Set(['sold', 'dead', 'culled', 'transferred']);

/**
 * 동기화로 쓸 status. undefined = 바꾸지 않음.
 * 예전엔 5분마다 smaXtec active 로 덮어써 폐사·도태로 바꾼 소가 다시 active 가 됐다.
 */
export function mergeSyncStatus(localStatus: string, incomingActive: boolean, applyStatus: boolean): string | undefined {
  if (!applyStatus) return undefined;
  if (LOCAL_TERMINAL_STATUSES.has(localStatus)) return undefined;
  return incomingActive ? 'active' : 'inactive';
}

/** 비어 있지 않은 문자열만 반영 — 빈 값·누락으로 수동 입력한 관리번호·이름을 지우지 않는다 */
export function nonEmpty(value: string | null | undefined): string | undefined {
  return typeof value === 'string' && value.trim() !== '' ? value : undefined;
}
