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
  name: varchar('name', { length: 100 }),
  breed: varchar('breed', { length: 30 }).notNull().default('holstein'),
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
// Relations (Drizzle ORM)
// ======================================================================

export const regionsRelations = relations(regions, ({ many }) => ({
  farms: many(farms),
}));

export const farmsRelations = relations(farms, ({ one, many }) => ({
  region: one(regions, { fields: [farms.regionId], references: [regions.regionId] }),
  animals: many(animals),
  alerts: many(alerts),
}));

export const animalsRelations = relations(animals, ({ one, many }) => ({
  farm: one(farms, { fields: [animals.farmId], references: [farms.farmId] }),
  predictions: many(predictions),
  alerts: many(alerts),
  breedingEvents: many(breedingEvents),
  healthEvents: many(healthEvents),
}));

export const predictionsRelations = relations(predictions, ({ one, many }) => ({
  animal: one(animals, { fields: [predictions.animalId], references: [animals.animalId] }),
  farm: one(farms, { fields: [predictions.farmId], references: [farms.farmId] }),
  feedback: many(feedback),
  outcomeEvaluations: many(outcomeEvaluations),
}));

export const alertsRelations = relations(alerts, ({ one }) => ({
  animal: one(animals, { fields: [alerts.animalId], references: [animals.animalId] }),
  farm: one(farms, { fields: [alerts.farmId], references: [farms.farmId] }),
  prediction: one(predictions, { fields: [alerts.predictionId], references: [predictions.predictionId] }),
}));
