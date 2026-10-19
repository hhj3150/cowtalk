// 인공수정 경로 최적화 (AI Insemination Route Optimizer)

export interface InseminationAnimalBriefing {
  readonly animalId: string;
  readonly earTag: string;
  readonly estrusDetectedAt: string;
  readonly hoursRemaining: number; // 수정 적기 잔여시간
  readonly estrusIntensity: 'strong' | 'moderate' | 'weak' | 'unknown'; // 활동 실측 없으면 unknown
  readonly activityIncreasePct: number | null; // 실측 없으면 null (AI-03: 추정치로 채우지 않음)
  readonly temperatureDelta: number | null; // 체온 변화 (℃), 실측 없으면 null
  readonly lactationNumber: number;
  readonly daysSinceLastCalving: number;
  readonly previousInseminationCount: number; // 이번 사이클 수정 횟수
  readonly suggestedSemen: string; // 정액 추천 안내 (개체 번식 추천 화면에서 품종·근교 검사 후 확정)
  readonly suggestedAction: string;
  readonly optimalWindowStart: string; // ISO
  readonly optimalWindowEnd: string; // ISO
}

export interface InseminationRouteStop {
  readonly order: number;
  readonly farmId: string;
  readonly farmName: string;
  readonly lat: number;
  readonly lng: number;
  readonly priorityScore: number; // 0-100
  readonly priorityLevel: 'urgent' | 'high' | 'medium' | 'low';
  readonly estimatedArrivalMinutes: number;
  readonly estimatedDurationMinutes: number;
  readonly distanceFromPrevKm: number;
  readonly travelTimeMinutes: number;
  readonly animalBriefings: readonly InseminationAnimalBriefing[];
  readonly totalEstrusAnimals: number;
  readonly windowClosingSoonCount: number; // 2시간 이내 수정적기 종료
}

export interface InseminationRouteSummary {
  readonly totalStops: number;
  readonly totalDistanceKm: number;
  readonly estimatedTotalTimeMinutes: number;
  readonly totalEstrusAnimals: number;
  readonly windowClosingSoonCount: number;
  readonly efficiency: number; // km per stop
}

export interface InseminationRoutePlan {
  readonly technicianId: string;
  readonly technicianName: string;
  readonly date: string;
  readonly summary: InseminationRouteSummary;
  readonly stops: readonly InseminationRouteStop[];
  readonly aiBriefing: string;
  readonly lastUpdated: string;
}
