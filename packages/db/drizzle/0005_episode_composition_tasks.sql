CREATE TYPE "public"."episode_composition_task_status" AS ENUM(''queued'', ''running'', ''succeeded'', ''failed'');--> statement-breakpoint
CREATE TABLE "episode_composition_tasks" (
  "id" uuid PRIMARY KEY NOT NULL,
  "export_id" uuid NOT NULL,
  "episode_id" uuid NOT NULL,
  "input_asset_ids" jsonb NOT NULL,
  "requested_by" varchar(256) NOT NULL,
  "requested_at" timestamp with time zone NOT NULL,
  CONSTRAINT "episode_composition_tasks_export_id_unique" UNIQUE("export_id")
);
--> statement-breakpoint
CREATE TABLE "episode_composition_task_events" (
  "id" uuid PRIMARY KEY NOT NULL,
  "task_id" uuid NOT NULL,
  "sequence" integer NOT NULL,
  "from_status" "episode_composition_task_status" NOT NULL,
  "to_status" "episode_composition_task_status" NOT NULL,
  "reason_code" varchar(128),
  "occurred_at" timestamp with time zone NOT NULL,
  "recorded_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "episode_composition_tasks" ADD CONSTRAINT "episode_composition_tasks_episode_id_episodes_id_fk" FOREIGN KEY ("episode_id") REFERENCES "public"."episodes"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "episode_composition_task_events" ADD CONSTRAINT "episode_composition_task_events_task_id_episode_composition_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."episode_composition_tasks"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "episode_composition_tasks_episode_requested_idx" ON "episode_composition_tasks" USING btree ("episode_id","requested_at");--> statement-breakpoint
CREATE UNIQUE INDEX "episode_composition_task_events_task_sequence_unique" ON "episode_composition_task_events" USING btree ("task_id","sequence");--> statement-breakpoint
CREATE INDEX "episode_composition_task_events_task_occurred_idx" ON "episode_composition_task_events" USING btree ("task_id","occurred_at");--> statement-breakpoint
ALTER TABLE "episode_composition_task_events" ADD CONSTRAINT "episode_composition_task_events_sequence_positive" CHECK ("episode_composition_task_events"."sequence" > 0);--> statement-breakpoint
CREATE TRIGGER "episode_composition_tasks_append_only" BEFORE UPDATE OR DELETE ON "episode_composition_tasks" FOR EACH ROW EXECUTE FUNCTION "prevent_audit_mutation"();--> statement-breakpoint
CREATE TRIGGER "episode_composition_task_events_append_only" BEFORE UPDATE OR DELETE ON "episode_composition_task_events" FOR EACH ROW EXECUTE FUNCTION "prevent_audit_mutation"();