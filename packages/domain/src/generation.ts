import { z } from "zod";

import {
  assetIdSchema,
  contractVersion,
  isoUtcSchema,
  moneyMinorUnitsSchema,
  providerJobIdSchema,
  runIdSchema,
  sha256HexSchema,
} from "./ids.js";

export const executionStatuses = [
  "draft",
  "queued",
  "submitting",
  "provider_queued",
  "running",
  "cancel_requested",
  "succeeded",
  "failed",
  "canceled",
] as const;
export const executionStatusSchema = z.enum(executionStatuses);
export type ExecutionStatus = z.infer<typeof executionStatusSchema>;

const transitions: Readonly<Record<ExecutionStatus, readonly ExecutionStatus[]>> = {
  draft: ["queued"],
  queued: ["submitting", "canceled"],
  submitting: ["provider_queued", "failed"],
  provider_queued: ["running", "succeeded", "failed", "cancel_requested"],
  running: ["succeeded", "failed", "cancel_requested"],
  cancel_requested: ["canceled", "succeeded", "failed"],
  succeeded: [],
  failed: [],
  canceled: [],
};

export function canTransitionExecution(from: ExecutionStatus, to: ExecutionStatus): boolean {
  return transitions[from].includes(to);
}

export function assertExecutionTransition(from: ExecutionStatus, to: ExecutionStatus): void {
  if (!canTransitionExecution(from, to)) {
    throw new Error(`Invalid execution state transition: ${from} -> ${to}`);
  }
}

export const generationKindSchema = z.enum(["i2v", "t2v", "ti2v", "s2v", "image"]);
export const resolutionSchema = z.enum(["480p", "720p", "1080p"]);
export const aspectRatioSchema = z.enum(["9:16", "16:9", "21:9", "4:3", "3:4", "1:1"]);

export const normalizedGenerationRequestSchema = z.object({
  contractVersion: z.literal(contractVersion),
  runId: runIdSchema,
  kind: generationKindSchema,
  prompt: z.string().min(1).max(20_000),
  negativePrompt: z.string().max(20_000).optional(),
  durationSec: z.number().int().positive().max(60),
  resolution: resolutionSchema,
  aspectRatio: aspectRatioSchema,
  seed: z.number().int().nonnegative().optional(),
  inputAssetIds: z.array(assetIdSchema).min(1),
  referenceAssetIds: z.array(assetIdSchema).optional(),
  audioAssetId: assetIdSchema.optional(),
  providerOptions: z.record(z.unknown()).optional(),
});
export type NormalizedGenerationRequest = z.infer<typeof normalizedGenerationRequestSchema>;

export const generationRunSnapshotSchema = z.object({
  contractVersion: z.literal(contractVersion),
  runId: runIdSchema,
  providerId: z.string().min(1).max(128),
  providerModel: z.string().min(1).max(256),
  modelVersion: z.string().min(1).max(256).optional(),
  workflowVersion: z.string().min(1).max(256),
  promptVersion: z.string().min(1).max(256),
  idempotencyKey: z.string().uuid(),
  request: normalizedGenerationRequestSchema,
  inputAssetHashes: z.array(sha256HexSchema).min(1),
  estimatedCostMinorUnits: moneyMinorUnitsSchema,
  currency: z.string().regex(/^[A-Z]{3}$/),
  createdAt: isoUtcSchema,
  retryOfRunId: runIdSchema.optional(),
});
export type GenerationRunSnapshot = z.infer<typeof generationRunSnapshotSchema>;

export const executionEventSchema = z.object({
  contractVersion: z.literal(contractVersion),
  runId: runIdSchema,
  sequence: z.number().int().positive(),
  from: executionStatusSchema,
  to: executionStatusSchema,
  occurredAt: isoUtcSchema,
  providerJobId: providerJobIdSchema.optional(),
  reasonCode: z.string().min(1).max(128).optional(),
});
export type ExecutionEvent = z.infer<typeof executionEventSchema>;

export const providerErrorKindSchema = z.enum([
  "auth",
  "invalid_request",
  "rate_limited",
  "temporary",
  "unknown_outcome",
  "permanent",
]);

export const providerPollResultSchema = z.discriminatedUnion("state", [
  z.object({ state: z.literal("queued"), progressPercent: z.number().min(0).max(100).optional() }),
  z.object({ state: z.literal("running"), progressPercent: z.number().min(0).max(100).optional() }),
  z.object({
    state: z.literal("succeeded"),
    outputAssetId: assetIdSchema,
    outputHash: sha256HexSchema,
    actualCostMinorUnits: moneyMinorUnitsSchema.optional(),
  }),
  z.object({
    state: z.literal("failed"),
    retryable: z.boolean(),
    errorKind: providerErrorKindSchema,
    message: z.string().min(1).max(1_000),
  }),
]);
export type ProviderPollResult = z.infer<typeof providerPollResultSchema>;
