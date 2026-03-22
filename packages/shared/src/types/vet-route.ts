// 수의사 진료경로 최적화 (Vet Route Optimizer)

export interface VetRouteAnimalBriefing {
  readonly animalId: string;
  readonly earTag: string;
  readonly issue: string;
  readonly severity: 'critical' | 'high' | 'medium' | 'low';
  readonly eventType: string;
  readonly sensorSummary: string;
  readonly suggestedAction: string;
  readonly detectedAt: string;
  readonly daysActive: number;
}

export interface VetRouteStop {
  readonly order: number;
  readonly farmId: string;
  readonly farmName: string;
  readonly lat: number;
  readonly lng: number;
  readonly urgencyScore: number; // 0-100
  readonly urgencyLevel: 'critical' | 'high' | 'medium' | 'low';
  readonly estimatedArrivalMinutes: number;
  readonly estimatedDurationMinutes: number;
  readonly distanceFromPrevKm: number;
  readonly travelTimeMinutes: number;
  readonly animalBriefings: readonly VetRouteAnimalBriefing[];
  readonly pendingTreatments: number;
  readonly totalAlarms: number;
}

export interface VetRouteSummary {
  readonly totalStops: number;
  readonly totalDistanceKm: number;
  readonly estimatedTotalTimeMinutes: number;
  readonly criticalStops: number;
  readonly totalAnimalsToCheck: number;
  readonly efficiency: number; // km per stop
}

export interface VetRoutePlan {
  readonly vetId: string;
  readonly vetName: string;
  readonly date: string;
  readonly summary: VetRouteSummary;
  readonly stops: readonly VetRouteStop[];
  readonly aiDayBriefing: string;
  readonly lastUpdated: string;
}
