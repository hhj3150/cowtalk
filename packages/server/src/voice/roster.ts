// 농장 개체 로스터 — 정확도의 가장 큰 레버.
//
// 핵심 통찰: 목장에 소는 70마리다. **번호 공간이 닫혀 있다.**
// 일반 음성인식은 0000~99999 중에서 고르지만, 우리는 실제로 존재하는 70개 중에서
// 고르면 된다. 이 제약을 쓰면 STT 공급자를 바꾸지 않고도 개체번호 정확도가 크게 오른다.
//
// 쓰는 곳 둘:
//   1) STT 프롬프트 힌트 — 실제 번호를 미리 알려주면 디코딩이 그쪽으로 기운다
//   2) 사후 대조 — 인식 결과가 로스터에 없으면 가장 가까운 실제 번호를 되묻는다
//
// ⚠️ 조용히 고치지 않는다. 반드시 되묻는다. 틀린 소의 데이터를 답하는 것이
//    "못 알아들었습니다"보다 훨씬 나쁘다.

import { getDb } from '../config/database.js';
import { animals } from '../db/schema.js';
import { and, eq, isNull } from 'drizzle-orm';
import { getRedis } from '../serving/cache.service.js';
import { logger } from '../lib/logger.js';
import { editDistance } from './number-normalize.js';

const CACHE_PREFIX = 'voice:roster:';
const CACHE_TTL_SEC = 300; // 5분 — 개체 구성은 자주 바뀌지 않는다
const MAX_HINT_NUMBERS = 60; // 프롬프트가 길면 그것도 지연이다

export interface RosterEntry {
  readonly earTag: string;
  readonly name?: string;
}

/** 농장의 활성 개체 번호 목록 */
export async function getRoster(farmId?: string | null): Promise<readonly RosterEntry[]> {
  if (!farmId) return [];
  const redis = getRedis();
  const key = CACHE_PREFIX + farmId;

  if (redis) {
    try {
      const raw = await redis.get(key);
      if (raw) return JSON.parse(raw) as RosterEntry[];
    } catch { /* 캐시 실패는 무시하고 DB 로 */ }
  }

  try {
    const db = getDb();
    const rows = await db
      .select({ earTag: animals.earTag, name: animals.name })
      .from(animals)
      .where(and(eq(animals.farmId, farmId), eq(animals.status, 'active'), isNull(animals.deletedAt)))
      .limit(500);

    const list: RosterEntry[] = rows.map((r) => ({
      earTag: r.earTag,
      ...(r.name ? { name: r.name } : {}),
    }));

    if (redis) {
      try { await redis.set(key, JSON.stringify(list), 'EX', CACHE_TTL_SEC); } catch { /* noop */ }
    }
    return list;
  } catch (err) {
    // 로스터를 못 읽어도 대화는 계속된다. 힌트와 대조만 못 할 뿐이다.
    logger.warn({ err, farmId }, '[voice/roster] 조회 실패 — 힌트 없이 진행');
    return [];
  }
}

/**
 * STT 프롬프트에 넣을 힌트 문자열.
 * 번호를 나열하면 디코더가 그 토큰들을 선호하게 된다.
 */
export function buildRosterHint(roster: readonly RosterEntry[]): string[] {
  const tags = roster
    .map((r) => r.earTag)
    .filter((t) => /^\d{3,5}$/.test(t))
    .slice(0, MAX_HINT_NUMBERS);
  return tags.length > 0 ? [`개체번호: ${tags.join(', ')}`] : [];
}

export interface RosterMatch {
  /** 로스터에 정확히 있는 번호 */
  readonly exact?: string;
  /** 없을 때, 편집거리가 가까운 실제 번호들 (가까운 순) */
  readonly near: readonly string[];
}

/**
 * 인식된 번호 후보들을 로스터와 대조한다.
 *
 * - 정확히 있으면 exact
 * - 없으면 편집거리 1~2인 실제 번호를 최대 3개까지 near 로 돌려준다
 *   (자릿수가 다르면 거리를 크게 잡아 잘못된 근접을 막는다)
 */
export function matchRoster(
  candidates: readonly string[],
  roster: readonly RosterEntry[],
): RosterMatch {
  const tags = roster.map((r) => r.earTag);
  const tagSet = new Set(tags);

  for (const c of candidates) {
    if (tagSet.has(c)) return { exact: c, near: [] };
  }
  if (candidates.length === 0 || tags.length === 0) return { near: [] };

  const scored: { tag: string; d: number }[] = [];
  for (const c of candidates) {
    for (const t of tags) {
      // 자릿수가 다르면 애초에 다른 번호일 가능성이 높다
      const penalty = Math.abs(c.length - t.length) * 2;
      const d = editDistance(c, t) + penalty;
      if (d <= 2) scored.push({ tag: t, d });
    }
  }
  scored.sort((a, b) => a.d - b.d);
  const near: string[] = [];
  for (const s of scored) {
    if (!near.includes(s.tag)) near.push(s.tag);
    if (near.length >= 3) break;
  }
  return { near };
}
