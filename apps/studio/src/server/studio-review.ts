import { assetReviews, findGenerationOutputAsset, findLatestAssetReview, type DatabaseConnection } from "@ai-manju/db";
import { assetReviewSchema, contractVersion, resolveReviewStatus } from "@ai-manju/domain";
import { randomUUID } from "node:crypto";
import { z } from "zod";

export const studioReviewSubmitSchema = z.object({
  content: z.enum(["approved", "rejected", "needs_changes"]),
  rights: z.enum(["approved", "rejected", "needs_changes"]),
  labeling: z.enum(["approved", "rejected", "needs_changes"]),
  note: z.string().trim().max(4_000).optional(),
}).strict();

export const studioReviewSchema = assetReviewSchema.extend({
  status: z.enum(["pending", "approved", "rejected"]),
});
export type StudioReview = z.infer<typeof studioReviewSchema>;

export class StudioReviewError extends Error {
  constructor(readonly status: 400 | 404, message: string) {
    super(message);
  }
}

type DbClient = DatabaseConnection["db"];

function toIsoUtc(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error("Database returned an invalid review timestamp");
  return date.toISOString();
}

function projectReview(row: typeof assetReviews.$inferSelect): StudioReview {
  const review = assetReviewSchema.parse({
    contractVersion,
    assetId: row.assetId,
    sourceRunId: row.sourceRunId,
    content: row.contentDecision,
    rights: row.rightsDecision,
    labeling: row.labelingDecision,
    decidedBy: row.decidedBy,
    decidedAt: toIsoUtc(row.decidedAt),
    ...(row.note === null ? {} : { note: row.note }),
  });
  return studioReviewSchema.parse({ ...review, status: resolveReviewStatus(review) });
}

async function assertOutputAsset(db: DbClient, runId: string, assetId: string) {
  const output = await findGenerationOutputAsset(db, runId);
  if (output === null || output.id !== assetId) {
    throw new StudioReviewError(404, "The selected generation output is not available for review.");
  }
}

export async function readLatestStudioReview(db: DbClient, runId: string, assetId: string): Promise<StudioReview | null> {
  await assertOutputAsset(db, runId, assetId);
  const latest = await findLatestAssetReview(db, assetId, runId);
  return latest === null ? null : projectReview(latest);
}

export async function recordStudioReview(input: {
  runId: string;
  assetId: string;
  decision: z.infer<typeof studioReviewSubmitSchema>;
}, dependencies: { db: DbClient; reviewerId: string }): Promise<StudioReview> {
  await assertOutputAsset(dependencies.db, input.runId, input.assetId);
  const now = new Date().toISOString();
  const review = assetReviewSchema.parse({
    contractVersion,
    assetId: input.assetId,
    sourceRunId: input.runId,
    ...input.decision,
    decidedBy: dependencies.reviewerId,
    decidedAt: now,
  });
  await dependencies.db.insert(assetReviews).values({
    id: randomUUID(),
    assetId: review.assetId,
    sourceRunId: review.sourceRunId,
    contentDecision: review.content,
    rightsDecision: review.rights,
    labelingDecision: review.labeling,
    decidedBy: review.decidedBy,
    note: review.note ?? null,
    decidedAt: review.decidedAt,
  });
  return studioReviewSchema.parse({ ...review, status: resolveReviewStatus(review) });
}
