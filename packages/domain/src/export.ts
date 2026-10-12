import { z } from "zod";

import { assetIdSchema, contractVersion, episodeIdSchema, isoUtcSchema } from "./ids.js";

const exportIdSchema = z.string().uuid();
const episodeCompositionTaskStatusSchema = z.enum(["queued", "running", "succeeded", "failed"]);
const episodeCompositionFailureReasonSchema = z.enum([
  "input_download_failed",
  "input_hash_mismatch",
  "ffmpeg_failed",
  "invalid_output",
  "persistence_failed",
  "unexpected_error",
]);

export const episodeExportRequestSchema = z.object({
  exportId: exportIdSchema,
  episodeId: episodeIdSchema,
  inputAssetIds: z.array(assetIdSchema).min(1).max(120).refine(
    (assetIds) => new Set(assetIds).size === assetIds.length,
    "Input assets must be unique",
  ),
  requestedBy: z.string().min(1).max(256),
});
export type EpisodeExportRequest = z.infer<typeof episodeExportRequestSchema>;

/** Immutable request snapshot for one private rough-cut execution. */
export const episodeCompositionTaskSchema = z.object({
  id: z.string().uuid(),
  exportId: exportIdSchema,
  episodeId: episodeIdSchema,
  inputAssetIds: z.array(assetIdSchema).min(1).max(120).refine(
    (assetIds) => new Set(assetIds).size === assetIds.length,
    "Input assets must be unique",
  ),
  requestedBy: z.string().min(1).max(256),
  requestedAt: isoUtcSchema,
});
export type EpisodeCompositionTask = z.infer<typeof episodeCompositionTaskSchema>;

/** Append-only operational state history for an episode composition task. */
export const episodeCompositionTaskEventSchema = z.object({
  id: z.string().uuid(),
  taskId: z.string().uuid(),
  sequence: z.number().int().positive(),
  fromStatus: episodeCompositionTaskStatusSchema,
  toStatus: episodeCompositionTaskStatusSchema,
  reasonCode: episodeCompositionFailureReasonSchema.nullable(),
  occurredAt: isoUtcSchema,
});
export type EpisodeCompositionTaskEvent = z.infer<typeof episodeCompositionTaskEventSchema>;
export type EpisodeCompositionTaskStatus = z.infer<typeof episodeCompositionTaskStatusSchema>;
export type EpisodeCompositionFailureReason = z.infer<typeof episodeCompositionFailureReasonSchema>;
export { episodeCompositionTaskStatusSchema, episodeCompositionFailureReasonSchema };

/**
 * Immutable provenance for a private episode master. It intentionally records
 * only approved input asset identities; review decisions remain separate
 * append-only evidence.
 */
export const episodeExportRecordSchema = z.object({
  contractVersion: z.literal(contractVersion),
  id: exportIdSchema,
  episodeId: episodeIdSchema,
  outputAssetId: assetIdSchema,
  inputAssetIds: z.array(assetIdSchema).min(1).max(120).refine(
    (assetIds) => new Set(assetIds).size === assetIds.length,
    "Input assets must be unique",
  ),
  createdBy: z.string().min(1).max(256),
  createdAt: isoUtcSchema,
});
export type EpisodeExportRecord = z.infer<typeof episodeExportRecordSchema>;
