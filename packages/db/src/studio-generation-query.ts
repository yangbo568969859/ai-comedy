import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { randomUUID } from "node:crypto";

import {
  contractVersion,
  episodeCompositionTaskEventSchema,
  episodeCompositionTaskSchema,
  episodeExportRecordSchema,
  resolveReviewStatus,
} from "@ai-manju/domain";

import type { DatabaseConnection } from "./client.js";
import {
  assetReviews,
  assets,
  episodeCompositionTaskEvents,
  episodeCompositionTasks,
  episodeExports,
  generationRunEvents,
  generationRuns,
  shotReferenceAssets,
  shots,
} from "./schema.js";

type DbClient = DatabaseConnection["db"];

export async function findLatestWanRun(db: DbClient, shotId: string) {
  const [run] = await db.select().from(generationRuns)
    .where(and(eq(generationRuns.shotId, shotId), eq(generationRuns.providerId, "wan")))
    .orderBy(desc(generationRuns.createdAt), desc(generationRuns.id)).limit(1);
  return run ?? null;
}

export async function findGenerationRunByIdempotencyKey(db: DbClient, idempotencyKey: string) {
  const [run] = await db.select({ id: generationRuns.id, shotId: generationRuns.shotId })
    .from(generationRuns).where(eq(generationRuns.idempotencyKey, idempotencyKey)).limit(1);
  return run ?? null;
}

export async function findGenerationRunEvents(db: DbClient, runId: string) {
  return db.select().from(generationRunEvents)
    .where(eq(generationRunEvents.runId, runId)).orderBy(asc(generationRunEvents.sequence));
}

export async function findGenerationOutputAsset(db: DbClient, runId: string) {
  const [asset] = await db.select({ id: assets.id }).from(assets)
    .where(eq(assets.sourceRunId, runId)).orderBy(desc(assets.createdAt)).limit(1);
  return asset ?? null;
}

/** Latest append-only review evidence for one exact generation output. */
export async function findLatestAssetReview(db: DbClient, assetId: string, sourceRunId: string) {
  const [review] = await db.select().from(assetReviews)
    .where(and(eq(assetReviews.assetId, assetId), eq(assetReviews.sourceRunId, sourceRunId)))
    .orderBy(desc(assetReviews.decidedAt), desc(assetReviews.recordedAt), desc(assetReviews.id)).limit(1);
  return review ?? null;
}

/**
 * Finds the newest completed Wan output for one shot. Failed or queued retry
 * attempts do not hide a previously completed candidate from the rough-cut
 * workflow; the human review gate still decides whether it is usable.
 */
export async function findLatestSucceededOutputAsset(db: DbClient, shotId: string) {
  const runs = await db.select({ id: generationRuns.id }).from(generationRuns)
    .where(and(eq(generationRuns.shotId, shotId), eq(generationRuns.providerId, "wan")))
    .orderBy(desc(generationRuns.createdAt), desc(generationRuns.id));
  for (const run of runs) {
    const [event] = await db.select({ toStatus: generationRunEvents.toStatus }).from(generationRunEvents)
      .where(eq(generationRunEvents.runId, run.id))
      .orderBy(desc(generationRunEvents.sequence)).limit(1);
    if (event?.toStatus !== "succeeded") continue;
    const output = await findGenerationOutputAsset(db, run.id);
    if (output !== null) return { ...output, sourceRunId: run.id };
  }
  return null;
}

/** Ordered successful generation outputs for an episode, with no storage keys exposed. */
export async function findEpisodeSucceededOutputAssets(db: DbClient, episodeId: string) {
  const episodeShots = await db.select({ id: shots.id, sequence: shots.sequence }).from(shots)
    .where(eq(shots.episodeId, episodeId)).orderBy(asc(shots.sequence), asc(shots.id));
  return Promise.all(episodeShots.map(async (shot) => ({
    shotId: shot.id,
    sequence: shot.sequence,
    output: await findLatestSucceededOutputAsset(db, shot.id),
  })));
}

/** Latest completed private rough cut. Queue state deliberately remains in BullMQ. */
export async function findLatestEpisodeExport(db: DbClient, episodeId: string) {
  const [record] = await db.select({
    id: episodeExports.id,
    outputAssetId: episodeExports.outputAssetId,
    createdAt: episodeExports.createdAt,
  }).from(episodeExports).where(eq(episodeExports.episodeId, episodeId))
    .orderBy(desc(episodeExports.createdAt), desc(episodeExports.id)).limit(1);
  return record ?? null;
}

export async function findLatestEpisodeCompositionTask(db: DbClient, episodeId: string) {
  const [task] = await db.select({
    id: episodeCompositionTasks.id,
    exportId: episodeCompositionTasks.exportId,
    episodeId: episodeCompositionTasks.episodeId,
    inputAssetIds: episodeCompositionTasks.inputAssetIds,
    requestedBy: episodeCompositionTasks.requestedBy,
    requestedAt: episodeCompositionTasks.requestedAt,
  }).from(episodeCompositionTasks).where(eq(episodeCompositionTasks.episodeId, episodeId))
    .orderBy(desc(episodeCompositionTasks.requestedAt), desc(episodeCompositionTasks.id)).limit(1);
  if (task === undefined) return null;
  const [event] = await db.select({
    id: episodeCompositionTaskEvents.id,
    taskId: episodeCompositionTaskEvents.taskId,
    sequence: episodeCompositionTaskEvents.sequence,
    fromStatus: episodeCompositionTaskEvents.fromStatus,
    toStatus: episodeCompositionTaskEvents.toStatus,
    reasonCode: episodeCompositionTaskEvents.reasonCode,
    occurredAt: episodeCompositionTaskEvents.occurredAt,
  }).from(episodeCompositionTaskEvents).where(eq(episodeCompositionTaskEvents.taskId, task.id))
    .orderBy(desc(episodeCompositionTaskEvents.sequence)).limit(1);
  if (event === undefined) throw new Error("Episode composition task has no event history");
  return {
    task: episodeCompositionTaskSchema.parse(task),
    event: episodeCompositionTaskEventSchema.parse({ ...event, reasonCode: event.reasonCode ?? null }),
  };
}

export async function createEpisodeCompositionTask(db: DbClient, input: unknown): Promise<void> {
  const task = episodeCompositionTaskSchema.parse(input);
  const initialEvent = episodeCompositionTaskEventSchema.parse({
    id: randomUUID(),
    taskId: task.id,
    sequence: 1,
    fromStatus: "queued",
    toStatus: "queued",
    reasonCode: null,
    occurredAt: task.requestedAt,
  });
  await db.transaction(async (transaction) => {
    await transaction.insert(episodeCompositionTasks).values({
      id: task.id,
      exportId: task.exportId,
      episodeId: task.episodeId,
      inputAssetIds: [...task.inputAssetIds],
      requestedBy: task.requestedBy,
      requestedAt: task.requestedAt,
    });
    await transaction.insert(episodeCompositionTaskEvents).values({
      id: initialEvent.id,
      taskId: initialEvent.taskId,
      sequence: initialEvent.sequence,
      fromStatus: initialEvent.fromStatus,
      toStatus: initialEvent.toStatus,
      reasonCode: initialEvent.reasonCode,
      occurredAt: initialEvent.occurredAt,
    });
  });
}

export async function appendEpisodeCompositionTaskEvent(db: DbClient, input: unknown): Promise<void> {
  const event = episodeCompositionTaskEventSchema.parse(input);
  await db.insert(episodeCompositionTaskEvents).values({
    id: event.id,
    taskId: event.taskId,
    sequence: event.sequence,
    fromStatus: event.fromStatus,
    toStatus: event.toStatus,
    reasonCode: event.reasonCode,
    occurredAt: event.occurredAt,
  });
}
export async function findShotGenerationInput(db: DbClient, shotId: string) {
  const [shot] = await db.select().from(shots).where(eq(shots.id, shotId)).limit(1);
  if (shot === undefined) return null;
  const references = await db.select({
    id: assets.id,
    sha256: assets.sha256,
    contentType: assets.contentType,
    byteSize: assets.byteSize,
    role: shotReferenceAssets.role,
    sequence: shotReferenceAssets.sequence,
  }).from(shotReferenceAssets)
    .innerJoin(assets, eq(shotReferenceAssets.assetId, assets.id))
    .where(eq(shotReferenceAssets.shotId, shotId))
    .orderBy(asc(shotReferenceAssets.sequence));
  return { shot, references };
}

/** Resolves private image/video metadata for the authenticated Studio media proxy. */
export async function findPrivatePreviewAsset(db: DbClient, assetId: string) {
  const [asset] = await db.select().from(assets).where(eq(assets.id, assetId)).limit(1);
  return asset?.kind === "video" || asset?.kind === "image" ? asset : null;
}

export async function findAssetsByIds(db: DbClient, assetIds: readonly string[]) {
  if (assetIds.length === 0) return [];
  return db.select({ id: assets.id, kind: assets.kind, contentType: assets.contentType })
    .from(assets).where(inArray(assets.id, [...assetIds]));
}

export async function listAssetsForInspection(db: DbClient) {
  return db.select({
    id: assets.id,
    storageKey: assets.storageKey,
    contentType: assets.contentType,
    byteSize: assets.byteSize,
    createdAt: assets.createdAt,
  }).from(assets).orderBy(asc(assets.createdAt));
}

export class EpisodeExportEligibilityError extends Error {
  constructor(readonly assetId: string, readonly reason: "not_found" | "not_generated_video" | "not_approved") {
    super(`Asset ${assetId} is not eligible for episode export (${reason})`);
    this.name = "EpisodeExportEligibilityError";
  }
}

export type ApprovedEpisodeExportInput = {
  readonly id: string;
  readonly storageKey: string;
  readonly sha256: string;
  readonly contentType: string;
};

/**
 * Resolves the exact ordered inputs only after deriving each asset's current
 * review result from the latest review for that output's source run.
 */
export async function findApprovedEpisodeExportInputs(db: DbClient, assetIds: readonly string[]): Promise<ApprovedEpisodeExportInput[]> {
  if (assetIds.length === 0) return [];
  if (new Set(assetIds).size !== assetIds.length) throw new Error("Episode export input assets must be unique");

  const records = await db.select({
    id: assets.id,
    kind: assets.kind,
    storageKey: assets.storageKey,
    sha256: assets.sha256,
    contentType: assets.contentType,
    sourceRunId: assets.sourceRunId,
  }).from(assets).where(inArray(assets.id, [...assetIds]));
  const byId = new Map(records.map((record) => [record.id, record]));
  const reviews = await db.select({
    assetId: assetReviews.assetId,
    sourceRunId: assetReviews.sourceRunId,
    content: assetReviews.contentDecision,
    rights: assetReviews.rightsDecision,
    labeling: assetReviews.labelingDecision,
    decidedBy: assetReviews.decidedBy,
    decidedAt: assetReviews.decidedAt,
    recordedAt: assetReviews.recordedAt,
    id: assetReviews.id,
  }).from(assetReviews)
    .where(inArray(assetReviews.assetId, [...assetIds]))
    .orderBy(desc(assetReviews.decidedAt), desc(assetReviews.recordedAt), desc(assetReviews.id));

  const latestReviewByAssetAndRun = new Map<string, typeof reviews[number]>();
  for (const review of reviews) {
    const key = `${review.assetId}:${review.sourceRunId}`;
    if (!latestReviewByAssetAndRun.has(key)) latestReviewByAssetAndRun.set(key, review);
  }

  return assetIds.map((assetId) => {
    const asset = byId.get(assetId);
    if (asset === undefined) throw new EpisodeExportEligibilityError(assetId, "not_found");
    if (asset.kind !== "video" || asset.sourceRunId === null) {
      throw new EpisodeExportEligibilityError(assetId, "not_generated_video");
    }
    const review = latestReviewByAssetAndRun.get(`${asset.id}:${asset.sourceRunId}`);
    if (review === undefined || resolveReviewStatus({
      contractVersion,
      assetId: asset.id,
      sourceRunId: asset.sourceRunId,
      content: review.content,
      rights: review.rights,
      labeling: review.labeling,
      decidedBy: review.decidedBy,
      decidedAt: review.decidedAt,
    }) !== "approved") {
      throw new EpisodeExportEligibilityError(asset.id, "not_approved");
    }
    return { id: asset.id, storageKey: asset.storageKey, sha256: asset.sha256, contentType: asset.contentType };
  });
}

export async function recordEpisodeExport(db: DbClient, input: unknown): Promise<void> {
  const record = episodeExportRecordSchema.parse(input);
  await db.insert(episodeExports).values({
    id: record.id,
    episodeId: record.episodeId,
    outputAssetId: record.outputAssetId,
    inputAssetIds: [...record.inputAssetIds],
    createdBy: record.createdBy,
    createdAt: record.createdAt,
  });
}
