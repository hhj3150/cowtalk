// 인공수정 경로 최적화 (AI Insemination Route Optimizer)

export interface InseminationAnimalBriefing {
  readonly animalId: string;
  readonly earTag: string;
  readonly estrusDetectedAt: string;
  readonly hoursRemaining: number; // 수정 적기 잔여시간
  readonly estrusIntensity: 'strong' | 'moderate' | 'weak';
  readonly activityIncreasePct: number;
  readonly temperatureDelta: number; // 체온 변화 (℃)
  readonly lactationNumber: number;
  readonly daysSinceLastCalving: number;
  readonly previousInseminationCount: number; // 이번 사이클 수정 횟수
  readonly suggestedSemen: string; // AI 추천 정액
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
