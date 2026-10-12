CREATE TABLE "episodes" (
	"id" uuid PRIMARY KEY NOT NULL,
	"series_id" uuid NOT NULL,
	"sequence" integer NOT NULL,
	"title" varchar(512) NOT NULL,
	"synopsis" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "episodes_sequence_positive" CHECK ("episodes"."sequence" > 0)
);
--> statement-breakpoint
CREATE TABLE "series" (
	"id" uuid PRIMARY KEY NOT NULL,
	"title" varchar(512) NOT NULL,
	"logline" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shot_reference_assets" (
	"shot_id" uuid NOT NULL,
	"asset_id" uuid NOT NULL,
	"sequence" integer NOT NULL,
	"note" text,
	"attached_at" timestamp with time zone DEFAULT now() NOT NULL,
	"attached_by" varchar(256) NOT NULL,
	CONSTRAINT "shot_reference_assets_shot_id_asset_id_pk" PRIMARY KEY("shot_id","asset_id"),
	CONSTRAINT "shot_reference_assets_sequence_positive" CHECK ("shot_reference_assets"."sequence" > 0)
);
--> statement-breakpoint
CREATE TABLE "shots" (
	"id" uuid PRIMARY KEY NOT NULL,
	"episode_id" uuid NOT NULL,
	"sequence" integer NOT NULL,
	"title" varchar(512) NOT NULL,
	"script" text NOT NULL,
	"visual_prompt" text,
	"duration_sec" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "shots_sequence_positive" CHECK ("shots"."sequence" > 0),
	CONSTRAINT "shots_duration_between_one_and_sixty" CHECK ("shots"."duration_sec" BETWEEN 1 AND 60)
);
--> statement-breakpoint
ALTER TABLE "generation_runs" ADD COLUMN "shot_id" uuid;--> statement-breakpoint
ALTER TABLE "episodes" ADD CONSTRAINT "episodes_series_id_series_id_fk" FOREIGN KEY ("series_id") REFERENCES "public"."series"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shot_reference_assets" ADD CONSTRAINT "shot_reference_assets_shot_id_shots_id_fk" FOREIGN KEY ("shot_id") REFERENCES "public"."shots"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shot_reference_assets" ADD CONSTRAINT "shot_reference_assets_asset_id_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."assets"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shots" ADD CONSTRAINT "shots_episode_id_episodes_id_fk" FOREIGN KEY ("episode_id") REFERENCES "public"."episodes"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "episodes_series_sequence_unique" ON "episodes" USING btree ("series_id","sequence");--> statement-breakpoint
CREATE UNIQUE INDEX "shot_reference_assets_shot_sequence_unique" ON "shot_reference_assets" USING btree ("shot_id","sequence");--> statement-breakpoint
CREATE UNIQUE INDEX "shots_episode_sequence_unique" ON "shots" USING btree ("episode_id","sequence");--> statement-breakpoint
ALTER TABLE "generation_runs" ADD CONSTRAINT "generation_runs_shot_id_shots_id_fk" FOREIGN KEY ("shot_id") REFERENCES "public"."shots"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "generation_runs_shot_id_idx" ON "generation_runs" USING btree ("shot_id");