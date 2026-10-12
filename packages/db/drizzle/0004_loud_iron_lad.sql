CREATE TABLE "episode_exports" (
	"id" uuid PRIMARY KEY NOT NULL,
	"episode_id" uuid NOT NULL,
	"output_asset_id" uuid NOT NULL,
	"input_asset_ids" jsonb NOT NULL,
	"created_by" varchar(256) NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "episode_exports" ADD CONSTRAINT "episode_exports_episode_id_episodes_id_fk" FOREIGN KEY ("episode_id") REFERENCES "public"."episodes"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "episode_exports" ADD CONSTRAINT "episode_exports_output_asset_id_assets_id_fk" FOREIGN KEY ("output_asset_id") REFERENCES "public"."assets"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "episode_exports_output_asset_id_unique" ON "episode_exports" USING btree ("output_asset_id");--> statement-breakpoint
CREATE INDEX "episode_exports_episode_created_idx" ON "episode_exports" USING btree ("episode_id","created_at");--> statement-breakpoint
CREATE TRIGGER "episode_exports_append_only" BEFORE UPDATE OR DELETE ON "episode_exports" FOR EACH ROW EXECUTE FUNCTION "prevent_audit_mutation"();
