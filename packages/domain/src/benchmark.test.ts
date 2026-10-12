import { describe, expect, it } from "vitest";

import { benchmarkEvaluationSchema, benchmarkSuiteDefinitionSchema } from "./index.js";

const cases = Array.from({ length: 10 }, (_, index) => ({
  caseId: `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
  sequence: index + 1,
  code: `B${String(index + 1).padStart(2, "0")}`,
  category: "portrait" as const,
  title: `Case ${index + 1}`,
  prompt: "A controlled benchmark shot.",
  expectedCandidateCount: 3,
}));

describe("benchmark contracts", () => {
  it("requires exactly ten versioned benchmark cases", () => {
    expect(benchmarkSuiteDefinitionSchema.safeParse({
      contractVersion: "v1",
      suiteId: "00000000-0000-4000-8000-000000000001",
      seriesId: "00000000-0000-4000-8000-000000000002",
      version: "v1",
      name: "Provider baseline",
      cases,
    }).success).toBe(true);
    expect(benchmarkSuiteDefinitionSchema.safeParse({
      contractVersion: "v1",
      suiteId: "00000000-0000-4000-8000-000000000001",
      seriesId: "00000000-0000-4000-8000-000000000002",
      version: "v1",
      name: "Provider baseline",
      cases: cases.slice(0, 9),
    }).success).toBe(false);
  });

  it("keeps human scoring bounded and separate from release review", () => {
    expect(benchmarkEvaluationSchema.safeParse({
      contractVersion: "v1",
      evaluationId: "00000000-0000-4000-8000-000000000003",
      candidateId: "00000000-0000-4000-8000-000000000004",
      decision: "accepted",
      identityConsistency: 5,
      sceneConsistency: 4,
      shotAdherence: 4,
      motionQuality: 3,
      technicalQuality: 4,
      evaluatedBy: "studio-development-user",
      evaluatedAt: "2026-10-06T00:00:00.000Z",
    }).success).toBe(true);
    expect(benchmarkEvaluationSchema.safeParse({
      contractVersion: "v1",
      evaluationId: "00000000-0000-4000-8000-000000000003",
      candidateId: "00000000-0000-4000-8000-000000000004",
      decision: "accepted",
      identityConsistency: 6,
      sceneConsistency: 4,
      shotAdherence: 4,
      motionQuality: 3,
      technicalQuality: 4,
      evaluatedBy: "studio-development-user",
      evaluatedAt: "2026-10-06T00:00:00.000Z",
    }).success).toBe(false);
  });
});
