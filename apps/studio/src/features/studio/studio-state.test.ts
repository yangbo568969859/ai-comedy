import { describe, expect, it } from "vitest";

import { reviewSummary, runStatusLabel } from "./studio-state";

describe("studio state", () => {
  it("maps provider states to operator-facing labels", () => {
    expect(runStatusLabel("provider_queued")).toBe("供应商排队");
    expect(runStatusLabel()).toBe("未生成");
  });

  it("does not approve a release candidate until all review gates pass", () => {
    expect(reviewSummary({ content: "approved", rights: "approved", labeling: "needs_changes" })).toBe("pending");
    expect(reviewSummary({ content: "approved", rights: "rejected", labeling: "approved" })).toBe("rejected");
    expect(reviewSummary({ content: "approved", rights: "approved", labeling: "approved" })).toBe("approved");
  });
});
