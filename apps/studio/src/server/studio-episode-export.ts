import { randomUUID } from "node:crypto";

import {
  EpisodeExportEligibilityError,
  createEpisodeCompositionTask,
  findApprovedEpisodeExportInputs,
  findEpisodeSucceededOutputAssets,
  findLatestEpisodeCompositionTask,
  findLatestEpisodeExport,
  type DatabaseConnection,
} from "@ai-manju/db";
import { episodeCompositionTaskSchema, episodeExportRequestSchema } from "@ai-manju/domain";
import { z } from "zod";

const episodeIdSchema = z.string().uuid();

export const studioEpisodeExportStatusSchema = z.object({
  eligible: z.boolean(),
  inputCount: z.number().int().nonnegative(),
  reason: z.enum(["ready", "missing_output", "review_required"]).optional(),
  task: z.object({
    id: z.string().uuid(),
    exportId: z.string().uuid(),
    status: z.enum(["queued", "running", "succeeded", "failed"]),
    requestedAt: z.string().datetime({ offset: true }),
    failureReason: z.enum([
      "input_download_failed",
      "input_hash_mismatch",
      "ffmpeg_failed",
      "invalid_output",
      "persistence_failed",
      "unexpected_error",
    ]).nullable(),
  }).nullable(),
  export: z.object({
    id: z.string().uuid(),
    outputContentPath: z.string().startsWith("/api/studio/assets/"),
    createdAt: z.string().datetime({ offset: true }),
  }).nullable(),
}).strict();
export type StudioEpisodeExportStatus = z.infer<typeof studioEpisodeExportStatusSchema>;
export class StudioEpisodeExportError extends Error {
  constructor(readonly code: "EPISODE_EXPORT_NOT_READY" | "EPISODE_EXPORT_QUEUE_UNAVAILABLE", message: string) {
    super(message);
  }
}

type DbClient = DatabaseConnection["db"];

function asIsoUtc(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) throw new Error("Database returned an invalid export timestamp");
  return parsed.toISOString();
}

async function resolveEpisodeInputs(db: DbClient, episodeId: string): Promise<string[]> {
  const outputs = await findEpisodeSucceededOutputAssets(db, episodeId);
  if (outputs.length === 0 || outputs.some((shot) => shot.output === null)) {
    throw new StudioEpisodeExportError("EPISODE_EXPORT_NOT_READY", "Every shot needs a completed video before making a rough cut.");
  }
  return outputs.map((shot) => shot.output!.id);
}

export async function readStudioEpisodeExportStatus(db: DbClient, episodeIdInput: string): Promise<StudioEpisodeExportStatus> {
  const episodeId = episodeIdSchema.parse(episodeIdInput);
  const [latest, task, outputs] = await Promise.all([
    findLatestEpisodeExport(db, episodeId),
    findLatestEpisodeCompositionTask(db, episodeId),
    findEpisodeSucceededOutputAssets(db, episodeId),
  ]);
  const inputAssetIds = outputs.flatMap((shot) => shot.output === null ? [] : [shot.output.id]);
  const hasEveryOutput = outputs.length > 0 && inputAssetIds.length === outputs.length;
  let eligible = false;
  let reason: "missing_output" | "review_required" | "ready" = hasEveryOutput ? "review_required" : "missing_output";
  if (hasEveryOutput) {
    try {
      await findApprovedEpisodeExportInputs(db, inputAssetIds);
      eligible = true;
      reason = "ready";
    } catch (error) {
      if (!(error instanceof EpisodeExportEligibilityError)) throw error;
    }
  }
  return studioEpisodeExportStatusSchema.parse({
    eligible,
    inputCount: inputAssetIds.length,
    reason,
    task: task === null ? null : {
      id: task.task.id,
      exportId: task.task.exportId,
      status: task.event.toStatus,
      requestedAt: asIsoUtc(task.task.requestedAt),
      failureReason: task.event.toStatus === "failed" ? task.event.reasonCode : null,
    },
    export: latest === null ? null : {
      id: latest.id,
      outputContentPath: `/api/studio/assets/${latest.outputAssetId}/content`,
      createdAt: asIsoUtc(latest.createdAt),
    },
  });
}

export async function requestStudioEpisodeExport(input: {
  episodeId: string;
  requestedBy: string;
}, dependencies: {
  db: DbClient;
  enqueue: (request: z.infer<typeof episodeExportRequestSchema>) => Promise<void>;
}) {
  const episodeId = episodeIdSchema.parse(input.episodeId);
  const inputAssetIds = await resolveEpisodeInputs(dependencies.db, episodeId);
  try {
    await findApprovedEpisodeExportInputs(dependencies.db, inputAssetIds);
  } catch (error) {
    if (error instanceof EpisodeExportEligibilityError) {
      throw new StudioEpisodeExportError("EPISODE_EXPORT_NOT_READY", "All source videos need approved content, rights, and AI-label reviews.");
    }
    throw error;
  }
  const task = episodeCompositionTaskSchema.parse({
    id: randomUUID(),
    exportId: randomUUID(),
    episodeId,
    inputAssetIds,
    requestedBy: input.requestedBy,
    requestedAt: new Date().toISOString(),
  });
  const request = episodeExportRequestSchema.parse({
    taskId: task.id,
    exportId: task.exportId,
    episodeId,
    inputAssetIds,
    requestedBy: input.requestedBy,
  });
  await createEpisodeCompositionTask(dependencies.db, task);
  await dependencies.enqueue(request);
  return request;
}
