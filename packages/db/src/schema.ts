import {
  type AnyPgColumn,
  bigint,
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

import {
  benchmarkCaseCategorySchema,
  benchmarkEvaluationDecisionSchema,
  episodeCompositionTaskStatusSchema,
  executionStatuses,
  generationKindSchema,
  reviewDecisionSchema,
  type EpisodeExportRecord,
  type GenerationRunSnapshot,
} from "@ai-manju/domain";

/**
 * Database enums deliberately reuse the domain contract's runtime enum values.
 * A migration is required for any contract enum expansion.
 */
export const executionStatusEnum = pgEnum("execution_status", executionStatuses);
export const generationKindEnum = pgEnum("generation_kind", generationKindSchema.options);
export const reviewDecisionEnum = pgEnum("review_decision", reviewDecisionSchema.options);
export const assetKindEnum = pgEnum("asset_kind", [
  "image",
  "video",
  "audio",
  "subtitle",
  "document",
]);
export const shotReferenceRoleEnum = pgEnum("shot_reference_role", [
  "character_anchor",
  "scene_anchor",
  "style_reference",
  "first_frame",
  "last_frame",
  "prop_anchor",
]);
export const referencePackKindEnum = pgEnum("reference_pack_kind", [
  "character",
  "scene",
  "style",
]);
export const benchmarkCaseCategoryEnum = pgEnum("benchmark_case_category", benchmarkCaseCategorySchema.options);
export const benchmarkEvaluationDecisionEnum = pgEnum(
  "benchmark_evaluation_decision",
  benchmarkEvaluationDecisionSchema.options,
);
export const rightsStatusEnum = pgEnum("rights_status", [
  "unknown",
  "pending_verification",
  "verified",
  "expired",
  "revoked",
]);
export const costEntryKindEnum = pgEnum("cost_entry_kind", ["estimate", "actual", "adjustment"]);
export const episodeCompositionTaskStatusEnum = pgEnum(
  "episode_composition_task_status",
  episodeCompositionTaskStatusSchema.options,
);

export const series = pgTable(
  "series",
  {
    id: uuid("id").primaryKey(),
    title: varchar("title", { length: 512 }).notNull(),
    logline: text("logline"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" }).defaultNow().notNull(),
  },
);

/** Editable episode plan; its sequence is unique only within one series. */
export const episodes = pgTable(
  "episodes",
  {
    id: uuid("id").primaryKey(),
    seriesId: uuid("series_id").notNull().references(() => series.id, { onDelete: "restrict" }),
    sequence: integer("sequence").notNull(),
    title: varchar("title", { length: 512 }).notNull(),
    synopsis: text("synopsis"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("episodes_series_sequence_unique").on(table.seriesId, table.sequence),
    check("episodes_sequence_positive", sql`${table.sequence} > 0`),
  ],
);

/** Editable shot plan; generated runs retain an immutable snapshot separately. */
export const shots = pgTable(
  "shots",
  {
    id: uuid("id").primaryKey(),
    episodeId: uuid("episode_id").notNull().references(() => episodes.id, { onDelete: "restrict" }),
    sequence: integer("sequence").notNull(),
    title: varchar("title", { length: 512 }).notNull(),
    script: text("script").notNull(),
    visualPrompt: text("visual_prompt"),
    durationSec: integer("duration_sec").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("shots_episode_sequence_unique").on(table.episodeId, table.sequence),
    check("shots_sequence_positive", sql`${table.sequence} > 0`),
    check("shots_duration_between_one_and_sixty", sql`${table.durationSec} BETWEEN 1 AND 60`),
  ],
);

/**
 * Private media metadata only. The storage key is not a public URL and is
 * resolved to a short-lived signed URL outside this package.
 */
export const assets = pgTable(
  "assets",
  {
    id: uuid("id").primaryKey(),
    kind: assetKindEnum("kind").notNull(),
    storageKey: varchar("storage_key", { length: 1024 }).notNull(),
    sha256: varchar("sha256", { length: 64 }).notNull(),
    contentType: varchar("content_type", { length: 255 }).notNull(),
    byteSize: bigint("byte_size", { mode: "bigint" }).notNull(),
    sourceRunId: uuid("source_run_id"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("assets_storage_key_unique").on(table.storageKey),
    index("assets_source_run_id_idx").on(table.sourceRunId),
    check("assets_sha256_format", sql`${table.sha256} ~ '^[a-fA-F0-9]{64}$'`),
    check("assets_byte_size_positive", sql`${table.byteSize} > 0`),
  ],
);

/**
 * A series-scoped collection of approved source assets for a character,
 * scene, or visual style. Packs are reusable across shots without copying
 * private media or granting cross-series access implicitly.
 */
export const referencePacks = pgTable(
  "reference_packs",
  {
    id: uuid("id").primaryKey(),
    seriesId: uuid("series_id").notNull().references(() => series.id, { onDelete: "restrict" }),
    kind: referencePackKindEnum("kind").notNull(),
    name: varchar("name", { length: 512 }).notNull(),
    description: text("description"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("reference_packs_series_kind_name_unique").on(table.seriesId, table.kind, table.name),
    index("reference_packs_series_id_idx").on(table.seriesId),
  ],
);

/** Ordered source assets in a reusable reference pack. */
export const referencePackAssets = pgTable(
  "reference_pack_assets",
  {
    referencePackId: uuid("reference_pack_id").notNull().references(() => referencePacks.id, { onDelete: "restrict" }),
    assetId: uuid("asset_id").notNull().references(() => assets.id, { onDelete: "restrict" }),
    sequence: integer("sequence").notNull(),
    note: text("note"),
    attachedAt: timestamp("attached_at", { withTimezone: true, mode: "string" }).defaultNow().notNull(),
    attachedBy: varchar("attached_by", { length: 256 }).notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.referencePackId, table.assetId] }),
    uniqueIndex("reference_pack_assets_pack_sequence_unique").on(table.referencePackId, table.sequence),
    check("reference_pack_assets_sequence_positive", sql`${table.sequence} > 0`),
  ],
);

/**
 * A reusable private asset can be attached to a shot without copying media.
 * This is planning metadata, independent of the asset's release review state.
 */
export const shotReferenceAssets = pgTable(
  "shot_reference_assets",
  {
    shotId: uuid("shot_id").notNull().references(() => shots.id, { onDelete: "restrict" }),
    assetId: uuid("asset_id").notNull().references(() => assets.id, { onDelete: "restrict" }),
    role: shotReferenceRoleEnum("role").notNull().default("style_reference"),
    sequence: integer("sequence").notNull(),
    note: text("note"),
    attachedAt: timestamp("attached_at", { withTimezone: true, mode: "string" }).defaultNow().notNull(),
    attachedBy: varchar("attached_by", { length: 256 }).notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.shotId, table.assetId] }),
    uniqueIndex("shot_reference_assets_shot_sequence_unique").on(table.shotId, table.sequence),
    check("shot_reference_assets_sequence_positive", sql`${table.sequence} > 0`),
  ],
);

/**
 * Packs provide the reusable baseline references for a shot. Direct
 * shotReferenceAssets remain available for frame-specific or one-off inputs.
 */
export const shotReferencePacks = pgTable(
  "shot_reference_packs",
  {
    shotId: uuid("shot_id").notNull().references(() => shots.id, { onDelete: "restrict" }),
    referencePackId: uuid("reference_pack_id").notNull().references(() => referencePacks.id, { onDelete: "restrict" }),
    sequence: integer("sequence").notNull(),
    note: text("note"),
    attachedAt: timestamp("attached_at", { withTimezone: true, mode: "string" }).defaultNow().notNull(),
    attachedBy: varchar("attached_by", { length: 256 }).notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.shotId, table.referencePackId] }),
    uniqueIndex("shot_reference_packs_shot_sequence_unique").on(table.shotId, table.sequence),
    check("shot_reference_packs_sequence_positive", sql`${table.sequence} > 0`),
  ],
);

/** A versioned, series-scoped experiment plan used to compare providers fairly. */
export const benchmarkSuites = pgTable(
  "benchmark_suites",
  {
    id: uuid("id").primaryKey(),
    seriesId: uuid("series_id").notNull().references(() => series.id, { onDelete: "restrict" }),
    version: varchar("version", { length: 128 }).notNull(),
    name: varchar("name", { length: 512 }).notNull(),
    description: text("description"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("benchmark_suites_series_version_unique").on(table.seriesId, table.version),
    index("benchmark_suites_series_id_idx").on(table.seriesId),
  ],
);

/** Fixed scenario definitions. Do not mutate a suite after it has candidates. */
export const benchmarkCases = pgTable(
  "benchmark_cases",
  {
    id: uuid("id").primaryKey(),
    suiteId: uuid("suite_id").notNull().references(() => benchmarkSuites.id, { onDelete: "restrict" }),
    sequence: integer("sequence").notNull(),
    code: varchar("code", { length: 16 }).notNull(),
    category: benchmarkCaseCategoryEnum("category").notNull(),
    title: varchar("title", { length: 512 }).notNull(),
    prompt: text("prompt").notNull(),
    expectedCandidateCount: integer("expected_candidate_count").notNull().default(3),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("benchmark_cases_suite_sequence_unique").on(table.suiteId, table.sequence),
    uniqueIndex("benchmark_cases_suite_code_unique").on(table.suiteId, table.code),
    check("benchmark_cases_sequence_positive", sql`${table.sequence} > 0`),
    check("benchmark_cases_expected_candidate_count_range", sql`${table.expectedCandidateCount} BETWEEN 1 AND 10`),
  ],
);

/** A license is a reusable rights record; no authorization original is persisted here. */
export const licenses = pgTable(
  "licenses",
  {
    id: uuid("id").primaryKey(),
    name: varchar("name", { length: 512 }).notNull(),
    licenseIdentifier: varchar("license_identifier", { length: 256 }),
    sourceUrl: varchar("source_url", { length: 2048 }),
    commercialUseAllowed: boolean("commercial_use_allowed").notNull(),
    attributionRequired: boolean("attribution_required").notNull(),
    rightsStatus: rightsStatusEnum("rights_status").notNull().default("unknown"),
    assessedBy: varchar("assessed_by", { length: 256 }),
    assessedAt: timestamp("assessed_at", { withTimezone: true, mode: "string" }),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).defaultNow().notNull(),
  },
  (table) => [index("licenses_rights_status_idx").on(table.rightsStatus)],
);

/**
 * This join records the asserted license at attachment time. Reassessment uses
 * a new license or review record rather than overwriting historical evidence.
 */
export const assetLicenses = pgTable(
  "asset_licenses",
  {
    assetId: uuid("asset_id").notNull().references(() => assets.id, { onDelete: "restrict" }),
    licenseId: uuid("license_id").notNull().references(() => licenses.id, { onDelete: "restrict" }),
    attachedAt: timestamp("attached_at", { withTimezone: true, mode: "string" }).defaultNow().notNull(),
    attachedBy: varchar("attached_by", { length: 256 }).notNull(),
  },
  (table) => [primaryKey({ columns: [table.assetId, table.licenseId] })],
);

/**
 * Request snapshots are immutable application evidence. Execution state lives
 * exclusively in generation_run_events, never as a mutable run status column.
 */
export const generationRuns = pgTable(
  "generation_runs",
  {
    id: uuid("id").primaryKey(),
    providerId: varchar("provider_id", { length: 128 }).notNull(),
    providerModel: varchar("provider_model", { length: 256 }).notNull(),
    modelVersion: varchar("model_version", { length: 256 }),
    workflowVersion: varchar("workflow_version", { length: 256 }).notNull(),
    promptVersion: varchar("prompt_version", { length: 256 }).notNull(),
    idempotencyKey: uuid("idempotency_key").notNull(),
    requestSnapshot: jsonb("request_snapshot").$type<GenerationRunSnapshot>().notNull(),
    requestSnapshotSha256: varchar("request_snapshot_sha256", { length: 64 }).notNull(),
    estimatedCostMinorUnits: bigint("estimated_cost_minor_units", { mode: "bigint" }).notNull(),
    currency: varchar("currency", { length: 3 }).notNull(),
    shotId: uuid("shot_id").references(() => shots.id, { onDelete: "restrict" }),
    retryOfRunId: uuid("retry_of_run_id").references((): AnyPgColumn => generationRuns.id, {
      onDelete: "restrict",
    }),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("generation_runs_idempotency_key_unique").on(table.idempotencyKey),
    index("generation_runs_shot_id_idx").on(table.shotId),
    index("generation_runs_retry_of_run_id_idx").on(table.retryOfRunId),
    check("generation_runs_currency_format", sql`${table.currency} ~ '^[A-Z]{3}$'`),
    check("generation_runs_snapshot_sha256_format", sql`${table.requestSnapshotSha256} ~ '^[a-fA-F0-9]{64}$'`),
    check("generation_runs_estimated_cost_nonnegative", sql`${table.estimatedCostMinorUnits} >= 0`),
  ],
);

export const generationRunEvents = pgTable(
  "generation_run_events",
  {
    id: uuid("id").primaryKey(),
    runId: uuid("run_id").notNull().references(() => generationRuns.id, { onDelete: "restrict" }),
    sequence: integer("sequence").notNull(),
    fromStatus: executionStatusEnum("from_status").notNull(),
    toStatus: executionStatusEnum("to_status").notNull(),
    providerJobId: varchar("provider_job_id", { length: 256 }),
    reasonCode: varchar("reason_code", { length: 128 }),
    occurredAt: timestamp("occurred_at", { withTimezone: true, mode: "string" }).notNull(),
    recordedAt: timestamp("recorded_at", { withTimezone: true, mode: "string" }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("generation_run_events_run_sequence_unique").on(table.runId, table.sequence),
    index("generation_run_events_run_occurred_idx").on(table.runId, table.occurredAt),
    check("generation_run_events_sequence_positive", sql`${table.sequence} > 0`),
  ],
);

/** A generated run participating in a benchmark gets an opaque reviewer label. */
export const benchmarkCandidates = pgTable(
  "benchmark_candidates",
  {
    id: uuid("id").primaryKey(),
    caseId: uuid("case_id").notNull().references(() => benchmarkCases.id, { onDelete: "restrict" }),
    runId: uuid("run_id").notNull().references(() => generationRuns.id, { onDelete: "restrict" }),
    candidateSequence: integer("candidate_sequence").notNull(),
    blindLabel: varchar("blind_label", { length: 16 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("benchmark_candidates_case_run_unique").on(table.caseId, table.runId),
    uniqueIndex("benchmark_candidates_case_sequence_unique").on(table.caseId, table.candidateSequence),
    uniqueIndex("benchmark_candidates_case_blind_label_unique").on(table.caseId, table.blindLabel),
    index("benchmark_candidates_run_id_idx").on(table.runId),
    check("benchmark_candidates_sequence_positive", sql`${table.candidateSequence} > 0`),
  ],
);

/** Append-only human benchmark evidence; it does not approve an output asset. */
export const benchmarkEvaluations = pgTable(
  "benchmark_evaluations",
  {
    id: uuid("id").primaryKey(),
    candidateId: uuid("candidate_id").notNull().references(() => benchmarkCandidates.id, { onDelete: "restrict" }),
    decision: benchmarkEvaluationDecisionEnum("decision").notNull(),
    identityConsistency: integer("identity_consistency").notNull(),
    sceneConsistency: integer("scene_consistency").notNull(),
    shotAdherence: integer("shot_adherence").notNull(),
    motionQuality: integer("motion_quality").notNull(),
    technicalQuality: integer("technical_quality").notNull(),
    evaluatedBy: varchar("evaluated_by", { length: 256 }).notNull(),
    note: text("note"),
    evaluatedAt: timestamp("evaluated_at", { withTimezone: true, mode: "string" }).notNull(),
    recordedAt: timestamp("recorded_at", { withTimezone: true, mode: "string" }).defaultNow().notNull(),
  },
  (table) => [
    index("benchmark_evaluations_candidate_evaluated_idx").on(table.candidateId, table.evaluatedAt),
    check("benchmark_evaluations_identity_score_range", sql`${table.identityConsistency} BETWEEN 1 AND 5`),
    check("benchmark_evaluations_scene_score_range", sql`${table.sceneConsistency} BETWEEN 1 AND 5`),
    check("benchmark_evaluations_shot_score_range", sql`${table.shotAdherence} BETWEEN 1 AND 5`),
    check("benchmark_evaluations_motion_score_range", sql`${table.motionQuality} BETWEEN 1 AND 5`),
    check("benchmark_evaluations_technical_score_range", sql`${table.technicalQuality} BETWEEN 1 AND 5`),
  ],
);

/** Every review is a separate decision record. The current result is derived, not overwritten. */
export const assetReviews = pgTable(
  "asset_reviews",
  {
    id: uuid("id").primaryKey(),
    assetId: uuid("asset_id").notNull().references(() => assets.id, { onDelete: "restrict" }),
    sourceRunId: uuid("source_run_id").notNull().references(() => generationRuns.id, { onDelete: "restrict" }),
    contentDecision: reviewDecisionEnum("content_decision").notNull(),
    rightsDecision: reviewDecisionEnum("rights_decision").notNull(),
    labelingDecision: reviewDecisionEnum("labeling_decision").notNull(),
    decidedBy: varchar("decided_by", { length: 256 }).notNull(),
    note: text("note"),
    decidedAt: timestamp("decided_at", { withTimezone: true, mode: "string" }).notNull(),
    recordedAt: timestamp("recorded_at", { withTimezone: true, mode: "string" }).defaultNow().notNull(),
  },
  (table) => [index("asset_reviews_asset_decided_idx").on(table.assetId, table.decidedAt)],
);

/**
 * Immutable provenance for a private episode master. It is deliberately
 * separate from generation runs: FFmpeg composition is not model inference.
 */
export const episodeExports = pgTable(
  "episode_exports",
  {
    id: uuid("id").primaryKey(),
    episodeId: uuid("episode_id").notNull().references(() => episodes.id, { onDelete: "restrict" }),
    outputAssetId: uuid("output_asset_id").notNull().references(() => assets.id, { onDelete: "restrict" }),
    inputAssetIds: jsonb("input_asset_ids").$type<EpisodeExportRecord["inputAssetIds"]>().notNull(),
    createdBy: varchar("created_by", { length: 256 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).notNull(),
  },
  (table) => [
    uniqueIndex("episode_exports_output_asset_id_unique").on(table.outputAssetId),
    index("episode_exports_episode_created_idx").on(table.episodeId, table.createdAt),
  ],
);

/** Immutable rough-cut request snapshots; current state is derived from events. */
export const episodeCompositionTasks = pgTable(
  "episode_composition_tasks",
  {
    id: uuid("id").primaryKey(),
    exportId: uuid("export_id").notNull().unique(),
    episodeId: uuid("episode_id").notNull().references(() => episodes.id, { onDelete: "restrict" }),
    inputAssetIds: jsonb("input_asset_ids").$type<string[]>().notNull(),
    requestedBy: varchar("requested_by", { length: 256 }).notNull(),
    requestedAt: timestamp("requested_at", { withTimezone: true, mode: "string" }).notNull(),
  },
  (table) => [index("episode_composition_tasks_episode_requested_idx").on(table.episodeId, table.requestedAt)],
);

/** Append-only state transitions for private rough-cut execution. */
export const episodeCompositionTaskEvents = pgTable(
  "episode_composition_task_events",
  {
    id: uuid("id").primaryKey(),
    taskId: uuid("task_id").notNull().references(() => episodeCompositionTasks.id, { onDelete: "restrict" }),
    sequence: integer("sequence").notNull(),
    fromStatus: episodeCompositionTaskStatusEnum("from_status").notNull(),
    toStatus: episodeCompositionTaskStatusEnum("to_status").notNull(),
    reasonCode: varchar("reason_code", { length: 128 }),
    occurredAt: timestamp("occurred_at", { withTimezone: true, mode: "string" }).notNull(),
    recordedAt: timestamp("recorded_at", { withTimezone: true, mode: "string" }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("episode_composition_task_events_task_sequence_unique").on(table.taskId, table.sequence),
    index("episode_composition_task_events_task_occurred_idx").on(table.taskId, table.occurredAt),
    check("episode_composition_task_events_sequence_positive", sql`${table.sequence} > 0`),
  ],
);
/**
 * Append-only billing evidence. Adjustments can be negative for provider
 * credits; all other entry kinds must be nonnegative.
 */
export const costLedgerEntries = pgTable(
  "cost_ledger_entries",
  {
    id: uuid("id").primaryKey(),
    runId: uuid("run_id").notNull().references(() => generationRuns.id, { onDelete: "restrict" }),
    kind: costEntryKindEnum("kind").notNull(),
    amountMinorUnits: bigint("amount_minor_units", { mode: "bigint" }).notNull(),
    currency: varchar("currency", { length: 3 }).notNull(),
    providerReference: varchar("provider_reference", { length: 256 }),
    recordedBy: varchar("recorded_by", { length: 256 }).notNull(),
    occurredAt: timestamp("occurred_at", { withTimezone: true, mode: "string" }).notNull(),
    recordedAt: timestamp("recorded_at", { withTimezone: true, mode: "string" }).defaultNow().notNull(),
  },
  (table) => [
    index("cost_ledger_entries_run_occurred_idx").on(table.runId, table.occurredAt),
    check("cost_ledger_entries_currency_format", sql`${table.currency} ~ '^[A-Z]{3}$'`),
    check(
      "cost_ledger_entries_nonadjustment_nonnegative",
      sql`${table.kind} = 'adjustment' OR ${table.amountMinorUnits} >= 0`,
    ),
  ],
);

export type Asset = typeof assets.$inferSelect;
export type Series = typeof series.$inferSelect;
export type Episode = typeof episodes.$inferSelect;
export type Shot = typeof shots.$inferSelect;
export type ShotReferenceAsset = typeof shotReferenceAssets.$inferSelect;
export type ReferencePack = typeof referencePacks.$inferSelect;
export type ReferencePackAsset = typeof referencePackAssets.$inferSelect;
export type ShotReferencePack = typeof shotReferencePacks.$inferSelect;
export type BenchmarkSuite = typeof benchmarkSuites.$inferSelect;
export type BenchmarkCase = typeof benchmarkCases.$inferSelect;
export type BenchmarkCandidate = typeof benchmarkCandidates.$inferSelect;
export type BenchmarkEvaluation = typeof benchmarkEvaluations.$inferSelect;
export type GenerationRun = typeof generationRuns.$inferSelect;
export type GenerationRunEvent = typeof generationRunEvents.$inferSelect;
export type AssetReview = typeof assetReviews.$inferSelect;
export type EpisodeExport = typeof episodeExports.$inferSelect;
export type EpisodeCompositionTask = typeof episodeCompositionTasks.$inferSelect;
export type EpisodeCompositionTaskEvent = typeof episodeCompositionTaskEvents.$inferSelect;
export type CostLedgerEntry = typeof costLedgerEntries.$inferSelect;
