// 통합 대시보드 — smaXtec 레이아웃 기반 12개 위젯 타입

export interface HerdOverview {
  readonly totalAnimals: number
  readonly sensorAttached: number
  readonly activeAlerts: number
  readonly healthIssues: number
}

export interface HerdDevelopmentPoint {
  readonly month: string  // '2025-01'
  readonly milking: number
  readonly dry: number
  readonly beef: number
}

export interface TodoItem {
  readonly category: string
  readonly label: string
  readonly count: number
  readonly severity: 'critical' | 'high' | 'medium' | 'low' | 'info'
  readonly icon: string
}

export interface HealthStatusBar {
  readonly date: string
  readonly temperatureWarning: number
  readonly healthWarning: number
  readonly ruminationWarning: number
  readonly activityWarning: number
  readonly drinkingWarning: number
}

export interface AssistantAlert {
  readonly type: string
  readonly label: string
  readonly count: number
  readonly severity: 'critical' | 'high' | 'medium' | 'low'
}

export interface RuminationDataPoint {
  readonly date: string
  readonly value: number
  readonly baseline?: number
}

export interface HealthAlertCount {
  readonly type: string
  readonly label: string
  readonly count: number
  readonly icon: string
}

export interface FertilityStatusBar {
  readonly date: string
  readonly estrus: number
  readonly insemination: number
  readonly pregnancyCheck: number
  readonly calving: number
}

export interface FertilityManagementItem {
  readonly category: string
  readonly label: string
  readonly count: number
  readonly icon: string
  readonly severity: 'critical' | 'high' | 'medium' | 'low' | 'info'
}

export interface PhAmplitudeBar {
  readonly stage: string
  readonly label: string
  readonly amplitude: number
  readonly reference: number
}

export interface RumenHealthPoint {
  readonly date: string
  readonly avgPh: number
  readonly threshold: number
}

export interface LiveAlarm {
  readonly eventId: string
  readonly eventType: string
  readonly earTag: string
  readonly farmName: string
  readonly farmId: string
  readonly severity: string
  readonly confidence: number
  readonly details: unknown
  readonly detectedAt: string
  readonly acknowledged: boolean
}

export interface DashboardFarmRanking {
  readonly farmId: string
  readonly farmName: string
  readonly alertCount: number
  readonly topAlarmType: string
}

export interface UnifiedDashboardData {
  readonly farmFilter: string | null
  readonly totalFarms: number
  readonly lastUpdated: string

  // Left column
  readonly herdOverview: HerdOverview
  readonly herdDevelopment: readonly HerdDevelopmentPoint[]
  readonly todoList: readonly TodoItem[]
  readonly healthStatus: readonly HealthStatusBar[]

  // Middle column
  readonly assistantAlerts: readonly AssistantAlert[]
  readonly dailyRumination: readonly RuminationDataPoint[]
  readonly weeklyRumination: readonly RuminationDataPoint[]
  readonly healthAlerts: readonly HealthAlertCount[]

  // Right column
  readonly fertilityStatus: readonly FertilityStatusBar[]
  readonly fertilityManagement: readonly FertilityManagementItem[]
  readonly phAmplitude: readonly PhAmplitudeBar[]
  readonly rumenHealth: readonly RumenHealthPoint[]
}
