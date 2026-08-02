// 도구 파라미터 스코프 검증 — AI가 접근 제어를 우회하지 못하게 한다
//
// 왜 필요한가:
//   #148/#149에서 HTTP 라우트의 개체·리소스 접근을 막았다. 그런데 팅커벨은 그 라우트를 쓰지 않는다.
//   MCP 도구가 DB를 직접 읽는다. 그래서 게이트웨이에 같은 검사가 없으면 AI가 뒷문이 된다.
//
//   실제로 두 가지가 뚫려 있었다:
//   1) 채팅 요청의 farmId를 클라이언트가 그대로 지정했다 (`farmId: body.farmId ?? null`).
//      JWT의 배정 농장과 대조하지 않아, 남의 farmId를 넣으면 그 농장 데이터가 나왔다.
//   2) query_animal은 status·deletedAt만 걸렀다. 농장 필터가 아예 없었다.
//      이력번호(traceId)는 귀표에 인쇄돼 경매장·수송 중 누구나 볼 수 있다.
//
// 설계:
//   권한의 원천은 **JWT**다. 클라이언트가 보낸 farmId는 "요청"일 뿐 "권한"이 아니다.
//   게이트웨이가 둘을 합성해 실효 스코프를 확정하고, 그 밖의 값은 실행 전에 거부한다.
//   식별자(earTag/traceId)처럼 미리 농장을 알 수 없는 경우는 실행부에 스코프를 주입해 필터링한다.

import { eq } from 'drizzle-orm';
import { getDb } from '../../config/database.js';
import { animals, farms } from '../../db/schema.js';

/** 사용자가 실제로 접근 가능한 농장. null = 무제한(마스터·미배정 관리역할) */
export type AllowedFarms = readonly string[] | null;

const ADMIN_ROLES: readonly string[] = ['government_admin', 'quarantine_officer'];
const FARM_SCOPED_ROLES: readonly string[] = ['farmer', 'veterinarian'];

/** 절대 매칭되지 않는 센티널 — "아무 농장도 볼 수 없음"을 빈 배열 없이 표현 */
export const NO_FARM_SENTINEL = '00000000-0000-0000-0000-000000000000';

export interface ScopeIdentity {
  readonly role: string;
  /** JWT에 담긴 배정 농장 — 이것만이 권한의 근거다 */
  readonly assignedFarmIds?: readonly string[];
  readonly isMaster?: boolean;
}

/**
 * JWT 기준 실효 스코프를 계산한다. rbac.scopedFarmIds와 같은 규칙(배정 우선)을 따른다.
 * - 배정이 있으면 역할 불문 그 농장들로 제한
 * - 배정이 없으면: 마스터·관리역할은 무제한(null), farm-scoped 역할은 센티널(아무것도 못 봄)
 */
export function resolveAllowedFarms(identity: ScopeIdentity): AllowedFarms {
  const assigned = identity.assignedFarmIds ?? [];
  if (assigned.length > 0) return assigned;
  if (identity.isMaster) return null;
  if (ADMIN_ROLES.includes(identity.role)) return null;
  if (FARM_SCOPED_ROLES.includes(identity.role)) return [NO_FARM_SENTINEL];
  // 알 수 없는 역할은 보수적으로 차단한다
  return [NO_FARM_SENTINEL];
}

/** 스코프 안인가 */
export function isFarmAllowed(farmId: string, allowed: AllowedFarms): boolean {
  if (allowed === null) return true;
  return allowed.includes(farmId);
}

/**
 * 클라이언트가 보낸 농장 요청을 권한과 합성한다.
 * 스코프 밖 농장을 요청하면 조용히 확대하지 않고 배정 농장으로 되돌린다.
 */
export function intersectRequestedFarms(
  requested: readonly string[],
  allowed: AllowedFarms,
): readonly string[] {
  if (allowed === null) return requested;
  if (requested.length === 0) return allowed;
  const hit = requested.filter((id) => allowed.includes(id));
  return hit.length > 0 ? hit : allowed;
}

// ── 도구 파라미터 검사 ──

/** 스코프 검사가 필요한 입력 키. 도구가 늘어도 키 이름은 이 집합으로 수렴한다. */
const FARM_KEYS = ['farmId'] as const;
const ANIMAL_KEYS = ['animalId'] as const;

export interface ScopeViolation {
  readonly key: string;
  readonly value: string;
  readonly reason: 'out-of-scope' | 'not-found';
}

async function farmIdOfAnimal(animalId: string): Promise<string | null> {
  const rows = await getDb()
    .select({ farmId: animals.farmId })
    .from(animals)
    .where(eq(animals.animalId, animalId))
    .limit(1);
  return rows[0]?.farmId ?? null;
}

async function farmExists(farmId: string): Promise<boolean> {
  const rows = await getDb()
    .select({ farmId: farms.farmId })
    .from(farms)
    .where(eq(farms.farmId, farmId))
    .limit(1);
  return rows.length > 0;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * 도구 입력에 담긴 농장·개체 식별자가 사용자 스코프 안인지 검사한다.
 * 위반이 하나라도 있으면 실행 전에 거부한다.
 *
 * query_animal_graph의 anchorId처럼 anchorType에 따라 의미가 달라지는 키도 처리한다.
 */
export async function findScopeViolations(
  input: Record<string, unknown>,
  allowed: AllowedFarms,
): Promise<readonly ScopeViolation[]> {
  if (allowed === null) return [];

  const violations: ScopeViolation[] = [];

  const checkFarm = async (key: string, value: string): Promise<void> => {
    if (!UUID_RE.test(value)) return; // 형식이 아니면 도구 자체가 처리하게 둔다
    if (isFarmAllowed(value, allowed)) return;
    // 존재 여부와 무관하게 스코프 밖이면 거부 (존재 확인은 진단 문구용)
    const exists = await farmExists(value);
    violations.push({ key, value, reason: exists ? 'out-of-scope' : 'not-found' });
  };

  const checkAnimal = async (key: string, value: string): Promise<void> => {
    if (!UUID_RE.test(value)) return;
    const farmId = await farmIdOfAnimal(value);
    if (farmId === null) {
      violations.push({ key, value, reason: 'not-found' });
      return;
    }
    if (!isFarmAllowed(farmId, allowed)) {
      violations.push({ key, value, reason: 'out-of-scope' });
    }
  };

  for (const key of FARM_KEYS) {
    const v = input[key];
    if (typeof v === 'string' && v) await checkFarm(key, v);
  }
  for (const key of ANIMAL_KEYS) {
    const v = input[key];
    if (typeof v === 'string' && v) await checkAnimal(key, v);
  }

  // 온톨로지 그래프 — anchorType에 따라 농장 또는 개체
  const anchorId = input.anchorId;
  if (typeof anchorId === 'string' && anchorId) {
    if (input.anchorType === 'farm') await checkFarm('anchorId', anchorId);
    else await checkAnimal('anchorId', anchorId);
  }

  // 배열 형태의 농장 목록
  const farmIds = input.farmIds;
  if (Array.isArray(farmIds)) {
    for (const v of farmIds) {
      if (typeof v === 'string' && v) await checkFarm('farmIds', v);
    }
  }

  return violations;
}

/** 거부 사유를 사용자·AI 모두가 이해할 수 있는 문구로 */
export function describeViolations(violations: readonly ScopeViolation[]): string {
  const outOfScope = violations.filter((v) => v.reason === 'out-of-scope');
  if (outOfScope.length > 0) {
    return '접근 권한이 없는 목장의 데이터입니다. 배정된 목장만 조회할 수 있습니다.';
  }
  return '해당 대상을 찾을 수 없습니다.';
}
