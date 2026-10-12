CREATE TYPE "public"."reference_pack_kind" AS ENUM('character', 'scene', 'style');--> statement-breakpoint
CREATE TYPE "public"."shot_reference_role" AS ENUM('character_anchor', 'scene_anchor', 'style_reference', 'first_frame', 'last_frame', 'prop_anchor');--> statement-breakpoint
CREATE TABLE "reference_pack_assets" (
	"reference_pack_id" uuid NOT NULL,
	"asset_id" uuid NOT NULL,
	"sequence" integer NOT NULL,
	"note" text,
	"attached_at" timestamp with time zone DEFAULT now() NOT NULL,
	"attached_by" varchar(256) NOT NULL,
	CONSTRAINT "reference_pack_assets_reference_pack_id_asset_id_pk" PRIMARY KEY("reference_pack_id","asset_id"),
	CONSTRAINT "reference_pack_assets_sequence_positive" CHECK ("reference_pack_assets"."sequence" > 0)
);
--> statement-breakpoint
CREATE TABLE "reference_packs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"series_id" uuid NOT NULL,
	"kind" "reference_pack_kind" NOT NULL,
	"name" varchar(512) NOT NULL,
	"description" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shot_reference_packs" (
	"shot_id" uuid NOT NULL,
	"reference_pack_id" uuid NOT NULL,
	"sequence" integer NOT NULL,
	"note" text,
	"attached_at" timestamp with time zone DEFAULT now() NOT NULL,
	"attached_by" varchar(256) NOT NULL,
	CONSTRAINT "shot_reference_packs_shot_id_reference_pack_id_pk" PRIMARY KEY("shot_id","reference_pack_id"),
	CONSTRAINT "shot_reference_packs_sequence_positive" CHECK ("shot_reference_packs"."sequence" > 0)
);
--> statement-breakpoint
ALTER TABLE "shot_reference_assets" ADD COLUMN "role" "shot_reference_role" DEFAULT 'style_reference';--> statement-breakpoint
UPDATE "shot_reference_assets" SET "role" = 'style_reference' WHERE "role" IS NULL;--> statement-breakpoint
ALTER TABLE "shot_reference_assets" ALTER COLUMN "role" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "reference_pack_assets" ADD CONSTRAINT "reference_pack_assets_reference_pack_id_reference_packs_id_fk" FOREIGN KEY ("reference_pack_id") REFERENCES "public"."reference_packs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reference_pack_assets" ADD CONSTRAINT "reference_pack_assets_asset_id_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."assets"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reference_packs" ADD CONSTRAINT "reference_packs_series_id_series_id_fk" FOREIGN KEY ("series_id") REFERENCES "public"."series"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shot_reference_packs" ADD CONSTRAINT "shot_reference_packs_shot_id_shots_id_fk" FOREIGN KEY ("shot_id") REFERENCES "public"."shots"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shot_reference_packs" ADD CONSTRAINT "shot_reference_packs_reference_pack_id_reference_packs_id_fk" FOREIGN KEY ("reference_pack_id") REFERENCES "public"."reference_packs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "reference_pack_assets_pack_sequence_unique" ON "reference_pack_assets" USING btree ("reference_pack_id","sequence");--> statement-breakpoint
CREATE UNIQUE INDEX "reference_packs_series_kind_name_unique" ON "reference_packs" USING btree ("series_id","kind","name");--> statement-breakpoint
CREATE INDEX "reference_packs_series_id_idx" ON "reference_packs" USING btree ("series_id");--> statement-breakpoint
CREATE UNIQUE INDEX "shot_reference_packs_shot_sequence_unique" ON "shot_reference_packs" USING btree ("shot_id","sequence");
