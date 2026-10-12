import { randomUUID } from "node:crypto";

import {
  findGenerationOutputAsset,
  findGenerationRunByIdempotencyKey,
  findGenerationRunEvents,
  findLatestWanRun,
  findShotGenerationInput,
  type DatabaseConnection,
} from "@ai-manju/db";
import {
  contractVersion,
  executionStatusSchema,
  generationRunSnapshotSchema,
  type GenerationRunSnapshot,
} from "@ai-manju/domain";
import type { GenerationOrchestrator } from "@ai-manju/execution";
import { z } from "zod";

const supportedImageTypes = new Set(["image/jpeg", "image/png", "image/webp", "image/bmp"]);
const supportedVideoTypes = new Set(["video/mp4", "video/quicktime"]);
const activeStatuses = new Set(["queued", "submitting", "provider_queued", "running", "cancel_requested"]);

export const studioGenerationSubmitSchema = z.object({
  idempotencyKey: z.string().uuid(),
  chargeConfirmed: z.literal(true),
  referenceAssetIds: z.array(z.string().uuid()).min(1).max(5),
}).strict();

export const studioGenerationRunSchema = z.object({
  runId: z.string().uuid(),
  providerId: z.literal("wan"),
  providerModel: z.string().min(1),
  status: executionStatusSchema,
  estimatedCostMinorUnits: z.number().int().nonnegative(),
  currency: z.literal("CNY"),
  createdAt: z.string().datetime({ offset: true }),
  outputAssetId: z.string().uuid().optional(),
  outputContentPath: z.string().startsWith("/api/studio/assets/").optional(),
  events: z.array(z.object({
    sequence: z.number().int().positive(),
    from: executionStatusSchema,
    to: executionStatusSchema,
    occurredAt: z.string().datetime({ offset: true }),
    reasonCode: z.string().nullable(),
  }).strict()),
}).strict();
export type StudioGenerationRun = z.infer<typeof studioGenerationRunSchema>;

export class StudioGenerationError extends Error {
  constructor(
    readonly code: "SHOT_NOT_FOUND" | "SHOT_NOT_READY" | "RUN_ALREADY_ACTIVE" | "GENERATION_CONFIG_INVALID",
    readonly status: 400 | 404 | 409 | 503,
    message: string,
  ) {
    super(message);
  }
}

type DbClient = DatabaseConnection["db"];

function asIsoUtc(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) throw new Error("Database returned an invalid timestamp");
  return parsed.toISOString();
}

function estimateWanCostMinorUnits(durationSec: number, region: string): number {
  // Beijing: CNY 0.60/s. Singapore: CNY 0.733924/s. Round upward so the UI
  // does not understate the pre-submit estimate in integer minor units.
  return Math.ceil(durationSec * (region === "ap-southeast-1" ? 73.3924 : 60));
}

export async function readLatestStudioGenerationRun(db: DbClient, shotId: string): Promise<StudioGenerationRun | null> {
  const run = await findLatestWanRun(db, shotId);
  if (run === null) return null;
  const [eventRows, outputRows] = await Promise.all([
    findGenerationRunEvents(db, run.id),
    findGenerationOutputAsset(db, run.id),
  ]);
  const latestEvent = eventRows.at(-1);
  if (latestEvent === undefined) throw new Error("Generation run has no execution events");
  const output = outputRows;
  return studioGenerationRunSchema.parse({
    runId: run.id,
    providerId: "wan",
    providerModel: run.providerModel,
    status: latestEvent.toStatus,
    estimatedCostMinorUnits: Number(run.estimatedCostMinorUnits),
    currency: "CNY",
    createdAt: asIsoUtc(run.createdAt),
    ...(output === null ? {} : {
      outputAssetId: output.id,
      outputContentPath: `/api/studio/assets/${output.id}/content`,
    }),
    events: eventRows.map((event) => ({
      sequence: event.sequence,
      from: event.fromStatus,
      to: event.toStatus,
      occurredAt: asIsoUtc(event.occurredAt),
      reasonCode: event.reasonCode,
    })),
  });
}

export async function submitStudioGenerationRun(input: {
  shotId: string;
  idempotencyKey: string;
  referenceAssetIds: readonly string[];
  providerModel: string;
  providerRegion: string;
}, dependencies: { db: DbClient; orchestrator: GenerationOrchestrator }): Promise<StudioGenerationRun> {
  const existingByKey = await findGenerationRunByIdempotencyKey(dependencies.db, input.idempotencyKey);
  if (existingByKey?.shotId === input.shotId) {
    const existing = await readLatestStudioGenerationRun(dependencies.db, input.shotId);
    if (existing !== null) return existing;
  }

  const latest = await readLatestStudioGenerationRun(dependencies.db, input.shotId);
  if (latest !== null && activeStatuses.has(latest.status)) {
    throw new StudioGenerationError("RUN_ALREADY_ACTIVE", 409, "This shot already has an active Wan generation run.");
  }

  const generationInput = await findShotGenerationInput(dependencies.db, input.shotId);
  if (generationInput === null) throw new StudioGenerationError("SHOT_NOT_FOUND", 404, "The selected shot does not exist.");
  const { shot, references } = generationInput;
  if (shot.visualPrompt === null || shot.visualPrompt.trim().length === 0) {
    throw new StudioGenerationError("SHOT_NOT_READY", 400, "Add a visual prompt before generating this shot.");
  }

  const selected = input.referenceAssetIds.map((assetId) => references.find((reference) => reference.id === assetId));
  if (selected.some((reference) => reference === undefined)) {
    throw new StudioGenerationError("SHOT_NOT_READY", 400, "Every selected reference must belong to this shot.");
  }
  const selectedReferences = selected as typeof references;
  if (selectedReferences.length === 0 || selectedReferences.length > 5) {
    throw new StudioGenerationError("SHOT_NOT_READY", 400, "Wan requires between one and five reference assets.");
  }
  if (selectedReferences.some((reference) => reference.role === "last_frame")) {
    throw new StudioGenerationError("SHOT_NOT_READY", 400, "The current Wan R2V adapter does not support last-frame assets.");
  }
  for (const reference of selectedReferences) {
    const typeSupported = supportedImageTypes.has(reference.contentType) || supportedVideoTypes.has(reference.contentType);
    if (!typeSupported) throw new StudioGenerationError("SHOT_NOT_READY", 400, `Wan does not support ${reference.contentType} inputs.`);
    if (reference.contentType.startsWith("image/") && reference.byteSize > BigInt(20 * 1024 * 1024)) {
      throw new StudioGenerationError("SHOT_NOT_READY", 400, "Wan reference images must be no larger than 20 MB.");
    }
  }
  const hasVideoReference = selectedReferences.some((reference) => reference.contentType.startsWith("video/"));
  const maximumDuration = hasVideoReference ? 10 : 15;
  if (shot.durationSec < 2 || shot.durationSec > maximumDuration) {
    throw new StudioGenerationError("SHOT_NOT_READY", 400, `This Wan input supports a duration from 2 to ${maximumDuration} seconds.`);
  }

  const runId = randomUUID();
  const now = new Date().toISOString();
  const assetIds = selectedReferences.map((reference) => reference.id);
  const snapshot: GenerationRunSnapshot = generationRunSnapshotSchema.parse({
    contractVersion,
    runId,
    providerId: "wan",
    providerModel: input.providerModel,
    workflowVersion: "studio-wan-r2v-v1",
    promptVersion: "shot-visual-prompt-v1",
    idempotencyKey: input.idempotencyKey,
    request: {
      contractVersion,
      runId,
      kind: "i2v",
      prompt: shot.visualPrompt,
      durationSec: shot.durationSec,
      resolution: "720p",
      aspectRatio: "9:16",
      inputAssetIds: assetIds,
      providerOptions: {
        wan: {
          mediaRoles: selectedReferences.map((reference) => ({ assetId: reference.id, role: reference.role })),
        },
      },
    },
    inputAssetHashes: selectedReferences.map((reference) => reference.sha256),
    estimatedCostMinorUnits: estimateWanCostMinorUnits(shot.durationSec, input.providerRegion),
    currency: "CNY",
    createdAt: now,
  });
  await dependencies.orchestrator.submit(snapshot, { shotId: input.shotId });
  const created = await readLatestStudioGenerationRun(dependencies.db, input.shotId);
  if (created === null) throw new Error("Generation run was not persisted");
  return created;
}
