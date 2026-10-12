import { describe, expect, it } from "vitest";

import {
  assertExecutionTransition,
  canTransitionExecution,
  executionEventSchema,
  generationRunSnapshotSchema,
  normalizedGenerationRequestSchema,
} from "./index.js";

const runId = "1b5ec25c-c85d-4178-9250-0fae03e5600e";
const assetId = "c0a0fcf3-3a8c-4fe5-a9a0-cfe8fceb36d0";
const timestamp = "2026-10-04T12:00:00.000Z";

describe("execution state machine", () => {
  it.each([
    ["draft", "queued"],
    ["queued", "submitting"],
    ["submitting", "provider_queued"],
    ["provider_queued", "running"],
    ["running", "cancel_requested"],
    ["cancel_requested", "canceled"],
  ] as const)("allows %s -> %s", (from, to) => {
    expect(canTransitionExecution(from, to)).toBe(true);
  });

  it.each([
    ["draft", "running"],
    ["succeeded", "queued"],
    ["failed", "running"],
    ["canceled", "succeeded"],
  ] as const)("rejects %s -> %s", (from, to) => {
    expect(canTransitionExecution(from, to)).toBe(false);
    expect(() => assertExecutionTransition(from, to)).toThrow("Invalid execution state transition");
  });
});

describe("generation contracts", () => {
  it("accepts a bounded normalized request", () => {
    const result = normalizedGenerationRequestSchema.safeParse({
      contractVersion: "v1",
      runId,
      kind: "i2v",
      prompt: "A protagonist turns toward the camera.",
      durationSec: 5,
      resolution: "720p",
      aspectRatio: "9:16",
      inputAssetIds: [assetId],
    });
    expect(result.success).toBe(true);
  });

  it.each(["21:9", "4:3", "3:4", "1:1"] as const)("accepts standardized aspect ratio %s", (aspectRatio) => {
    expect(normalizedGenerationRequestSchema.safeParse({
      contractVersion: "v1",
      runId,
      kind: "i2v",
      prompt: "A protagonist turns toward the camera.",
      durationSec: 5,
      resolution: "720p",
      aspectRatio,
      inputAssetIds: [assetId],
    }).success).toBe(true);
  });

  it("rejects an invalid asset id and unbounded duration", () => {
    const result = normalizedGenerationRequestSchema.safeParse({
      contractVersion: "v1",
      runId,
      kind: "i2v",
      prompt: "test",
      durationSec: 61,
      resolution: "720p",
      aspectRatio: "9:16",
      inputAssetIds: ["not-a-uuid"],
    });
    expect(result.success).toBe(false);
  });

  it("requires an immutable snapshot and valid event sequence", () => {
    expect(
      generationRunSnapshotSchema.safeParse({
        contractVersion: "v1",
        runId,
        providerId: "mock",
        providerModel: "mock-video-v1",
        workflowVersion: "git:abc123",
        promptVersion: "v1",
        idempotencyKey: "a7d54e41-2363-4210-8ec1-3ca52df5c684",
        request: {
          contractVersion: "v1",
          runId,
          kind: "i2v",
          prompt: "test",
          durationSec: 5,
          resolution: "720p",
          aspectRatio: "9:16",
          inputAssetIds: [assetId],
        },
        inputAssetHashes: ["f".repeat(64)],
        estimatedCostMinorUnits: 120,
        currency: "USD",
        createdAt: timestamp,
      }).success,
    ).toBe(true);

    expect(
      executionEventSchema.safeParse({
        contractVersion: "v1",
        runId,
        sequence: 1,
        from: "queued",
        to: "running",
        occurredAt: timestamp,
      }).success,
    ).toBe(true);
  });
});
