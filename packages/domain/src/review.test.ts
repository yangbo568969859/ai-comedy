import { describe, expect, it } from "vitest";

import { resolveReviewStatus, type AssetReview } from "./index.js";

const baseReview: AssetReview = {
  contractVersion: "v1",
  assetId: "c0a0fcf3-3a8c-4fe5-a9a0-cfe8fceb36d0",
  sourceRunId: "1b5ec25c-c85d-4178-9250-0fae03e5600e",
  content: "approved",
  rights: "approved",
  labeling: "approved",
  decidedBy: "reviewer@example.test",
  decidedAt: "2026-10-04T12:00:00.000Z",
};

describe("asset review", () => {
  it("approves only when all three human gates approve", () => {
    expect(resolveReviewStatus(baseReview)).toBe("approved");
    expect(resolveReviewStatus({ ...baseReview, labeling: "needs_changes" })).toBe("pending");
    expect(resolveReviewStatus({ ...baseReview, rights: "rejected" })).toBe("rejected");
  });
});
