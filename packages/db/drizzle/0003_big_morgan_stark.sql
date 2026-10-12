CREATE TYPE "public"."benchmark_case_category" AS ENUM('portrait', 'dialogue', 'turn', 'prop_interaction', 'action', 'scene_transition', 'first_last_frame');--> statement-breakpoint
CREATE TYPE "public"."benchmark_evaluation_decision" AS ENUM('accepted', 'rejected', 'needs_changes');--> statement-breakpoint
CREATE TABLE "benchmark_candidates" (
	"id" uuid PRIMARY KEY NOT NULL,
	"case_id" uuid NOT NULL,
	"run_id" uuid NOT NULL,
	"candidate_sequence" integer NOT NULL,
	"blind_label" varchar(16) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "benchmark_candidates_sequence_positive" CHECK ("benchmark_candidates"."candidate_sequence" > 0)
);
--> statement-breakpoint
CREATE TABLE "benchmark_cases" (
	"id" uuid PRIMARY KEY NOT NULL,
	"suite_id" uuid NOT NULL,
	"sequence" integer NOT NULL,
	"code" varchar(16) NOT NULL,
	"category" "benchmark_case_category" NOT NULL,
	"title" varchar(512) NOT NULL,
	"prompt" text NOT NULL,
	"expected_candidate_count" integer DEFAULT 3 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "benchmark_cases_sequence_positive" CHECK ("benchmark_cases"."sequence" > 0),
	CONSTRAINT "benchmark_cases_expected_candidate_count_range" CHECK ("benchmark_cases"."expected_candidate_count" BETWEEN 1 AND 10)
);
--> statement-breakpoint
CREATE TABLE "benchmark_evaluations" (
	"id" uuid PRIMARY KEY NOT NULL,
	"candidate_id" uuid NOT NULL,
	"decision" "benchmark_evaluation_decision" NOT NULL,
	"identity_consistency" integer NOT NULL,
	"scene_consistency" integer NOT NULL,
	"shot_adherence" integer NOT NULL,
	"motion_quality" integer NOT NULL,
	"technical_quality" integer NOT NULL,
	"evaluated_by" varchar(256) NOT NULL,
	"note" text,
	"evaluated_at" timestamp with time zone NOT NULL,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "benchmark_evaluations_identity_score_range" CHECK ("benchmark_evaluations"."identity_consistency" BETWEEN 1 AND 5),
	CONSTRAINT "benchmark_evaluations_scene_score_range" CHECK ("benchmark_evaluations"."scene_consistency" BETWEEN 1 AND 5),
	CONSTRAINT "benchmark_evaluations_shot_score_range" CHECK ("benchmark_evaluations"."shot_adherence" BETWEEN 1 AND 5),
	CONSTRAINT "benchmark_evaluations_motion_score_range" CHECK ("benchmark_evaluations"."motion_quality" BETWEEN 1 AND 5),
	CONSTRAINT "benchmark_evaluations_technical_score_range" CHECK ("benchmark_evaluations"."technical_quality" BETWEEN 1 AND 5)
);
--> statement-breakpoint
CREATE TABLE "benchmark_suites" (
	"id" uuid PRIMARY KEY NOT NULL,
	"series_id" uuid NOT NULL,
	"version" varchar(128) NOT NULL,
	"name" varchar(512) NOT NULL,
	"description" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "benchmark_candidates" ADD CONSTRAINT "benchmark_candidates_case_id_benchmark_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."benchmark_cases"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "benchmark_candidates" ADD CONSTRAINT "benchmark_candidates_run_id_generation_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."generation_runs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "benchmark_cases" ADD CONSTRAINT "benchmark_cases_suite_id_benchmark_suites_id_fk" FOREIGN KEY ("suite_id") REFERENCES "public"."benchmark_suites"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "benchmark_evaluations" ADD CONSTRAINT "benchmark_evaluations_candidate_id_benchmark_candidates_id_fk" FOREIGN KEY ("candidate_id") REFERENCES "public"."benchmark_candidates"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "benchmark_suites" ADD CONSTRAINT "benchmark_suites_series_id_series_id_fk" FOREIGN KEY ("series_id") REFERENCES "public"."series"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "benchmark_candidates_case_run_unique" ON "benchmark_candidates" USING btree ("case_id","run_id");--> statement-breakpoint
CREATE UNIQUE INDEX "benchmark_candidates_case_sequence_unique" ON "benchmark_candidates" USING btree ("case_id","candidate_sequence");--> statement-breakpoint
CREATE UNIQUE INDEX "benchmark_candidates_case_blind_label_unique" ON "benchmark_candidates" USING btree ("case_id","blind_label");--> statement-breakpoint
CREATE INDEX "benchmark_candidates_run_id_idx" ON "benchmark_candidates" USING btree ("run_id");--> statement-breakpoint
CREATE UNIQUE INDEX "benchmark_cases_suite_sequence_unique" ON "benchmark_cases" USING btree ("suite_id","sequence");--> statement-breakpoint
CREATE UNIQUE INDEX "benchmark_cases_suite_code_unique" ON "benchmark_cases" USING btree ("suite_id","code");--> statement-breakpoint
CREATE INDEX "benchmark_evaluations_candidate_evaluated_idx" ON "benchmark_evaluations" USING btree ("candidate_id","evaluated_at");--> statement-breakpoint
CREATE UNIQUE INDEX "benchmark_suites_series_version_unique" ON "benchmark_suites" USING btree ("series_id","version");--> statement-breakpoint
CREATE INDEX "benchmark_suites_series_id_idx" ON "benchmark_suites" USING btree ("series_id");