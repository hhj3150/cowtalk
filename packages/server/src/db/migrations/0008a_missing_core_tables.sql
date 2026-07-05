-- 0008a: 스키마-마이그레이션 무결성 복구 — schema.ts에는 정의되어 있으나
-- 어떤 마이그레이션도 생성하지 않던 14개 테이블 백필.
-- (신규 DB에서 0009의 disease_clusters FK, 0019의 smaxtec_events 인덱스가 실패하던 문제 해결)
-- 모든 구문은 멱등(IF NOT EXISTS / duplicate_object 무시) — 기존 DB에는 영향 없음.

CREATE TABLE IF NOT EXISTS "disease_clusters" (
	"cluster_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"disease_type" varchar(100) NOT NULL,
	"center_lat" real NOT NULL,
	"center_lng" real NOT NULL,
	"radius_km" real NOT NULL,
	"level" varchar(20) DEFAULT 'watch' NOT NULL,
	"status" varchar(20) DEFAULT 'active' NOT NULL,
	"farm_count" integer DEFAULT 0 NOT NULL,
	"event_count" integer DEFAULT 0 NOT NULL,
	"spread_rate_farms_per_day" real DEFAULT 0 NOT NULL,
	"spread_rate_events_per_day" real DEFAULT 0 NOT NULL,
	"spread_direction" varchar(50),
	"spread_trend" varchar(20) DEFAULT 'stable' NOT NULL,
	"metadata" jsonb DEFAULT '{}' NOT NULL,
	"first_detected_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "cluster_farm_memberships" (
	"membership_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cluster_id" uuid NOT NULL,
	"farm_id" uuid NOT NULL,
	"event_count" integer DEFAULT 0 NOT NULL,
	"latest_event_at" timestamp with time zone DEFAULT now() NOT NULL,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "smaxtec_events" (
	"event_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"external_event_id" varchar(200),
	"animal_id" uuid NOT NULL,
	"farm_id" uuid NOT NULL,
	"event_type" varchar(50) NOT NULL,
	"confidence" real DEFAULT 0 NOT NULL,
	"severity" varchar(20) DEFAULT 'low' NOT NULL,
	"stage" varchar(50),
	"detected_at" timestamp with time zone NOT NULL,
	"details" jsonb DEFAULT '{}' NOT NULL,
	"raw_data" jsonb DEFAULT '{}' NOT NULL,
	"acknowledged" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "animal_groups" (
	"group_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"farm_id" uuid NOT NULL,
	"name" varchar(100) NOT NULL,
	"group_type" varchar(30) DEFAULT 'custom' NOT NULL,
	"description" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "animal_group_members" (
	"animal_id" uuid NOT NULL,
	"group_id" uuid NOT NULL,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "chat_sessions" (
	"session_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"animal_id" uuid NOT NULL,
	"farm_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"messages" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"extracted_record_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"event_id" varchar(100),
	"status" varchar(20) DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"closed_at" timestamp with time zone
);

CREATE TABLE IF NOT EXISTS "clinical_observations" (
	"observation_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"animal_id" uuid NOT NULL,
	"farm_id" uuid NOT NULL,
	"observation_type" varchar(50) NOT NULL,
	"description" text NOT NULL,
	"temperature" real,
	"body_condition_score" real,
	"weight" real,
	"medication" text,
	"dosage" text,
	"treatment_duration" varchar(30),
	"breeding_info" text,
	"calving_info" text,
	"conversation_summary" text,
	"observed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"recorded_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "epidemic_daily_snapshots" (
	"snapshot_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"date" date NOT NULL,
	"region_id" uuid,
	"cluster_count" integer DEFAULT 0 NOT NULL,
	"warning_level" varchar(20) DEFAULT 'normal' NOT NULL,
	"total_health_events" integer DEFAULT 0 NOT NULL,
	"total_affected_farms" integer DEFAULT 0 NOT NULL,
	"total_affected_animals" integer DEFAULT 0 NOT NULL,
	"metrics" jsonb DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "epidemic_warnings" (
	"warning_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cluster_id" uuid NOT NULL,
	"level" varchar(20) NOT NULL,
	"scope" varchar(20) DEFAULT 'district' NOT NULL,
	"region_id" uuid,
	"ai_interpretation" jsonb,
	"status" varchar(20) DEFAULT 'active' NOT NULL,
	"acknowledged_by" uuid,
	"acknowledged_at" timestamp with time zone,
	"resolved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "event_labels" (
	"label_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"animal_id" uuid NOT NULL,
	"farm_id" uuid NOT NULL,
	"predicted_type" varchar(50) NOT NULL,
	"predicted_severity" varchar(20) NOT NULL,
	"verdict" varchar(20) NOT NULL,
	"actual_type" varchar(50),
	"actual_severity" varchar(20),
	"actual_diagnosis" text,
	"action_taken" text,
	"outcome" varchar(30),
	"notes" text,
	"labeled_by" uuid,
	"labeled_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "label_follow_ups" (
	"follow_up_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"label_id" uuid NOT NULL,
	"event_id" uuid NOT NULL,
	"animal_id" uuid NOT NULL,
	"days_since_label" integer NOT NULL,
	"follow_up_date" timestamp with time zone NOT NULL,
	"status" varchar(30) NOT NULL,
	"clinical_notes" text,
	"temperature" real,
	"appetite" varchar(20),
	"mobility" varchar(20),
	"milk_yield_change" varchar(20),
	"additional_treatment" text,
	"treatment_changed" boolean DEFAULT false NOT NULL,
	"conversation_summary" text,
	"recorded_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "subscriptions" (
	"subscription_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"farm_id" uuid,
	"plan" varchar(20) NOT NULL,
	"status" varchar(20) DEFAULT 'pending' NOT NULL,
	"billing_key" varchar(200),
	"customer_key" varchar(200) NOT NULL,
	"price_monthly" integer NOT NULL,
	"current_period_start" timestamp with time zone,
	"current_period_end" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"trial_ends_at" timestamp with time zone,
	"metadata" jsonb DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "payment_history" (
	"payment_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"subscription_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"toss_order_id" varchar(100) NOT NULL,
	"toss_payment_key" varchar(200),
	"amount" integer NOT NULL,
	"status" varchar(20) DEFAULT 'pending' NOT NULL,
	"failure_code" varchar(50),
	"failure_message" text,
	"paid_at" timestamp with time zone,
	"period_start" timestamp with time zone,
	"period_end" timestamp with time zone,
	"receipt_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payment_history_toss_order_id_unique" UNIQUE("toss_order_id")
);

CREATE TABLE IF NOT EXISTS "weight_measurements" (
	"measurement_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"animal_id" uuid NOT NULL,
	"farm_id" uuid NOT NULL,
	"measured_at" timestamp with time zone NOT NULL,
	"actual_weight_kg" real NOT NULL,
	"side_photo_base64" text,
	"rear_photo_base64" text,
	"side_photo_url" text,
	"rear_photo_url" text,
	"estimated_weight_kg" real,
	"measured_by" uuid,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

DO $$ BEGIN
  ALTER TABLE "animal_group_members" ADD CONSTRAINT "animal_group_members_animal_id_animals_animal_id_fk" FOREIGN KEY ("animal_id") REFERENCES "public"."animals"("animal_id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "animal_group_members" ADD CONSTRAINT "animal_group_members_group_id_animal_groups_group_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."animal_groups"("group_id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "animal_groups" ADD CONSTRAINT "animal_groups_farm_id_farms_farm_id_fk" FOREIGN KEY ("farm_id") REFERENCES "public"."farms"("farm_id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "chat_sessions" ADD CONSTRAINT "chat_sessions_animal_id_animals_animal_id_fk" FOREIGN KEY ("animal_id") REFERENCES "public"."animals"("animal_id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "chat_sessions" ADD CONSTRAINT "chat_sessions_farm_id_farms_farm_id_fk" FOREIGN KEY ("farm_id") REFERENCES "public"."farms"("farm_id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "chat_sessions" ADD CONSTRAINT "chat_sessions_user_id_users_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("user_id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "clinical_observations" ADD CONSTRAINT "clinical_observations_animal_id_animals_animal_id_fk" FOREIGN KEY ("animal_id") REFERENCES "public"."animals"("animal_id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "clinical_observations" ADD CONSTRAINT "clinical_observations_farm_id_farms_farm_id_fk" FOREIGN KEY ("farm_id") REFERENCES "public"."farms"("farm_id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "clinical_observations" ADD CONSTRAINT "clinical_observations_recorded_by_users_user_id_fk" FOREIGN KEY ("recorded_by") REFERENCES "public"."users"("user_id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "cluster_farm_memberships" ADD CONSTRAINT "cluster_farm_memberships_cluster_id_fk" FOREIGN KEY ("cluster_id") REFERENCES "public"."disease_clusters"("cluster_id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "cluster_farm_memberships" ADD CONSTRAINT "cluster_farm_memberships_farm_id_farms_farm_id_fk" FOREIGN KEY ("farm_id") REFERENCES "public"."farms"("farm_id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "epidemic_daily_snapshots" ADD CONSTRAINT "epidemic_daily_snapshots_region_id_regions_region_id_fk" FOREIGN KEY ("region_id") REFERENCES "public"."regions"("region_id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "epidemic_warnings" ADD CONSTRAINT "epidemic_warnings_cluster_id_disease_clusters_cluster_id_fk" FOREIGN KEY ("cluster_id") REFERENCES "public"."disease_clusters"("cluster_id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "epidemic_warnings" ADD CONSTRAINT "epidemic_warnings_region_id_regions_region_id_fk" FOREIGN KEY ("region_id") REFERENCES "public"."regions"("region_id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "epidemic_warnings" ADD CONSTRAINT "epidemic_warnings_acknowledged_by_users_user_id_fk" FOREIGN KEY ("acknowledged_by") REFERENCES "public"."users"("user_id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "event_labels" ADD CONSTRAINT "event_labels_event_id_smaxtec_events_event_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."smaxtec_events"("event_id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "event_labels" ADD CONSTRAINT "event_labels_animal_id_animals_animal_id_fk" FOREIGN KEY ("animal_id") REFERENCES "public"."animals"("animal_id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "event_labels" ADD CONSTRAINT "event_labels_farm_id_farms_farm_id_fk" FOREIGN KEY ("farm_id") REFERENCES "public"."farms"("farm_id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "event_labels" ADD CONSTRAINT "event_labels_labeled_by_users_user_id_fk" FOREIGN KEY ("labeled_by") REFERENCES "public"."users"("user_id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "label_follow_ups" ADD CONSTRAINT "label_follow_ups_label_id_event_labels_label_id_fk" FOREIGN KEY ("label_id") REFERENCES "public"."event_labels"("label_id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "label_follow_ups" ADD CONSTRAINT "label_follow_ups_event_id_smaxtec_events_event_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."smaxtec_events"("event_id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "label_follow_ups" ADD CONSTRAINT "label_follow_ups_animal_id_animals_animal_id_fk" FOREIGN KEY ("animal_id") REFERENCES "public"."animals"("animal_id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "label_follow_ups" ADD CONSTRAINT "label_follow_ups_recorded_by_users_user_id_fk" FOREIGN KEY ("recorded_by") REFERENCES "public"."users"("user_id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "payment_history" ADD CONSTRAINT "payment_history_subscription_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."subscriptions"("subscription_id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "payment_history" ADD CONSTRAINT "payment_history_user_id_users_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("user_id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "smaxtec_events" ADD CONSTRAINT "smaxtec_events_animal_id_animals_animal_id_fk" FOREIGN KEY ("animal_id") REFERENCES "public"."animals"("animal_id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "smaxtec_events" ADD CONSTRAINT "smaxtec_events_farm_id_farms_farm_id_fk" FOREIGN KEY ("farm_id") REFERENCES "public"."farms"("farm_id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_user_id_users_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("user_id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_farm_id_farms_farm_id_fk" FOREIGN KEY ("farm_id") REFERENCES "public"."farms"("farm_id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "weight_measurements" ADD CONSTRAINT "weight_measurements_animal_id_animals_animal_id_fk" FOREIGN KEY ("animal_id") REFERENCES "public"."animals"("animal_id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "weight_measurements" ADD CONSTRAINT "weight_measurements_farm_id_farms_farm_id_fk" FOREIGN KEY ("farm_id") REFERENCES "public"."farms"("farm_id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "weight_measurements" ADD CONSTRAINT "weight_measurements_measured_by_users_user_id_fk" FOREIGN KEY ("measured_by") REFERENCES "public"."users"("user_id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS "animal_group_members_group_id_idx" ON "animal_group_members" USING btree ("group_id");

CREATE INDEX IF NOT EXISTS "animal_group_members_animal_id_idx" ON "animal_group_members" USING btree ("animal_id");

CREATE INDEX IF NOT EXISTS "animal_groups_farm_id_idx" ON "animal_groups" USING btree ("farm_id");

CREATE INDEX IF NOT EXISTS "chat_sessions_animal_id_idx" ON "chat_sessions" USING btree ("animal_id");

CREATE INDEX IF NOT EXISTS "chat_sessions_farm_id_idx" ON "chat_sessions" USING btree ("farm_id");

CREATE INDEX IF NOT EXISTS "chat_sessions_user_id_idx" ON "chat_sessions" USING btree ("user_id");

CREATE INDEX IF NOT EXISTS "chat_sessions_status_idx" ON "chat_sessions" USING btree ("status");

CREATE INDEX IF NOT EXISTS "clinical_observations_animal_id_idx" ON "clinical_observations" USING btree ("animal_id");

CREATE INDEX IF NOT EXISTS "clinical_observations_farm_id_idx" ON "clinical_observations" USING btree ("farm_id");

CREATE INDEX IF NOT EXISTS "clinical_observations_type_idx" ON "clinical_observations" USING btree ("observation_type");

CREATE INDEX IF NOT EXISTS "clinical_observations_observed_at_idx" ON "clinical_observations" USING btree ("observed_at");

CREATE INDEX IF NOT EXISTS "cluster_farm_memberships_cluster_id_idx" ON "cluster_farm_memberships" USING btree ("cluster_id");

CREATE INDEX IF NOT EXISTS "cluster_farm_memberships_farm_id_idx" ON "cluster_farm_memberships" USING btree ("farm_id");

CREATE UNIQUE INDEX IF NOT EXISTS "cluster_farm_unique" ON "cluster_farm_memberships" USING btree ("cluster_id","farm_id");

CREATE INDEX IF NOT EXISTS "disease_clusters_level_idx" ON "disease_clusters" USING btree ("level");

CREATE INDEX IF NOT EXISTS "disease_clusters_status_idx" ON "disease_clusters" USING btree ("status");

CREATE INDEX IF NOT EXISTS "disease_clusters_disease_type_idx" ON "disease_clusters" USING btree ("disease_type");

CREATE INDEX IF NOT EXISTS "disease_clusters_first_detected_idx" ON "disease_clusters" USING btree ("first_detected_at");

CREATE INDEX IF NOT EXISTS "epidemic_daily_snapshots_date_idx" ON "epidemic_daily_snapshots" USING btree ("date");

CREATE INDEX IF NOT EXISTS "epidemic_daily_snapshots_region_id_idx" ON "epidemic_daily_snapshots" USING btree ("region_id");

CREATE UNIQUE INDEX IF NOT EXISTS "epidemic_daily_snapshots_date_region_unique" ON "epidemic_daily_snapshots" USING btree ("date","region_id");

CREATE INDEX IF NOT EXISTS "epidemic_warnings_cluster_id_idx" ON "epidemic_warnings" USING btree ("cluster_id");

CREATE INDEX IF NOT EXISTS "epidemic_warnings_level_idx" ON "epidemic_warnings" USING btree ("level");

CREATE INDEX IF NOT EXISTS "epidemic_warnings_status_idx" ON "epidemic_warnings" USING btree ("status");

CREATE INDEX IF NOT EXISTS "epidemic_warnings_region_id_idx" ON "epidemic_warnings" USING btree ("region_id");

CREATE INDEX IF NOT EXISTS "event_labels_event_id_idx" ON "event_labels" USING btree ("event_id");

CREATE INDEX IF NOT EXISTS "event_labels_farm_id_idx" ON "event_labels" USING btree ("farm_id");

CREATE INDEX IF NOT EXISTS "event_labels_animal_id_idx" ON "event_labels" USING btree ("animal_id");

CREATE INDEX IF NOT EXISTS "event_labels_labeled_at_idx" ON "event_labels" USING btree ("labeled_at");

CREATE INDEX IF NOT EXISTS "label_follow_ups_label_id_idx" ON "label_follow_ups" USING btree ("label_id");

CREATE INDEX IF NOT EXISTS "label_follow_ups_event_id_idx" ON "label_follow_ups" USING btree ("event_id");

CREATE INDEX IF NOT EXISTS "label_follow_ups_animal_id_idx" ON "label_follow_ups" USING btree ("animal_id");

CREATE INDEX IF NOT EXISTS "label_follow_ups_follow_up_date_idx" ON "label_follow_ups" USING btree ("follow_up_date");

CREATE INDEX IF NOT EXISTS "payment_history_subscription_id_idx" ON "payment_history" USING btree ("subscription_id");

CREATE INDEX IF NOT EXISTS "payment_history_user_id_idx" ON "payment_history" USING btree ("user_id");

CREATE INDEX IF NOT EXISTS "payment_history_status_idx" ON "payment_history" USING btree ("status");

CREATE INDEX IF NOT EXISTS "payment_history_paid_at_idx" ON "payment_history" USING btree ("paid_at");

CREATE INDEX IF NOT EXISTS "smaxtec_events_animal_id_idx" ON "smaxtec_events" USING btree ("animal_id");

CREATE INDEX IF NOT EXISTS "smaxtec_events_farm_id_idx" ON "smaxtec_events" USING btree ("farm_id");

CREATE INDEX IF NOT EXISTS "smaxtec_events_event_type_idx" ON "smaxtec_events" USING btree ("event_type");

CREATE INDEX IF NOT EXISTS "smaxtec_events_detected_at_idx" ON "smaxtec_events" USING btree ("detected_at");

CREATE INDEX IF NOT EXISTS "smaxtec_events_event_type_detected_at_idx" ON "smaxtec_events" USING btree ("event_type","detected_at");

CREATE INDEX IF NOT EXISTS "smaxtec_events_farm_event_detected_idx" ON "smaxtec_events" USING btree ("farm_id","event_type","detected_at");

CREATE INDEX IF NOT EXISTS "subscriptions_user_id_idx" ON "subscriptions" USING btree ("user_id");

CREATE INDEX IF NOT EXISTS "subscriptions_status_idx" ON "subscriptions" USING btree ("status");

CREATE INDEX IF NOT EXISTS "subscriptions_farm_id_idx" ON "subscriptions" USING btree ("farm_id");

CREATE INDEX IF NOT EXISTS "weight_measurements_animal_id_idx" ON "weight_measurements" USING btree ("animal_id");

CREATE INDEX IF NOT EXISTS "weight_measurements_farm_id_idx" ON "weight_measurements" USING btree ("farm_id");

CREATE INDEX IF NOT EXISTS "weight_measurements_measured_at_idx" ON "weight_measurements" USING btree ("measured_at");
