CREATE TYPE "public"."asset_kind" AS ENUM('image', 'video', 'audio', 'subtitle', 'document');--> statement-breakpoint
CREATE TYPE "public"."cost_entry_kind" AS ENUM('estimate', 'actual', 'adjustment');--> statement-breakpoint
CREATE TYPE "public"."execution_status" AS ENUM('draft', 'queued', 'submitting', 'provider_queued', 'running', 'cancel_requested', 'succeeded', 'failed', 'canceled');--> statement-breakpoint
CREATE TYPE "public"."generation_kind" AS ENUM('i2v', 't2v', 'ti2v', 's2v', 'image');--> statement-breakpoint
CREATE TYPE "public"."review_decision" AS ENUM('approved', 'rejected', 'needs_changes');--> statement-breakpoint
CREATE TYPE "public"."rights_status" AS ENUM('unknown', 'pending_verification', 'verified', 'expired', 'revoked');--> statement-breakpoint
CREATE TABLE "asset_licenses" (
	"asset_id" uuid NOT NULL,
	"license_id" uuid NOT NULL,
	"attached_at" timestamp with time zone DEFAULT now() NOT NULL,
	"attached_by" varchar(256) NOT NULL,
	CONSTRAINT "asset_licenses_asset_id_license_id_pk" PRIMARY KEY("asset_id","license_id")
);
--> statement-breakpoint
CREATE TABLE "asset_reviews" (
	"id" uuid PRIMARY KEY NOT NULL,
	"asset_id" uuid NOT NULL,
	"source_run_id" uuid NOT NULL,
	"content_decision" "review_decision" NOT NULL,
	"rights_decision" "review_decision" NOT NULL,
	"labeling_decision" "review_decision" NOT NULL,
	"decided_by" varchar(256) NOT NULL,
	"note" text,
	"decided_at" timestamp with time zone NOT NULL,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "assets" (
	"id" uuid PRIMARY KEY NOT NULL,
	"kind" "asset_kind" NOT NULL,
	"storage_key" varchar(1024) NOT NULL,
	"sha256" varchar(64) NOT NULL,
	"content_type" varchar(255) NOT NULL,
	"byte_size" bigint NOT NULL,
	"source_run_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "assets_sha256_format" CHECK ("assets"."sha256" ~ '^[a-fA-F0-9]{64}$'),
	CONSTRAINT "assets_byte_size_positive" CHECK ("assets"."byte_size" > 0)
);
--> statement-breakpoint
CREATE TABLE "cost_ledger_entries" (
	"id" uuid PRIMARY KEY NOT NULL,
	"run_id" uuid NOT NULL,
	"kind" "cost_entry_kind" NOT NULL,
	"amount_minor_units" bigint NOT NULL,
	"currency" varchar(3) NOT NULL,
	"provider_reference" varchar(256),
	"recorded_by" varchar(256) NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cost_ledger_entries_currency_format" CHECK ("cost_ledger_entries"."currency" ~ '^[A-Z]{3}$'),
	CONSTRAINT "cost_ledger_entries_nonadjustment_nonnegative" CHECK ("cost_ledger_entries"."kind" = 'adjustment' OR "cost_ledger_entries"."amount_minor_units" >= 0)
);
--> statement-breakpoint
CREATE TABLE "generation_run_events" (
	"id" uuid PRIMARY KEY NOT NULL,
	"run_id" uuid NOT NULL,
	"sequence" integer NOT NULL,
	"from_status" "execution_status" NOT NULL,
	"to_status" "execution_status" NOT NULL,
	"provider_job_id" varchar(256),
	"reason_code" varchar(128),
	"occurred_at" timestamp with time zone NOT NULL,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "generation_run_events_sequence_positive" CHECK ("generation_run_events"."sequence" > 0)
);
--> statement-breakpoint
CREATE TABLE "generation_runs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"provider_id" varchar(128) NOT NULL,
	"provider_model" varchar(256) NOT NULL,
	"model_version" varchar(256),
	"workflow_version" varchar(256) NOT NULL,
	"prompt_version" varchar(256) NOT NULL,
	"idempotency_key" uuid NOT NULL,
	"request_snapshot" jsonb NOT NULL,
	"request_snapshot_sha256" varchar(64) NOT NULL,
	"estimated_cost_minor_units" bigint NOT NULL,
	"currency" varchar(3) NOT NULL,
	"retry_of_run_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "generation_runs_currency_format" CHECK ("generation_runs"."currency" ~ '^[A-Z]{3}$'),
	CONSTRAINT "generation_runs_snapshot_sha256_format" CHECK ("generation_runs"."request_snapshot_sha256" ~ '^[a-fA-F0-9]{64}$'),
	CONSTRAINT "generation_runs_estimated_cost_nonnegative" CHECK ("generation_runs"."estimated_cost_minor_units" >= 0)
);
--> statement-breakpoint
CREATE TABLE "licenses" (
	"id" uuid PRIMARY KEY NOT NULL,
	"name" varchar(512) NOT NULL,
	"license_identifier" varchar(256),
	"source_url" varchar(2048),
	"commercial_use_allowed" boolean NOT NULL,
	"attribution_required" boolean NOT NULL,
	"rights_status" "rights_status" DEFAULT 'unknown' NOT NULL,
	"assessed_by" varchar(256),
	"assessed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "asset_licenses" ADD CONSTRAINT "asset_licenses_asset_id_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."assets"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asset_licenses" ADD CONSTRAINT "asset_licenses_license_id_licenses_id_fk" FOREIGN KEY ("license_id") REFERENCES "public"."licenses"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asset_reviews" ADD CONSTRAINT "asset_reviews_asset_id_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."assets"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asset_reviews" ADD CONSTRAINT "asset_reviews_source_run_id_generation_runs_id_fk" FOREIGN KEY ("source_run_id") REFERENCES "public"."generation_runs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cost_ledger_entries" ADD CONSTRAINT "cost_ledger_entries_run_id_generation_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."generation_runs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "generation_run_events" ADD CONSTRAINT "generation_run_events_run_id_generation_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."generation_runs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "generation_runs" ADD CONSTRAINT "generation_runs_retry_of_run_id_generation_runs_id_fk" FOREIGN KEY ("retry_of_run_id") REFERENCES "public"."generation_runs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "asset_reviews_asset_decided_idx" ON "asset_reviews" USING btree ("asset_id","decided_at");--> statement-breakpoint
CREATE UNIQUE INDEX "assets_storage_key_unique" ON "assets" USING btree ("storage_key");--> statement-breakpoint
CREATE INDEX "assets_source_run_id_idx" ON "assets" USING btree ("source_run_id");--> statement-breakpoint
CREATE INDEX "cost_ledger_entries_run_occurred_idx" ON "cost_ledger_entries" USING btree ("run_id","occurred_at");--> statement-breakpoint
CREATE UNIQUE INDEX "generation_run_events_run_sequence_unique" ON "generation_run_events" USING btree ("run_id","sequence");--> statement-breakpoint
CREATE INDEX "generation_run_events_run_occurred_idx" ON "generation_run_events" USING btree ("run_id","occurred_at");--> statement-breakpoint
CREATE UNIQUE INDEX "generation_runs_idempotency_key_unique" ON "generation_runs" USING btree ("idempotency_key");--> statement-breakpoint
CREATE INDEX "generation_runs_retry_of_run_id_idx" ON "generation_runs" USING btree ("retry_of_run_id");--> statement-breakpoint
CREATE INDEX "licenses_rights_status_idx" ON "licenses" USING btree ("rights_status");
--> statement-breakpoint
ALTER TABLE "assets" ADD CONSTRAINT "assets_source_run_id_generation_runs_id_fk" FOREIGN KEY ("source_run_id") REFERENCES "public"."generation_runs"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION "prevent_audit_mutation"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Audit evidence in % is append-only', TG_TABLE_NAME;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER "generation_runs_append_only" BEFORE UPDATE OR DELETE ON "generation_runs" FOR EACH ROW EXECUTE FUNCTION "prevent_audit_mutation"();
--> statement-breakpoint
CREATE TRIGGER "generation_run_events_append_only" BEFORE UPDATE OR DELETE ON "generation_run_events" FOR EACH ROW EXECUTE FUNCTION "prevent_audit_mutation"();
--> statement-breakpoint
CREATE TRIGGER "asset_licenses_append_only" BEFORE UPDATE OR DELETE ON "asset_licenses" FOR EACH ROW EXECUTE FUNCTION "prevent_audit_mutation"();
--> statement-breakpoint
CREATE TRIGGER "asset_reviews_append_only" BEFORE UPDATE OR DELETE ON "asset_reviews" FOR EACH ROW EXECUTE FUNCTION "prevent_audit_mutation"();
--> statement-breakpoint
CREATE TRIGGER "cost_ledger_entries_append_only" BEFORE UPDATE OR DELETE ON "cost_ledger_entries" FOR EACH ROW EXECUTE FUNCTION "prevent_audit_mutation"();
