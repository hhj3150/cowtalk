// 접촉 네트워크 추적기 — 최근 30일 개체 이동 이력 기반
// BFS로 위험 전파 경로 탐색
// farmTransfers 테이블 (이 서비스에서 가상 조회 → 실제 구현 시 animalTransfers 테이블과 연동)

import { getDb } from '../../config/database.js';
import { farms } from '../../db/schema.js';
import { eq } from 'drizzle-orm';
import { logger } from '../../lib/logger.js';

// ===========================
// 타입
// ===========================

export type RiskLevel = 'none' | 'low' | 'medium' | 'high' | 'source';

export interface NetworkNode {
  readonly farmId: string;
  readonly farmName: string;
  readonly lat: number;
  readonly lng: number;
  readonly headCount: number;
  readonly riskLevel: RiskLevel;
  readonly distanceFromSource: number;  // hop count (0 = source)
}

export interface NetworkEdge {
  readonly fromFarmId: string;
  readonly toFarmId: string;
  readonly transferDate: string;
  readonly animalCount: number;
  readonly direction: 'in' | 'out';
}

export interface ContactNetworkResult {
  readonly sourceFarmId: string;
  readonly nodes: readonly NetworkNode[];
  readonly edges: readonly NetworkEdge[];
  readonly riskChain: readonly string[];  // 위험 전파 경로 (farmId 배열)
  readonly analyzedAt: string;
  readonly period: string;
}

// ===========================
// 개체 이동 이력 조회
// 실제 환경: animalTransfers 테이블 조회
// 현재: 같은 농장 내 최근 등록 개체 기반 추정
// ===========================

interface TransferRecord {
  readonly animalId: string;
  readonly fromFarmId: string;
  readonly toFarmId: string;
  readonly transferDate: string;
  readonly animalCount: number;
}

async function fetchTransfers(farmId: string, days: number): Promise<readonly TransferRecord[]> {
  // 실제 구현: animalTransfers 테이블에서 조회
  // 현재: 같은 지역 농장 간 가상 이동 이력 생성 (시연용)
  void days;  // 미래 구현을 위해 보존
  const db = getDb();

  // 농장 정보 조회
  const farmRow = await db.select({ regionId: farms.regionId })
    .from(farms)
    .where(eq(farms.farmId, farmId))
    .limit(1);

  if (!farmRow[0]) return [];

  // 같은 지역 농장 조회 (연결 가능한 농장)
  const regionFarms = await db.select({ farmId: farms.farmId })
    .from(farms)
    .where(eq(farms.regionId, farmRow[0].regionId))
    .limit(10);

  // 실제 이동 테이블 없을 시 → 같은 지역 농장 간 시연용 가상 이동 이력 생성
  if (regionFarms.length <= 1) return [];

  const now = Date.now();
  const MS_PER_DAY = 86_400_000;
  const mockTransfers: TransferRecord[] = [];

  for (let i = 0; i < Math.min(regionFarms.length - 1, 5); i++) {
    const otherFarm = regionFarms[i];
    if (!otherFarm || otherFarm.farmId === farmId) continue;
    mockTransfers.push({
      animalId: `mock-${String(i)}`,
      fromFarmId: i % 2 === 0 ? farmId : otherFarm.farmId,
      toFarmId: i % 2 === 0 ? otherFarm.farmId : farmId,
      transferDate: new Date(now - (i + 1) * 7 * MS_PER_DAY).toISOString(),
      animalCount: 1 + (i % 3),
    });
  }

  logger.debug({ farmId, regionFarms: regionFarms.length, transfers: mockTransfers.length }, '[ContactTracer] Generated mock transfers');

  return mockTransfers;
}

// ===========================
// 농장 네트워크 구축 (BFS)
// ===========================

export async function buildContactNetwork(
  farmId: string,
  days = 30,
): Promise<ContactNetworkResult> {
  const transfers = await fetchTransfers(farmId, days);

  // 관련 농장 ID 수집
  const relatedFarmIds = new Set<string>([farmId]);
  for (const t of transfers) {
    relatedFarmIds.add(t.fromFarmId);
    relatedFarmIds.add(t.toFarmId);
  }

  const db = getDb();

  // 농장 정보 조회
  const farmRows = await db.select({
    farmId: farms.farmId,
    name: farms.name,
    lat: farms.lat,
    lng: farms.lng,
    currentHeadCount: farms.currentHeadCount,
  })
    .from(farms)
    .where(eq(farms.status, 'active'));

  const farmMap = new Map(farmRows.map((f) => [f.farmId, f]));

  // 에지 목록 구성
  const edgeMap = new Map<string, NetworkEdge>();
  for (const t of transfers) {
    const key = `${t.fromFarmId}-${t.toFarmId}`;
    const existing = edgeMap.get(key);
    edgeMap.set(key, {
      fromFarmId: t.fromFarmId,
      toFarmId: t.toFarmId,
      transferDate: t.transferDate,
      animalCount: (existing?.animalCount ?? 0) + t.animalCount,
      direction: t.toFarmId === farmId ? 'in' : 'out',
    });
  }

  // BFS — hop 거리 계산
  const hopDistance = new Map<string, number>();
  hopDistance.set(farmId, 0);
  const queue = [farmId];

  while (queue.length > 0) {
    const current = queue.shift()!;
    const currentHop = hopDistance.get(current) ?? 0;

    for (const t of transfers) {
      const neighbor = t.fromFarmId === current ? t.toFarmId : (t.toFarmId === current ? t.fromFarmId : null);
      if (neighbor && !hopDistance.has(neighbor)) {
        hopDistance.set(neighbor, currentHop + 1);
        queue.push(neighbor);
      }
    }
  }

  // 위험 레벨 계산
  const getRiskLevel = (fId: string): RiskLevel => {
    if (fId === farmId) return 'source';
    const hop = hopDistance.get(fId) ?? 99;
    if (hop === 1) return 'high';
    if (hop === 2) return 'medium';
    if (hop <= 4) return 'low';
    return 'none';
  };

  // 노드 구성
  const nodes: NetworkNode[] = [];
  for (const fId of relatedFarmIds) {
    const f = farmMap.get(fId);
    if (!f) continue;
    nodes.push({
      farmId: f.farmId,
      farmName: f.name,
      lat: f.lat,
      lng: f.lng,
      headCount: f.currentHeadCount,
      riskLevel: getRiskLevel(fId),
      distanceFromSource: hopDistance.get(fId) ?? 99,
    });
  }

  // 위험 전파 경로 (hop 1까지 직접 연결 경로)
  const riskChain = Array.from(hopDistance.entries())
    .filter(([, h]) => h <= 2)
    .sort(([, a], [, b]) => a - b)
    .map(([fId]) => fId);

  logger.info(
    { sourceFarmId: farmId, nodeCount: nodes.length, edgeCount: edgeMap.size },
    '[ContactTracer] Network built',
  );

  return {
    sourceFarmId: farmId,
    nodes,
    edges: Array.from(edgeMap.values()),
    riskChain,
    analyzedAt: new Date().toISOString(),
    period: `${days}일`,
  };
}
