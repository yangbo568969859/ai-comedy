import { describe, expect, it } from "vitest";

import { episodePlanSchema, seriesPlanSchema, shotPlanSchema } from "./story.js";

describe("story production plan contracts", () => {
  const seriesId = "b0a1c6cf-e047-4f7f-bfa3-ae8f1edb9d6b";
  const episodeId = "abecb20d-4b1e-4e80-a843-0a5e43f134ea";

  it("accepts an editable series, episode, and shot hierarchy", () => {
    expect(seriesPlanSchema.safeParse({ id: seriesId, title: "Pilot" }).success).toBe(true);
    expect(episodePlanSchema.safeParse({ id: episodeId, seriesId, sequence: 1, title: "Episode 1" }).success).toBe(true);
    expect(
      shotPlanSchema.safeParse({
        id: "7ddbf7cf-10c8-4bd7-b8c8-a8377637df5f",
        episodeId,
        sequence: 1,
        title: "Opening",
        script: "A character enters the empty station.",
        durationSec: 5,
      }).success,
    ).toBe(true);
  });

  it("rejects invalid shot duration and sequence", () => {
    expect(
      shotPlanSchema.safeParse({
        id: "7ddbf7cf-10c8-4bd7-b8c8-a8377637df5f",
        episodeId,
        sequence: 0,
        title: "Opening",
        script: "A character enters the empty station.",
        durationSec: 61,
      }).success,
    ).toBe(false);
  });
});
