// Drizzle ORM 스키마 — 블루프린트 PART 4 전체 테이블
// TimescaleDB hypertable은 마이그레이션 SQL에서 설정

import {
  pgTable,
  uuid,
  varchar,
  text,
  integer,
  real,
  boolean,
  timestamp,
  date,
  jsonb,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

// ======================================================================
// A-0. 멀티테넌트
// ======================================================================

export const tenants = pgTable('tenants', {
  tenantId: uuid('tenant_id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 200 }).notNull(),
  tenantType: varchar('tenant_type', { length: 30 }).notNull(), // farm_owner, vet_clinic, government, feed_company, brand
  scope: jsonb('scope').notNull().default('[]'), // farmId 배열 또는 regionId 배열
  contactName: varchar('contact_name', { length: 100 }),
  contactEmail: varchar('contact_email', { length: 200 }),
  status: varchar('status', { length: 20 }).notNull().default('active'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// ======================================================================
// A. 조직/농장
// ======================================================================

export const regions = pgTable('regions', {
  regionId: uuid('region_id').primaryKey().defaultRandom(),
  province: varchar('province', { length: 50 }).notNull(),
  district: varchar('district', { length: 50 }).notNull(),
  code: varchar('code', { length: 20 }).notNull().unique(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const farms = pgTable('farms', {
  farmId: uuid('farm_id').primaryKey().defaultRandom(),
  externalId: varchar('external_id', { length: 100 }),
  regionId: uuid('region_id').notNull().references(() => regions.regionId),
  name: varchar('name', { length: 200 }).notNull(),
  address: text('address').notNull(),
  lat: real('lat').notNull(),
  lng: real('lng').notNull(),
  capacity: integer('capacity').notNull().default(0),
  currentHeadCount: integer('current_head_count').notNull().default(0),
  status: varchar('status', { length: 20 }).notNull().default('active'),
  tenantId: uuid('tenant_id').references(() => tenants.tenantId),
  ownerName: varchar('owner_name', { length: 100 }),
  phone: varchar('phone', { length: 20 }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
}, (table) => [
  index('farms_region_id_idx').on(table.regionId),
  index('farms_status_idx').on(table.status),
]);

export const farmGroups = pgTable('farm_groups', {
  groupId: uuid('group_id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 200 }).notNull(),
  farmIds: jsonb('farm_ids').notNull().$type<string[]>(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// ======================================================================
// B. 동물
// ======================================================================

export const animals = pgTable('animals', {
  animalId: uuid('animal_id').primaryKey().defaultRandom(),
  externalId: varchar('external_id', { length: 100 }),
  farmId: uuid('farm_id').notNull().references(() => farms.farmId),
  earTag: varchar('ear_tag', { length: 50 }).notNull(),
  traceId: varchar('trace_id', { length: 20 }), // 이력번호 (12자리)
  name: varchar('name', { length: 100 }),
  breed: varchar('breed', { length: 30 }).notNull().default('holstein'),
  breedType: varchar('breed_type', { length: 10 }).notNull().default('dairy'), // dairy | beef
  sex: varchar('sex', { length: 10 }).notNull().default('female'),
  birthDate: date('birth_date'),
  parity: integer('parity').notNull().default(0),
  daysInMilk: integer('days_in_milk'),
  lactationStatus: varchar('lactation_status', { length: 20 }).notNull().default('unknown'),
  currentDeviceId: varchar('current_device_id', { length: 100 }),
  status: varchar('status', { length: 20 }).notNull().default('active'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
}, (table) => [
  index('animals_farm_id_idx').on(table.farmId),
  index('animals_status_idx').on(table.status),
  index('animals_ear_tag_idx').on(table.earTag),
]);

export const animalStatusHistory = pgTable('animal_status_history', {
  historyId: uuid('history_id').primaryKey().defaultRandom(),
  animalId: uuid('animal_id').notNull().references(() => animals.animalId),
  previousStatus: varchar('previous_status', { length: 20 }).notNull(),
  newStatus: varchar('new_status', { length: 20 }).notNull(),
  changedAt: timestamp('changed_at', { withTimezone: true }).notNull().defaultNow(),
  changedBy: uuid('changed_by'),
  reason: text('reason'),
}, (table) => [
  index('animal_status_history_animal_id_idx').on(table.animalId),
]);

// ======================================================================
// C. 센서
// ======================================================================

export const sensorDevices = pgTable('sensor_devices', {
  deviceId: uuid('device_id').primaryKey().defaultRandom(),
  externalId: varchar('external_id', { length: 100 }),
  animalId: uuid('animal_id').notNull().references(() => animals.animalId),
  deviceType: varchar('device_type', { length: 30 }).notNull().default('smaxtec_bolus'),
  installDate: timestamp('install_date', { withTimezone: true }).notNull(),
  removeDate: timestamp('remove_date', { withTimezone: true }),
  status: varchar('status', { length: 20 }).notNull().default('active'),
}, (table) => [
  index('sensor_devices_animal_id_idx').on(table.animalId),
]);

// TimescaleDB hypertable (created in migration SQL)
export const sensorMeasurements = pgTable('sensor_measurements', {
  animalId: uuid('animal_id').notNull().references(() => animals.animalId),
  timestamp: timestamp('timestamp', { withTimezone: true }).notNull(),
  metricType: varchar('metric_type', { length: 30 }).notNull(),
  value: real('value').notNull(),
  qualityFlag: varchar('quality_flag', { length: 10 }).notNull().default('good'),
}, (table) => [
  index('sensor_measurements_animal_id_idx').on(table.animalId),
  index('sensor_measurements_metric_type_idx').on(table.metricType),
]);

export const sensorHourlyAgg = pgTable('sensor_hourly_agg', {
  animalId: uuid('animal_id').notNull().references(() => animals.animalId),
  hour: timestamp('hour', { withTimezone: true }).notNull(),
  metricType: varchar('metric_type', { length: 30 }).notNull(),
  avg: real('avg').notNull(),
  min: real('min').notNull(),
  max: real('max').notNull(),
  stddev: real('stddev').notNull().default(0),
  count: integer('count').notNull().default(0),
}, (table) => [
  index('sensor_hourly_agg_animal_id_idx').on(table.animalId),
]);

export const sensorDailyAgg = pgTable('sensor_daily_agg', {
  animalId: uuid('animal_id').notNull().references(() => animals.animalId),
  date: date('date').notNull(),
  metricType: varchar('metric_type', { length: 30 }).notNull(),
  avg: real('avg').notNull(),
  min: real('min').notNull(),
  max: real('max').notNull(),
  stddev: real('stddev').notNull().default(0),
  count: integer('count').notNull().default(0),
}, (table) => [
  index('sensor_daily_agg_animal_id_idx').on(table.animalId),
]);

// ======================================================================
// C-2. smaXtec 이벤트 (신뢰 — 재판단 안 함)
// ======================================================================

export const smaxtecEvents = pgTable('smaxtec_events', {
  eventId: uuid('event_id').primaryKey().defaultRandom(),
  externalEventId: varchar('external_event_id', { length: 200 }),
  animalId: uuid('animal_id').notNull().references(() => animals.animalId),
  farmId: uuid('farm_id').notNull().references(() => farms.farmId),
  eventType: varchar('event_type', { length: 50 }).notNull(), // estrus, health_warning, calving, ...
  confidence: real('confidence').notNull().default(0),
  severity: varchar('severity', { length: 20 }).notNull().default('low'),
  stage: varchar('stage', { length: 50 }),
  detectedAt: timestamp('detected_at', { withTimezone: true }).notNull(),
  details: jsonb('details').notNull().default('{}'),
  rawData: jsonb('raw_data').notNull().default('{}'),
  acknowledged: boolean('acknowledged').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('smaxtec_events_animal_id_idx').on(table.animalId),
  index('smaxtec_events_farm_id_idx').on(table.farmId),
  index('smaxtec_events_event_type_idx').on(table.eventType),
  index('smaxtec_events_detected_at_idx').on(table.detectedAt),
]);

// ======================================================================
// D. 번식
// ======================================================================

export const breedingEvents = pgTable('breeding_events', {
  eventId: uuid('event_id').primaryKey().defaultRandom(),
  animalId: uuid('animal_id').notNull().references(() => animals.animalId),
  eventDate: timestamp('event_date', { withTimezone: true }).notNull(),
  type: varchar('type', { length: 20 }).notNull(),
  semenInfo: text('semen_info'),
  technicianId: uuid('technician_id'),
  notes: text('notes'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('breeding_events_animal_id_idx').on(table.animalId),
]);

export const pregnancyChecks = pgTable('pregnancy_checks', {
  checkId: uuid('check_id').primaryKey().defaultRandom(),
  animalId: uuid('animal_id').notNull().references(() => animals.animalId),
  checkDate: timestamp('check_date', { withTimezone: true }).notNull(),
  result: varchar('result', { length: 20 }).notNull(),
  method: varchar('method', { length: 30 }).notNull(),
  daysPostInsemination: integer('days_post_insemination'),
  notes: text('notes'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('pregnancy_checks_animal_id_idx').on(table.animalId),
]);

export const calvingEvents = pgTable('calving_events', {
  eventId: uuid('event_id').primaryKey().defaultRandom(),
  animalId: uuid('animal_id').notNull().references(() => animals.animalId),
  calvingDate: timestamp('calving_date', { withTimezone: true }).notNull(),
  calfSex: varchar('calf_sex', { length: 10 }),
  calfStatus: varchar('calf_status', { length: 20 }),
  complications: text('complications'),
  notes: text('notes'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('calving_events_animal_id_idx').on(table.animalId),
]);

// ======================================================================
// E. 건강
// ======================================================================

export const healthEvents = pgTable('health_events', {
  eventId: uuid('event_id').primaryKey().defaultRandom(),
  animalId: uuid('animal_id').notNull().references(() => animals.animalId),
  eventDate: timestamp('event_date', { withTimezone: true }).notNull(),
  diagnosis: varchar('diagnosis', { length: 200 }).notNull(),
  severity: varchar('severity', { length: 20 }).notNull(),
  notes: text('notes'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('health_events_animal_id_idx').on(table.animalId),
]);

export const treatments = pgTable('treatments', {
  treatmentId: uuid('treatment_id').primaryKey().defaultRandom(),
  healthEventId: uuid('health_event_id').notNull().references(() => healthEvents.eventId),
  drug: varchar('drug', { length: 200 }).notNull(),
  dosage: varchar('dosage', { length: 100 }),
  withdrawalDays: integer('withdrawal_days').notNull().default(0),
  administeredBy: uuid('administered_by'),
  administeredAt: timestamp('administered_at', { withTimezone: true }).notNull(),
}, (table) => [
  index('treatments_health_event_id_idx').on(table.healthEventId),
]);

export const vetVisits = pgTable('vet_visits', {
  visitId: uuid('visit_id').primaryKey().defaultRandom(),
  farmId: uuid('farm_id').notNull().references(() => farms.farmId),
  vetId: uuid('vet_id').notNull(),
  visitDate: timestamp('visit_date', { withTimezone: true }).notNull(),
  notes: text('notes'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('vet_visits_farm_id_idx').on(table.farmId),
]);

// ======================================================================
// F. 생산
// ======================================================================

export const milkRecords = pgTable('milk_records', {
  recordId: uuid('record_id').primaryKey().defaultRandom(),
  animalId: uuid('animal_id').notNull().references(() => animals.animalId),
  date: date('date').notNull(),
  yield: real('yield').notNull(),
  fat: real('fat'),
  protein: real('protein'),
  scc: integer('scc'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('milk_records_animal_id_idx').on(table.animalId),
]);

export const lactationRecords = pgTable('lactation_records', {
  recordId: uuid('record_id').primaryKey().defaultRandom(),
  animalId: uuid('animal_id').notNull().references(() => animals.animalId),
  lactationNumber: integer('lactation_number').notNull(),
  startDate: date('start_date').notNull(),
  endDate: date('end_date'),
  totalYield: real('total_yield'),
}, (table) => [
  index('lactation_records_animal_id_idx').on(table.animalId),
]);

// ======================================================================
// G. 피처
// ======================================================================

export const animalFeatures = pgTable('animal_features', {
  featureId: uuid('feature_id').primaryKey().defaultRandom(),
  animalId: uuid('animal_id').notNull().references(() => animals.animalId),
  timestamp: timestamp('timestamp', { withTimezone: true }).notNull(),
  featureName: varchar('feature_name', { length: 100 }).notNull(),
  value: real('value').notNull(),
  version: varchar('version', { length: 20 }).notNull().default('1.0'),
}, (table) => [
  index('animal_features_animal_id_idx').on(table.animalId),
  index('animal_features_feature_name_idx').on(table.featureName),
]);

export const featureDefinitions = pgTable('feature_definitions', {
  featureId: uuid('feature_id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 100 }).notNull().unique(),
  description: text('description').notNull(),
  source: varchar('source', { length: 50 }).notNull(),
  calculation: text('calculation').notNull(),
  engineUsage: jsonb('engine_usage').notNull().$type<string[]>(),
  version: varchar('version', { length: 20 }).notNull().default('1.0'),
});

// ======================================================================
// H. AI 예측
// ======================================================================

export const predictions = pgTable('predictions', {
  predictionId: uuid('prediction_id').primaryKey().defaultRandom(),
  engineType: varchar('engine_type', { length: 30 }).notNull(),
  animalId: uuid('animal_id').references(() => animals.animalId),
  farmId: uuid('farm_id').notNull().references(() => farms.farmId),
  timestamp: timestamp('timestamp', { withTimezone: true }).notNull(),
  probability: real('probability').notNull(),
  confidence: real('confidence').notNull(),
  severity: varchar('severity', { length: 20 }).notNull(),
  rankScore: real('rank_score').notNull(),
  predictionLabel: varchar('prediction_label', { length: 200 }).notNull(),
  explanationText: text('explanation_text').notNull(),
  contributingFeatures: jsonb('contributing_features').notNull(),
  recommendedAction: text('recommended_action').notNull(),
  modelVersion: varchar('model_version', { length: 50 }).notNull(),
  roleSpecific: jsonb('role_specific').notNull(),
  dataQuality: jsonb('data_quality'),
  featureSnapshotId: uuid('feature_snapshot_id'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('predictions_engine_type_idx').on(table.engineType),
  index('predictions_animal_id_idx').on(table.animalId),
  index('predictions_farm_id_idx').on(table.farmId),
  index('predictions_timestamp_idx').on(table.timestamp),
]);

export const modelRegistry = pgTable('model_registry', {
  modelId: uuid('model_id').primaryKey().defaultRandom(),
  engineType: varchar('engine_type', { length: 30 }).notNull(),
  modelType: varchar('model_type', { length: 20 }).notNull().default('rule_based'),
  version: varchar('version', { length: 50 }).notNull(),
  metrics: jsonb('metrics'),
  isActive: boolean('is_active').notNull().default(true),
  deployedAt: timestamp('deployed_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('model_registry_engine_type_idx').on(table.engineType),
  uniqueIndex('model_registry_engine_version_idx').on(table.engineType, table.version),
]);

// ======================================================================
// I. 알림
// ======================================================================

export const alerts = pgTable('alerts', {
  alertId: uuid('alert_id').primaryKey().defaultRandom(),
  alertType: varchar('alert_type', { length: 30 }).notNull(),
  engineType: varchar('engine_type', { length: 30 }),
  animalId: uuid('animal_id').references(() => animals.animalId),
  farmId: uuid('farm_id').notNull().references(() => farms.farmId),
  predictionId: uuid('prediction_id').references(() => predictions.predictionId),
  priority: varchar('priority', { length: 20 }).notNull(),
  status: varchar('status', { length: 20 }).notNull().default('new'),
  title: varchar('title', { length: 300 }).notNull(),
  explanation: text('explanation').notNull(),
  recommendedAction: text('recommended_action').notNull(),
  dedupKey: varchar('dedup_key', { length: 200 }).notNull(),
  cooldownUntil: timestamp('cooldown_until', { withTimezone: true }),
  expiresAt: timestamp('expires_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('alerts_farm_id_idx').on(table.farmId),
  index('alerts_animal_id_idx').on(table.animalId),
  index('alerts_status_idx').on(table.status),
  index('alerts_priority_idx').on(table.priority),
  index('alerts_dedup_key_idx').on(table.dedupKey),
]);

export const alertHistory = pgTable('alert_history', {
  historyId: uuid('history_id').primaryKey().defaultRandom(),
  alertId: uuid('alert_id').notNull().references(() => alerts.alertId),
  previousStatus: varchar('previous_status', { length: 20 }).notNull(),
  newStatus: varchar('new_status', { length: 20 }).notNull(),
  changedBy: uuid('changed_by'),
  changedAt: timestamp('changed_at', { withTimezone: true }).notNull().defaultNow(),
  notes: text('notes'),
}, (table) => [
  index('alert_history_alert_id_idx').on(table.alertId),
]);

export const notificationLog = pgTable('notification_log', {
  notificationId: uuid('notification_id').primaryKey().defaultRandom(),
  alertId: uuid('alert_id').notNull().references(() => alerts.alertId),
  channel: varchar('channel', { length: 20 }).notNull(),
  recipientId: uuid('recipient_id').notNull(),
  recipientAddress: varchar('recipient_address', { length: 200 }).notNull(),
  sentAt: timestamp('sent_at', { withTimezone: true }).notNull().defaultNow(),
  success: boolean('success').notNull(),
  errorMessage: text('error_message'),
}, (table) => [
  index('notification_log_alert_id_idx').on(table.alertId),
]);

// ======================================================================
// J. 피드백
// ======================================================================

export const feedback = pgTable('feedback', {
  feedbackId: uuid('feedback_id').primaryKey().defaultRandom(),
  predictionId: uuid('prediction_id').references(() => predictions.predictionId),
  alertId: uuid('alert_id').references(() => alerts.alertId),
  animalId: uuid('animal_id').references(() => animals.animalId),
  farmId: uuid('farm_id').notNull().references(() => farms.farmId),
  feedbackType: varchar('feedback_type', { length: 30 }).notNull(),
  feedbackValue: integer('feedback_value'),
  sourceRole: varchar('source_role', { length: 30 }).notNull(),
  recordedBy: uuid('recorded_by').notNull(),
  notes: text('notes'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('feedback_prediction_id_idx').on(table.predictionId),
  index('feedback_farm_id_idx').on(table.farmId),
]);

export const outcomeEvaluations = pgTable('outcome_evaluations', {
  evaluationId: uuid('evaluation_id').primaryKey().defaultRandom(),
  predictionId: uuid('prediction_id').notNull().references(() => predictions.predictionId),
  actualOutcome: text('actual_outcome').notNull(),
  isCorrect: boolean('is_correct').notNull(),
  matchResult: varchar('match_result', { length: 30 }).notNull(),
  evaluatedAt: timestamp('evaluated_at', { withTimezone: true }).notNull().defaultNow(),
  evaluatedBy: uuid('evaluated_by'),
  details: jsonb('details'),
}, (table) => [
  index('outcome_evaluations_prediction_id_idx').on(table.predictionId),
]);

// ======================================================================
// K. 사용자
// ======================================================================

export const users = pgTable('users', {
  userId: uuid('user_id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 100 }).notNull(),
  email: varchar('email', { length: 200 }).notNull().unique(),
  passwordHash: varchar('password_hash', { length: 200 }).notNull(),
  role: varchar('role', { length: 30 }).notNull(),
  status: varchar('status', { length: 20 }).notNull().default('active'),
  lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
}, (table) => [
  uniqueIndex('users_email_idx').on(table.email),
  index('users_role_idx').on(table.role),
]);

export const userFarmAccess = pgTable('user_farm_access', {
  userId: uuid('user_id').notNull().references(() => users.userId),
  farmId: uuid('farm_id').notNull().references(() => farms.farmId),
  permissionLevel: varchar('permission_level', { length: 20 }).notNull().default('read'),
}, (table) => [
  index('user_farm_access_user_id_idx').on(table.userId),
  index('user_farm_access_farm_id_idx').on(table.farmId),
]);

export const refreshTokens = pgTable('refresh_tokens', {
  tokenId: uuid('token_id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.userId),
  tokenHash: varchar('token_hash', { length: 500 }).notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('refresh_tokens_user_id_idx').on(table.userId),
  index('refresh_tokens_token_hash_idx').on(table.tokenHash),
]);

export const auditLog = pgTable('audit_log', {
  auditId: uuid('audit_id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.userId),
  action: varchar('action', { length: 100 }).notNull(),
  resource: varchar('resource', { length: 50 }).notNull(),
  resourceId: uuid('resource_id'),
  details: jsonb('details'),
  ipAddress: varchar('ip_address', { length: 50 }),
  timestamp: timestamp('timestamp', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('audit_log_user_id_idx').on(table.userId),
  index('audit_log_timestamp_idx').on(table.timestamp),
]);

// ======================================================================
// L. 지역
// ======================================================================

export const regionalDailySummary = pgTable('regional_daily_summary', {
  summaryId: uuid('summary_id').primaryKey().defaultRandom(),
  regionId: uuid('region_id').notNull().references(() => regions.regionId),
  date: date('date').notNull(),
  metrics: jsonb('metrics').notNull(),
}, (table) => [
  index('regional_daily_summary_region_id_idx').on(table.regionId),
  index('regional_daily_summary_date_idx').on(table.date),
]);

export const farmDailySummary = pgTable('farm_daily_summary', {
  summaryId: uuid('summary_id').primaryKey().defaultRandom(),
  farmId: uuid('farm_id').notNull().references(() => farms.farmId),
  date: date('date').notNull(),
  metrics: jsonb('metrics').notNull(),
}, (table) => [
  index('farm_daily_summary_farm_id_idx').on(table.farmId),
  index('farm_daily_summary_date_idx').on(table.date),
]);

// ======================================================================
// M. 파이프라인 감사
// ======================================================================

export const dataSources = pgTable('data_sources', {
  sourceId: uuid('source_id').primaryKey().defaultRandom(),
  sourceType: varchar('source_type', { length: 50 }).notNull(),
  config: jsonb('config').notNull(),
  status: varchar('status', { length: 20 }).notNull().default('active'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const ingestionRuns = pgTable('ingestion_runs', {
  runId: uuid('run_id').primaryKey().defaultRandom(),
  sourceId: uuid('source_id').notNull().references(() => dataSources.sourceId),
  startedAt: timestamp('started_at', { withTimezone: true }).notNull(),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  recordsCount: integer('records_count').notNull().default(0),
  status: varchar('status', { length: 20 }).notNull().default('running'),
  errorMessage: text('error_message'),
}, (table) => [
  index('ingestion_runs_source_id_idx').on(table.sourceId),
  index('ingestion_runs_status_idx').on(table.status),
]);

// ======================================================================
// N. 처방전
// ======================================================================

export const drugDatabase = pgTable('drug_database', {
  drugId: uuid('drug_id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 200 }).notNull(),
  category: varchar('category', { length: 50 }).notNull(),
  withdrawalMilkDays: integer('withdrawal_milk_days').notNull().default(0),
  withdrawalMeatDays: integer('withdrawal_meat_days').notNull().default(0),
  unit: varchar('unit', { length: 30 }).notNull().default('ml'),
  description: text('description'),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('drug_database_category_idx').on(table.category),
]);

export const prescriptions = pgTable('prescriptions', {
  prescriptionId: uuid('prescription_id').primaryKey().defaultRandom(),
  animalId: uuid('animal_id').notNull().references(() => animals.animalId),
  farmId: uuid('farm_id').notNull().references(() => farms.farmId),
  vetId: uuid('vet_id').notNull().references(() => users.userId),
  diagnosis: varchar('diagnosis', { length: 300 }).notNull(),
  notes: text('notes'),
  status: varchar('status', { length: 20 }).notNull().default('active'), // active, completed, cancelled
  prescribedAt: timestamp('prescribed_at', { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp('expires_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('prescriptions_animal_id_idx').on(table.animalId),
  index('prescriptions_farm_id_idx').on(table.farmId),
  index('prescriptions_vet_id_idx').on(table.vetId),
  index('prescriptions_status_idx').on(table.status),
]);

export const prescriptionItems = pgTable('prescription_items', {
  itemId: uuid('item_id').primaryKey().defaultRandom(),
  prescriptionId: uuid('prescription_id').notNull().references(() => prescriptions.prescriptionId),
  drugId: uuid('drug_id').notNull().references(() => drugDatabase.drugId),
  dosage: varchar('dosage', { length: 100 }).notNull(),
  frequency: varchar('frequency', { length: 100 }).notNull(),
  durationDays: integer('duration_days').notNull(),
  route: varchar('route', { length: 50 }).notNull().default('oral'), // oral, injection, topical
  notes: text('notes'),
}, (table) => [
  index('prescription_items_prescription_id_idx').on(table.prescriptionId),
  index('prescription_items_drug_id_idx').on(table.drugId),
]);

// ======================================================================
// O. 백신
// ======================================================================

export const vaccineSchedules = pgTable('vaccine_schedules', {
  scheduleId: uuid('schedule_id').primaryKey().defaultRandom(),
  farmId: uuid('farm_id').notNull().references(() => farms.farmId),
  animalId: uuid('animal_id').notNull().references(() => animals.animalId),
  vaccineName: varchar('vaccine_name', { length: 200 }).notNull(),
  scheduledDate: date('scheduled_date').notNull(),
  status: varchar('status', { length: 20 }).notNull().default('pending'), // pending, completed, overdue, cancelled
  notes: text('notes'),
  createdBy: uuid('created_by').references(() => users.userId),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('vaccine_schedules_farm_id_idx').on(table.farmId),
  index('vaccine_schedules_animal_id_idx').on(table.animalId),
  index('vaccine_schedules_status_idx').on(table.status),
  index('vaccine_schedules_scheduled_date_idx').on(table.scheduledDate),
]);

export const vaccineRecords = pgTable('vaccine_records', {
  recordId: uuid('record_id').primaryKey().defaultRandom(),
  scheduleId: uuid('schedule_id').references(() => vaccineSchedules.scheduleId),
  animalId: uuid('animal_id').notNull().references(() => animals.animalId),
  farmId: uuid('farm_id').notNull().references(() => farms.farmId),
  vaccineName: varchar('vaccine_name', { length: 200 }).notNull(),
  batchNumber: varchar('batch_number', { length: 100 }),
  administeredBy: uuid('administered_by').references(() => users.userId),
  administeredAt: timestamp('administered_at', { withTimezone: true }).notNull(),
  notes: text('notes'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('vaccine_records_animal_id_idx').on(table.animalId),
  index('vaccine_records_farm_id_idx').on(table.farmId),
]);

// ======================================================================
// P. 농장 이벤트
// ======================================================================

export const farmEvents = pgTable('farm_events', {
  eventId: uuid('event_id').primaryKey().defaultRandom(),
  farmId: uuid('farm_id').notNull().references(() => farms.farmId),
  animalId: uuid('animal_id').references(() => animals.animalId),
  eventType: varchar('event_type', { length: 50 }).notNull(), // health, breeding, feeding, movement, treatment, observation
  subType: varchar('sub_type', { length: 50 }),
  description: text('description').notNull(),
  severity: varchar('severity', { length: 20 }).notNull().default('normal'),
  recordedBy: uuid('recorded_by').notNull().references(() => users.userId),
  eventDate: timestamp('event_date', { withTimezone: true }).notNull(),
  metadata: jsonb('metadata').notNull().default('{}'),
  aiProcessed: boolean('ai_processed').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('farm_events_farm_id_idx').on(table.farmId),
  index('farm_events_animal_id_idx').on(table.animalId),
  index('farm_events_event_type_idx').on(table.eventType),
  index('farm_events_event_date_idx').on(table.eventDate),
  index('farm_events_ai_processed_idx').on(table.aiProcessed),
]);

export const eventAttachments = pgTable('event_attachments', {
  attachmentId: uuid('attachment_id').primaryKey().defaultRandom(),
  eventId: uuid('event_id').notNull().references(() => farmEvents.eventId),
  fileType: varchar('file_type', { length: 30 }).notNull(), // image, audio, document
  fileUrl: text('file_url').notNull(),
  fileName: varchar('file_name', { length: 300 }),
  fileSizeBytes: integer('file_size_bytes'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('event_attachments_event_id_idx').on(table.eventId),
]);

// ======================================================================
// Q. 경제성
// ======================================================================

export const farmEconomics = pgTable('farm_economics', {
  economicsId: uuid('economics_id').primaryKey().defaultRandom(),
  farmId: uuid('farm_id').notNull().references(() => farms.farmId),
  period: varchar('period', { length: 20 }).notNull(), // YYYY-MM
  revenue: jsonb('revenue').notNull().default('{}'), // { milk, calves, subsidies, other }
  costs: jsonb('costs').notNull().default('{}'), // { feed, labor, vet, equipment, other }
  profitMargin: real('profit_margin'),
  costPerHead: real('cost_per_head'),
  revenuePerHead: real('revenue_per_head'),
  notes: text('notes'),
  recordedBy: uuid('recorded_by').references(() => users.userId),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('farm_economics_farm_id_idx').on(table.farmId),
  index('farm_economics_period_idx').on(table.period),
]);

export const feedPrograms = pgTable('feed_programs', {
  programId: uuid('program_id').primaryKey().defaultRandom(),
  farmId: uuid('farm_id').notNull().references(() => farms.farmId),
  name: varchar('name', { length: 200 }).notNull(),
  targetGroup: varchar('target_group', { length: 50 }).notNull(), // lactating, dry, heifer, calf
  ingredients: jsonb('ingredients').notNull().$type<Array<{ name: string; ratio: number; costPerKg: number }>>(),
  dailyCostPerHead: real('daily_cost_per_head'),
  isActive: boolean('is_active').notNull().default(true),
  createdBy: uuid('created_by').references(() => users.userId),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('feed_programs_farm_id_idx').on(table.farmId),
]);

// ======================================================================
// R. 농장 학습 프로필
// ======================================================================

export const farmLearningProfiles = pgTable('farm_learning_profiles', {
  profileId: uuid('profile_id').primaryKey().defaultRandom(),
  farmId: uuid('farm_id').notNull().references(() => farms.farmId),
  feedbackHistory: jsonb('feedback_history').notNull().default('[]'),
  accuracyMetrics: jsonb('accuracy_metrics').notNull().default('{}'),
  preferenceWeights: jsonb('preference_weights').notNull().default('{}'),
  lastUpdated: timestamp('last_updated', { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex('farm_learning_profiles_farm_id_idx').on(table.farmId),
]);

// ======================================================================
// S. 에스컬레이션
// ======================================================================

export const alertEscalations = pgTable('alert_escalations', {
  escalationId: uuid('escalation_id').primaryKey().defaultRandom(),
  alertId: uuid('alert_id').notNull().references(() => alerts.alertId),
  farmId: uuid('farm_id').notNull().references(() => farms.farmId),
  escalationLevel: integer('escalation_level').notNull().default(1), // 1=farmer, 2=vet, 3=government
  escalatedTo: uuid('escalated_to').references(() => users.userId),
  escalatedAt: timestamp('escalated_at', { withTimezone: true }).notNull().defaultNow(),
  acknowledgedAt: timestamp('acknowledged_at', { withTimezone: true }),
  acknowledgedBy: uuid('acknowledged_by').references(() => users.userId),
  reason: text('reason'),
  status: varchar('status', { length: 20 }).notNull().default('pending'), // pending, acknowledged, resolved
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('alert_escalations_alert_id_idx').on(table.alertId),
  index('alert_escalations_farm_id_idx').on(table.farmId),
  index('alert_escalations_status_idx').on(table.status),
  index('alert_escalations_escalation_level_idx').on(table.escalationLevel),
]);

// ======================================================================
// T. 알림 설정
// ======================================================================

export const notificationPreferences = pgTable('notification_preferences', {
  preferenceId: uuid('preference_id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.userId),
  farmId: uuid('farm_id').references(() => farms.farmId),
  channel: varchar('channel', { length: 30 }).notNull(), // push, email, sms, kakao
  alertTypes: jsonb('alert_types').notNull().$type<string[]>().default([]),
  minSeverity: varchar('min_severity', { length: 20 }).notNull().default('medium'),
  quietHoursStart: varchar('quiet_hours_start', { length: 5 }), // HH:MM
  quietHoursEnd: varchar('quiet_hours_end', { length: 5 }),
  isEnabled: boolean('is_enabled').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('notification_preferences_user_id_idx').on(table.userId),
  index('notification_preferences_farm_id_idx').on(table.farmId),
]);

// ======================================================================
// U. 분만 체크리스트
// ======================================================================

export const calvingChecklists = pgTable('calving_checklists', {
  checklistId: uuid('checklist_id').primaryKey().defaultRandom(),
  calvingEventId: uuid('calving_event_id').notNull().references(() => calvingEvents.eventId),
  calfId: uuid('calf_id').references(() => animals.animalId),
  colostrumFed: boolean('colostrum_fed').notNull().default(false),
  colostrumTimestamp: timestamp('colostrum_timestamp', { withTimezone: true }),
  navelTreated: boolean('navel_treated').notNull().default(false),
  weightKg: real('weight_kg'),
  vitality: varchar('vitality', { length: 20 }), // strong, weak, critical
  notes: text('notes'),
  completedBy: uuid('completed_by').references(() => users.userId),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('calving_checklists_calving_event_id_idx').on(table.calvingEventId),
  index('calving_checklists_calf_id_idx').on(table.calfId),
]);

// ======================================================================
// V. 정액/유전체
// ======================================================================

export const semenCatalog = pgTable('semen_catalog', {
  semenId: uuid('semen_id').primaryKey().defaultRandom(),
  bullName: varchar('bull_name', { length: 200 }).notNull(),
  bullRegistration: varchar('bull_registration', { length: 100 }),
  breed: varchar('breed', { length: 50 }).notNull(),
  supplier: varchar('supplier', { length: 200 }),
  pricePerStraw: real('price_per_straw'),
  genomicTraits: jsonb('genomic_traits').notNull().default('{}'), // { milk, fat, protein, scs, dpr, pl }
  availableStraws: integer('available_straws').notNull().default(0),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('semen_catalog_breed_idx').on(table.breed),
]);

export const farmSemenInventory = pgTable('farm_semen_inventory', {
  inventoryId: uuid('inventory_id').primaryKey().defaultRandom(),
  farmId: uuid('farm_id').notNull().references(() => farms.farmId),
  semenId: uuid('semen_id').notNull().references(() => semenCatalog.semenId),
  quantity: integer('quantity').notNull().default(0),
  purchasedAt: timestamp('purchased_at', { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp('expires_at', { withTimezone: true }),
  notes: text('notes'),
}, (table) => [
  index('farm_semen_inventory_farm_id_idx').on(table.farmId),
  index('farm_semen_inventory_semen_id_idx').on(table.semenId),
]);

export const genomicData = pgTable('genomic_data', {
  genomicId: uuid('genomic_id').primaryKey().defaultRandom(),
  animalId: uuid('animal_id').notNull().references(() => animals.animalId),
  testDate: date('test_date').notNull(),
  provider: varchar('provider', { length: 100 }),
  traits: jsonb('traits').notNull().default('{}'), // { milk, fat, protein, scs, dpr, pl, type }
  reliabilityPercent: real('reliability_percent'),
  rawDataUrl: text('raw_data_url'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('genomic_data_animal_id_idx').on(table.animalId),
]);

// ======================================================================
// W. 전염병 조기경보
// ======================================================================

export const diseaseClusters = pgTable('disease_clusters', {
  clusterId: uuid('cluster_id').primaryKey().defaultRandom(),
  diseaseType: varchar('disease_type', { length: 100 }).notNull(),
  centerLat: real('center_lat').notNull(),
  centerLng: real('center_lng').notNull(),
  radiusKm: real('radius_km').notNull(),
  level: varchar('level', { length: 20 }).notNull().default('watch'), // normal, watch, warning, outbreak
  status: varchar('status', { length: 20 }).notNull().default('active'), // active, monitoring, resolved, merged
  farmCount: integer('farm_count').notNull().default(0),
  eventCount: integer('event_count').notNull().default(0),
  spreadRateFarmsPerDay: real('spread_rate_farms_per_day').notNull().default(0),
  spreadRateEventsPerDay: real('spread_rate_events_per_day').notNull().default(0),
  spreadDirection: varchar('spread_direction', { length: 50 }),
  spreadTrend: varchar('spread_trend', { length: 20 }).notNull().default('stable'), // accelerating, stable, decelerating
  metadata: jsonb('metadata').notNull().default('{}'),
  firstDetectedAt: timestamp('first_detected_at', { withTimezone: true }).notNull().defaultNow(),
  lastUpdatedAt: timestamp('last_updated_at', { withTimezone: true }).notNull().defaultNow(),
  resolvedAt: timestamp('resolved_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('disease_clusters_level_idx').on(table.level),
  index('disease_clusters_status_idx').on(table.status),
  index('disease_clusters_disease_type_idx').on(table.diseaseType),
  index('disease_clusters_first_detected_idx').on(table.firstDetectedAt),
]);

export const clusterFarmMemberships = pgTable('cluster_farm_memberships', {
  membershipId: uuid('membership_id').primaryKey().defaultRandom(),
  clusterId: uuid('cluster_id').notNull().references(() => diseaseClusters.clusterId),
  farmId: uuid('farm_id').notNull().references(() => farms.farmId),
  eventCount: integer('event_count').notNull().default(0),
  latestEventAt: timestamp('latest_event_at', { withTimezone: true }).notNull().defaultNow(),
  joinedAt: timestamp('joined_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('cluster_farm_memberships_cluster_id_idx').on(table.clusterId),
  index('cluster_farm_memberships_farm_id_idx').on(table.farmId),
  uniqueIndex('cluster_farm_unique').on(table.clusterId, table.farmId),
]);

export const epidemicWarnings = pgTable('epidemic_warnings', {
  warningId: uuid('warning_id').primaryKey().defaultRandom(),
  clusterId: uuid('cluster_id').notNull().references(() => diseaseClusters.clusterId),
  level: varchar('level', { length: 20 }).notNull(), // watch, warning, outbreak
  scope: varchar('scope', { length: 20 }).notNull().default('district'), // farm, district, province, brand, national
  regionId: uuid('region_id').references(() => regions.regionId),
  aiInterpretation: jsonb('ai_interpretation'),
  status: varchar('status', { length: 20 }).notNull().default('active'), // active, acknowledged, resolved
  acknowledgedBy: uuid('acknowledged_by').references(() => users.userId),
  acknowledgedAt: timestamp('acknowledged_at', { withTimezone: true }),
  resolvedAt: timestamp('resolved_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('epidemic_warnings_cluster_id_idx').on(table.clusterId),
  index('epidemic_warnings_level_idx').on(table.level),
  index('epidemic_warnings_status_idx').on(table.status),
  index('epidemic_warnings_region_id_idx').on(table.regionId),
]);

export const epidemicDailySnapshots = pgTable('epidemic_daily_snapshots', {
  snapshotId: uuid('snapshot_id').primaryKey().defaultRandom(),
  date: date('date').notNull(),
  regionId: uuid('region_id').references(() => regions.regionId),
  clusterCount: integer('cluster_count').notNull().default(0),
  warningLevel: varchar('warning_level', { length: 20 }).notNull().default('normal'),
  totalHealthEvents: integer('total_health_events').notNull().default(0),
  totalAffectedFarms: integer('total_affected_farms').notNull().default(0),
  totalAffectedAnimals: integer('total_affected_animals').notNull().default(0),
  metrics: jsonb('metrics').notNull().default('{}'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('epidemic_daily_snapshots_date_idx').on(table.date),
  index('epidemic_daily_snapshots_region_id_idx').on(table.regionId),
  uniqueIndex('epidemic_daily_snapshots_date_region_unique').on(table.date, table.regionId),
]);

// ======================================================================
// Relations (Drizzle ORM)
// ======================================================================

export const regionsRelations = relations(regions, ({ many }) => ({
  farms: many(farms),
}));

export const farmsRelations = relations(farms, ({ one, many }) => ({
  region: one(regions, { fields: [farms.regionId], references: [regions.regionId] }),
  animals: many(animals),
  alerts: many(alerts),
  prescriptions: many(prescriptions),
  vaccineSchedules: many(vaccineSchedules),
  farmEvents: many(farmEvents),
  economics: many(farmEconomics),
  feedPrograms: many(feedPrograms),
  escalations: many(alertEscalations),
}));

export const animalsRelations = relations(animals, ({ one, many }) => ({
  farm: one(farms, { fields: [animals.farmId], references: [farms.farmId] }),
  predictions: many(predictions),
  alerts: many(alerts),
  breedingEvents: many(breedingEvents),
  healthEvents: many(healthEvents),
  prescriptions: many(prescriptions),
  vaccineSchedules: many(vaccineSchedules),
  farmEvents: many(farmEvents),
  genomicData: many(genomicData),
}));

export const predictionsRelations = relations(predictions, ({ one, many }) => ({
  animal: one(animals, { fields: [predictions.animalId], references: [animals.animalId] }),
  farm: one(farms, { fields: [predictions.farmId], references: [farms.farmId] }),
  feedback: many(feedback),
  outcomeEvaluations: many(outcomeEvaluations),
}));

export const alertsRelations = relations(alerts, ({ one, many }) => ({
  animal: one(animals, { fields: [alerts.animalId], references: [animals.animalId] }),
  farm: one(farms, { fields: [alerts.farmId], references: [farms.farmId] }),
  prediction: one(predictions, { fields: [alerts.predictionId], references: [predictions.predictionId] }),
  escalations: many(alertEscalations),
}));

export const prescriptionsRelations = relations(prescriptions, ({ one, many }) => ({
  animal: one(animals, { fields: [prescriptions.animalId], references: [animals.animalId] }),
  farm: one(farms, { fields: [prescriptions.farmId], references: [farms.farmId] }),
  vet: one(users, { fields: [prescriptions.vetId], references: [users.userId] }),
  items: many(prescriptionItems),
}));

export const prescriptionItemsRelations = relations(prescriptionItems, ({ one }) => ({
  prescription: one(prescriptions, { fields: [prescriptionItems.prescriptionId], references: [prescriptions.prescriptionId] }),
  drug: one(drugDatabase, { fields: [prescriptionItems.drugId], references: [drugDatabase.drugId] }),
}));

export const vaccineSchedulesRelations = relations(vaccineSchedules, ({ one, many }) => ({
  farm: one(farms, { fields: [vaccineSchedules.farmId], references: [farms.farmId] }),
  animal: one(animals, { fields: [vaccineSchedules.animalId], references: [animals.animalId] }),
  records: many(vaccineRecords),
}));

export const vaccineRecordsRelations = relations(vaccineRecords, ({ one }) => ({
  schedule: one(vaccineSchedules, { fields: [vaccineRecords.scheduleId], references: [vaccineSchedules.scheduleId] }),
  animal: one(animals, { fields: [vaccineRecords.animalId], references: [animals.animalId] }),
  farm: one(farms, { fields: [vaccineRecords.farmId], references: [farms.farmId] }),
}));

export const farmEventsRelations = relations(farmEvents, ({ one, many }) => ({
  farm: one(farms, { fields: [farmEvents.farmId], references: [farms.farmId] }),
  animal: one(animals, { fields: [farmEvents.animalId], references: [animals.animalId] }),
  recordedByUser: one(users, { fields: [farmEvents.recordedBy], references: [users.userId] }),
  attachments: many(eventAttachments),
}));

export const eventAttachmentsRelations = relations(eventAttachments, ({ one }) => ({
  event: one(farmEvents, { fields: [eventAttachments.eventId], references: [farmEvents.eventId] }),
}));

export const alertEscalationsRelations = relations(alertEscalations, ({ one }) => ({
  alert: one(alerts, { fields: [alertEscalations.alertId], references: [alerts.alertId] }),
  farm: one(farms, { fields: [alertEscalations.farmId], references: [farms.farmId] }),
}));

export const genomicDataRelations = relations(genomicData, ({ one }) => ({
  animal: one(animals, { fields: [genomicData.animalId], references: [animals.animalId] }),
}));

export const diseaseClustersRelations = relations(diseaseClusters, ({ many }) => ({
  farmMemberships: many(clusterFarmMemberships),
  warnings: many(epidemicWarnings),
}));

// ======================================================================
// K. 이벤트 레이블링 (강화학습 피드백)
// ======================================================================

export const eventLabels = pgTable('event_labels', {
  labelId: uuid('label_id').primaryKey().defaultRandom(),
  eventId: uuid('event_id').notNull().references(() => smaxtecEvents.eventId),
  animalId: uuid('animal_id').notNull().references(() => animals.animalId),
  farmId: uuid('farm_id').notNull().references(() => farms.farmId),
  // AI가 예측한 값
  predictedType: varchar('predicted_type', { length: 50 }).notNull(),
  predictedSeverity: varchar('predicted_severity', { length: 20 }).notNull(),
  // 사용자가 판정한 실제 값
  verdict: varchar('verdict', { length: 20 }).notNull(), // confirmed, false_positive, modified, missed
  actualType: varchar('actual_type', { length: 50 }),     // 실제 이벤트 타입 (수정 시)
  actualSeverity: varchar('actual_severity', { length: 20 }), // 실제 심각도 (수정 시)
  actualDiagnosis: text('actual_diagnosis'),               // 실제 진단명 (자유 입력)
  // 추가 메타
  actionTaken: text('action_taken'),                       // 취한 조치
  outcome: varchar('outcome', { length: 30 }),             // resolved, ongoing, worsened, no_action
  notes: text('notes'),
  // 추적
  labeledBy: uuid('labeled_by').references(() => users.userId),
  labeledAt: timestamp('labeled_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('event_labels_event_id_idx').on(table.eventId),
  index('event_labels_farm_id_idx').on(table.farmId),
  index('event_labels_animal_id_idx').on(table.animalId),
  index('event_labels_labeled_at_idx').on(table.labeledAt),
]);

// 예후 추적 (Sovereign AI — 종단적 학습 데이터)
// 진단/처방 후 시간 경과에 따른 결과 기록 → AI 인과관계 학습
export const labelFollowUps = pgTable('label_follow_ups', {
  followUpId: uuid('follow_up_id').primaryKey().defaultRandom(),
  labelId: uuid('label_id').notNull().references(() => eventLabels.labelId),
  eventId: uuid('event_id').notNull().references(() => smaxtecEvents.eventId),
  animalId: uuid('animal_id').notNull().references(() => animals.animalId),
  // 추적 시점
  daysSinceLabel: integer('days_since_label').notNull(),     // D+3, D+7, D+14 등
  followUpDate: timestamp('follow_up_date', { withTimezone: true }).notNull(),
  // 예후 상태
  status: varchar('status', { length: 30 }).notNull(),       // recovered, improving, unchanged, worsened, relapsed, dead
  // 임상 관찰
  clinicalNotes: text('clinical_notes'),                     // 현장 관찰 사항
  temperature: real('temperature'),                           // 체온 (선택)
  appetite: varchar('appetite', { length: 20 }),              // normal, decreased, none
  mobility: varchar('mobility', { length: 20 }),              // normal, reduced, lame
  milkYieldChange: varchar('milk_yield_change', { length: 20 }), // normal, decreased, increased, no_milk
  // 추가 조치
  additionalTreatment: text('additional_treatment'),          // 추가 처치 내용
  treatmentChanged: boolean('treatment_changed').notNull().default(false),
  // AI 대화 요약 (예후 기록 시 AI와 대화한 내용)
  conversationSummary: text('conversation_summary'),
  // 추적
  recordedBy: uuid('recorded_by').references(() => users.userId),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('label_follow_ups_label_id_idx').on(table.labelId),
  index('label_follow_ups_event_id_idx').on(table.eventId),
  index('label_follow_ups_animal_id_idx').on(table.animalId),
  index('label_follow_ups_follow_up_date_idx').on(table.followUpDate),
]);

// ======================================================================
// L. 임상 관찰 기록 (Sovereign AI — 수동 관찰 데이터)
// 이벤트 유무와 관계없이 모든 소에 대한 현장 관찰 기록
// 분만, 수정, 치료, 일반 관찰 등 센서가 잡지 못하는 모든 기록
// ======================================================================

export const clinicalObservations = pgTable('clinical_observations', {
  observationId: uuid('observation_id').primaryKey().defaultRandom(),
  animalId: uuid('animal_id').notNull().references(() => animals.animalId),
  farmId: uuid('farm_id').notNull().references(() => farms.farmId),
  // 관찰 유형
  observationType: varchar('observation_type', { length: 50 }).notNull(),
  // calving, insemination, hoof_treatment, vaccination, deworming,
  // weight_measurement, body_condition, clinical_exam, treatment,
  // surgery, injury, behavior_change, feed_change, general_note
  // 상세 내용
  description: text('description').notNull(),
  // 임상 지표 (선택)
  temperature: real('temperature'),
  bodyConditionScore: real('body_condition_score'),    // 1.0 ~ 5.0
  weight: real('weight'),                              // kg
  // 약물/처치
  medication: text('medication'),                       // 사용 약물
  dosage: text('dosage'),                               // 용량
  treatmentDuration: varchar('treatment_duration', { length: 30 }), // e.g., "3일", "1회"
  // 번식 관련 (수정, 분만 등)
  breedingInfo: text('breeding_info'),                  // 정액 정보, 수정사 등
  calvingInfo: text('calving_info'),                    // 송아지 성별, 난산 여부 등
  // AI 대화 요약
  conversationSummary: text('conversation_summary'),
  // 추적
  observedAt: timestamp('observed_at', { withTimezone: true }).notNull().defaultNow(),
  recordedBy: uuid('recorded_by').references(() => users.userId),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('clinical_observations_animal_id_idx').on(table.animalId),
  index('clinical_observations_farm_id_idx').on(table.farmId),
  index('clinical_observations_type_idx').on(table.observationType),
  index('clinical_observations_observed_at_idx').on(table.observedAt),
]);

// ======================================================================
// M. AI 대화 세션 (Conversation-as-Record)
// 소버린 AI 대화 이력 + 추출된 기록 추적
// 대화 자체가 기록 수단이 되는 소버린 AI의 핵심 데이터
// ======================================================================

export const chatSessions = pgTable('chat_sessions', {
  sessionId: uuid('session_id').primaryKey().defaultRandom(),
  animalId: uuid('animal_id').notNull().references(() => animals.animalId),
  farmId: uuid('farm_id').notNull().references(() => farms.farmId),
  userId: uuid('user_id').notNull().references(() => users.userId),
  // 대화 이력 (jsonb: ChatSessionMessage[])
  messages: jsonb('messages').notNull().default([]),
  // 이 대화에서 추출/저장된 기록 ID 목록
  extractedRecordIds: jsonb('extracted_record_ids').notNull().default([]),
  // 연결된 smaXtec 이벤트 (알람 소 대화 시)
  eventId: varchar('event_id', { length: 100 }),
  // 세션 상태
  status: varchar('status', { length: 20 }).notNull().default('active'),
  // 타임스탬프
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  closedAt: timestamp('closed_at', { withTimezone: true }),
}, (table) => [
  index('chat_sessions_animal_id_idx').on(table.animalId),
  index('chat_sessions_farm_id_idx').on(table.farmId),
  index('chat_sessions_user_id_idx').on(table.userId),
  index('chat_sessions_status_idx').on(table.status),
]);

// ======================================================================
// N. 농장 수익성 입력 데이터
// ======================================================================

export const farmProfitEntries = pgTable('farm_profit_entries', {
  entryId: uuid('entry_id').primaryKey().defaultRandom(),
  farmId: uuid('farm_id').notNull().references(() => farms.farmId),
  period: varchar('period', { length: 7 }).notNull(), // YYYY-MM
  // 수입 (KRW 정수)
  revenueMilk: integer('revenue_milk').notNull().default(0),
  revenueCalves: integer('revenue_calves').notNull().default(0),
  revenueSubsidies: integer('revenue_subsidies').notNull().default(0),
  revenueCullSales: integer('revenue_cull_sales').notNull().default(0),
  revenueOther: integer('revenue_other').notNull().default(0),
  // 지출 (KRW 정수)
  costFeed: integer('cost_feed').notNull().default(0),
  costVet: integer('cost_vet').notNull().default(0),
  costBreeding: integer('cost_breeding').notNull().default(0),
  costLabor: integer('cost_labor').notNull().default(0),
  costFacility: integer('cost_facility').notNull().default(0),
  costOther: integer('cost_other').notNull().default(0),
  // 타임스탬프
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex('farm_profit_entries_farm_period_idx').on(table.farmId, table.period),
  index('farm_profit_entries_farm_id_idx').on(table.farmId),
]);

export const farmProfitEntriesRelations = relations(farmProfitEntries, ({ one }) => ({
  farm: one(farms, { fields: [farmProfitEntries.farmId], references: [farms.farmId] }),
}));

export const clusterFarmMembershipsRelations = relations(clusterFarmMemberships, ({ one }) => ({
  cluster: one(diseaseClusters, { fields: [clusterFarmMemberships.clusterId], references: [diseaseClusters.clusterId] }),
  farm: one(farms, { fields: [clusterFarmMemberships.farmId], references: [farms.farmId] }),
}));

export const epidemicWarningsRelations = relations(epidemicWarnings, ({ one }) => ({
  cluster: one(diseaseClusters, { fields: [epidemicWarnings.clusterId], references: [diseaseClusters.clusterId] }),
  region: one(regions, { fields: [epidemicWarnings.regionId], references: [regions.regionId] }),
}));
