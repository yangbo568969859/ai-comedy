import { describe, expect, it } from "vitest";

import { studioReviewSchema, studioReviewSubmitSchema } from "./studio-review";

describe("studio review submission", () => {
  it("requires every human gate and refuses unknown fields", () => {
    expect(studioReviewSubmitSchema.safeParse({ content: "approved", rights: "approved", labeling: "approved" }).success).toBe(true);
    expect(studioReviewSubmitSchema.safeParse({ content: "approved", rights: "approved" }).success).toBe(false);
    expect(studioReviewSubmitSchema.safeParse({ content: "approved", rights: "approved", labeling: "approved", publish: true }).success).toBe(false);
  });

  it("accepts the shared v1 review contract instead of a numeric version", () => {
    const review = {
      contractVersion: "v1",
      assetId: "4ca93b43-d8d9-4eed-a9b9-75d5c20b6850",
      sourceRunId: "83131d0e-c301-466d-be0d-42f7c730dcb9",
      content: "approved",
      rights: "approved",
      labeling: "approved",
      decidedBy: "local-studio-reviewer",
      decidedAt: "2026-10-09T00:00:00.000Z",
      status: "approved",
    };
    expect(studioReviewSchema.safeParse(review).success).toBe(true);
    expect(studioReviewSchema.safeParse({ ...review, contractVersion: 1 }).success).toBe(false);
  });
});
