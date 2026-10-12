import { z } from "zod";

import { assetIdSchema, contractVersion, isoUtcSchema, runIdSchema } from "./ids.js";

export const reviewStatusSchema = z.enum(["pending", "approved", "rejected"]);
export const reviewDecisionSchema = z.enum(["approved", "rejected", "needs_changes"]);

export const assetReviewSchema = z.object({
  contractVersion: z.literal(contractVersion),
  assetId: assetIdSchema,
  sourceRunId: runIdSchema,
  content: reviewDecisionSchema,
  rights: reviewDecisionSchema,
  labeling: reviewDecisionSchema,
  decidedBy: z.string().min(1).max(256),
  decidedAt: isoUtcSchema,
  note: z.string().max(4_000).optional(),
});
export type AssetReview = z.infer<typeof assetReviewSchema>;

export function resolveReviewStatus(review: AssetReview): z.infer<typeof reviewStatusSchema> {
  const decisions = [review.content, review.rights, review.labeling];
  if (decisions.includes("rejected")) return "rejected";
  if (decisions.every((decision) => decision === "approved")) return "approved";
  return "pending";
}
