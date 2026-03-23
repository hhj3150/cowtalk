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
  readonly eventType?: string
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
  readonly animalId?: string
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

export interface AiBriefingAlertStats {
  readonly total24h: number
  readonly critical: number
  readonly high: number
  readonly medium: number
  readonly low: number
}

export interface AiBriefingTopFarm {
  readonly farmId: string
  readonly farmName: string
  readonly alertCount: number
  readonly topEventType: string
}

export interface AiBriefingEventDistribution {
  readonly eventType: string
  readonly count: number
  readonly percentage: number
}

export interface AiBriefingCriticalEvent {
  readonly eventId: string
  readonly eventType: string
  readonly farmName: string
  readonly earTag: string
  readonly detectedAt: string
  readonly details: unknown
}

export interface AiBriefingTrendComparison {
  readonly today: number
  readonly yesterday: number
  readonly changePercent: number
  readonly direction: 'up' | 'down' | 'stable'
}

export interface AiBriefingRoleKpi {
  readonly label: string
  readonly value: number | string
  readonly color: string
  readonly drilldownType?: string
}

export interface AiBriefing {
  readonly generatedAt: string
  readonly summary: string
  readonly farmCount: number
  readonly animalCount: number
  readonly alertStats: AiBriefingAlertStats
  readonly topAlertFarms: readonly AiBriefingTopFarm[]
  readonly eventTypeDistribution: readonly AiBriefingEventDistribution[]
  readonly recentCritical: readonly AiBriefingCriticalEvent[]
  readonly trendComparison: AiBriefingTrendComparison
  readonly recommendations: readonly string[]
  readonly roleKpis?: readonly AiBriefingRoleKpi[]
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

// ===========================
// 차트 확장 — 분석 엔드포인트 타입
// ===========================

export interface AlertTrendPoint {
  readonly date: string
  readonly critical: number
  readonly high: number
  readonly medium: number
  readonly low: number
  readonly total: number
  readonly movingAvg: number
}

export interface HerdCompositionItem {
  readonly name: string
  readonly value: number
  readonly color: string
}

export interface FarmComparisonMetrics {
  readonly healthScore: number
  readonly breedingScore: number
  readonly ruminationScore: number
  readonly tempStability: number
  readonly sensorRate: number
  readonly feedEfficiency: number
}

export interface FarmComparisonItem {
  readonly farmName: string
  readonly farmId: string
  readonly metrics: FarmComparisonMetrics
}

/** @deprecated 산점도용 — TempTimelineData로 대체됨 */
export interface TemperatureDistributionPoint {
  readonly animalId: string
  readonly earTag: string
  readonly farmName: string
  readonly temp: number
  readonly severity: 'normal' | 'warning' | 'critical'
}

export interface TempTimelinePoint {
  readonly time: string
  readonly temp: number
  readonly avg: number
  readonly upperThreshold: number
  readonly lowerThreshold: number
  readonly event?: string
  readonly eventDetail?: string
}

export interface TempAlarmPoint {
  readonly time: string
  readonly earTag: string
  readonly farmName: string
  readonly temp: number
  readonly type: 'high' | 'low'
  readonly severity: string
}

export interface TempTimelineData {
  readonly timeline: readonly TempTimelinePoint[]
  readonly alarms: readonly TempAlarmPoint[]
  readonly summary: {
    readonly meanTemp: number
    readonly highAlarms: number
    readonly lowAlarms: number
    readonly totalAlarms: number
    readonly drinkingEvents: number
  }
}

export interface EventTimelineItem {
  readonly time: string
  readonly category: string
  readonly severity: string
  readonly farmName: string
  readonly earTag: string
  readonly details: string
}

// ===========================
// Epidemic Intelligence 타입
// ===========================

export type EpidemicRiskLevel = 'low' | 'moderate' | 'high' | 'critical'

export type TrendDirection = 'rising' | 'stable' | 'declining'

export type EscalationLevel = 'farm' | 'regional' | 'national'

export type HealthGrade = 'A' | 'B' | 'C' | 'D' | 'F'

export type Prediction24h = 'safe' | 'watch' | 'alert' | 'danger'

export interface EpidemicClusterFarm {
  readonly farmId: string
  readonly name: string
  readonly lat: number
  readonly lng: number
  readonly healthAlarmRate: number
  readonly tempAnomalyRate: number
  readonly headCount: number
  readonly alarmCount: number
}

export interface EpidemicCluster {
  readonly clusterId: string
  readonly center: { readonly lat: number; readonly lng: number }
  readonly radius: number
  readonly riskLevel: EpidemicRiskLevel
  readonly affectedFarms: readonly EpidemicClusterFarm[]
  readonly dominantAlarmType: string
  readonly trend: TrendDirection
  readonly firstDetected: string
  readonly estimatedSpreadVelocity: number
  readonly recommendation: string
}

export interface AlarmTypeStat {
  readonly type: string
  readonly count: number
}

export interface NationalSummary {
  readonly totalFarmsMonitored: number
  readonly farmsWithAnomalies: number
  readonly anomalyRate: number
  readonly topAlarmTypes: readonly AlarmTypeStat[]
  readonly last24hTrend: TrendDirection
}

export interface TimelinePoint {
  readonly hour: string
  readonly alarmCount: number
  readonly farmCount: number
  readonly riskScore: number
}

export interface EscalationInfo {
  readonly level: EscalationLevel
  readonly reason: string
  readonly suggestedActions: readonly string[]
}

export interface EpidemicIntelligenceData {
  readonly overallRiskLevel: EpidemicRiskLevel
  readonly riskScore: number
  readonly clusters: readonly EpidemicCluster[]
  readonly nationalSummary: NationalSummary
  readonly timeline: readonly TimelinePoint[]
  readonly escalation: EscalationInfo
}

export interface FarmHealthFactor {
  readonly score: number
  readonly max: number
  readonly alarmRate: number
}

export interface FarmHealthHistoricalFactor {
  readonly score: number
  readonly max: number
  readonly trend: string
}

export interface FarmHealthEpidemiologicalFactor {
  readonly score: number
  readonly max: number
  readonly clusterRisk: string
}

export interface FarmHealthFactors {
  readonly temperature: FarmHealthFactor
  readonly rumination: FarmHealthFactor
  readonly activity: FarmHealthFactor
  readonly historical: FarmHealthHistoricalFactor
  readonly epidemiological: FarmHealthEpidemiologicalFactor
}

export interface FarmHealthScore {
  readonly farmId: string
  readonly name: string
  readonly lat: number
  readonly lng: number
  readonly headCount: number
  readonly healthScore: number
  readonly grade: HealthGrade
  readonly factors: FarmHealthFactors
  readonly trend: TrendDirection
  readonly prediction24h: Prediction24h
}
