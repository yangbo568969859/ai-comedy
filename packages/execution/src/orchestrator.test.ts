import { describe, expect, it } from "vitest";

import type { ExecutionEvent, GenerationRunSnapshot } from "@ai-manju/domain";
import { MockProvider } from "@ai-manju/provider-mock";
import type { GenerationProvider } from "@ai-manju/domain";

import { GenerationOrchestrator, type ExecutionQueue, type RunRepository, type StoredRun } from "./orchestrator.js";

const runId = "f31cf76b-fb1d-4f81-b36b-3db84d8eff20";
const shotId = "0b534472-9387-4df5-933d-d5f0f14b63eb";
const assetId = "c1d5f8e4-a5a2-46fc-b874-7fd854755b75";

function snapshot(overrides: Partial<GenerationRunSnapshot> = {}): GenerationRunSnapshot {
  const id = overrides.runId ?? runId;
  return {
    contractVersion: "v1",
    runId: id,
    providerId: "mock",
    providerModel: "mock-video-v1",
    workflowVersion: "test",
    promptVersion: "v1",
    idempotencyKey: "5345d7b2-706e-4ef6-aec4-d7929c9a8ef5",
    request: {
      contractVersion: "v1",
      runId: id,
      kind: "i2v",
      prompt: "A character turns toward the camera.",
      durationSec: 5,
      resolution: "720p",
      aspectRatio: "9:16",
      inputAssetIds: [assetId],
      ...(overrides.request?.providerOptions === undefined ? {} : { providerOptions: overrides.request.providerOptions }),
    },
    inputAssetHashes: ["a".repeat(64)],
    estimatedCostMinorUnits: 0,
    currency: "CNY",
    createdAt: "2026-10-05T12:00:00.000Z",
    ...overrides,
  };
}

class MemoryRepository implements RunRepository {
  readonly records = new Map<string, StoredRun>();

  async findByRunId(id: string): Promise<StoredRun | null> {
    return this.records.get(id) ?? null;
  }

  async findByIdempotencyKey(key: string): Promise<StoredRun | null> {
    return [...this.records.values()].find((record) => record.snapshot.idempotencyKey === key) ?? null;
  }

  async create(input: GenerationRunSnapshot, digest: string, associatedShotId?: string): Promise<void> {
    this.records.set(input.runId, {
      snapshot: input,
      snapshotSha256: digest,
      ...(associatedShotId === undefined ? {} : { shotId: associatedShotId }),
      events: [],
    });
  }

  async append(event: ExecutionEvent): Promise<void> {
    const existing = this.records.get(event.runId);
    if (existing === undefined) throw new Error("missing run");
    this.records.set(event.runId, { ...existing, events: [...existing.events, event] });
  }

  async recordActualCost(): Promise<void> {}
}

class MemoryQueue implements ExecutionQueue {
  async enqueueExecute(): Promise<void> {}
  async enqueuePoll(): Promise<void> {}
}

function setup() {
  const repository = new MemoryRepository();
  const provider = new MockProvider();
  const ids = [
    "1d7fa6d3-3567-4308-a6c2-bbb9bd69db5e",
    "9e05562b-d30a-4a56-9220-05af383aabdf",
  ];
  const orchestrator = new GenerationOrchestrator(repository, new MemoryQueue(), new Map([["mock", provider]]), {
    pollDelayMs: 0,
    now: () => new Date("2026-10-05T12:00:00.000Z"),
    createId: () => ids.shift() ?? "50c16a47-42ff-4b54-bd4c-e68266580dca",
  });
  return { repository, orchestrator };
}

describe("GenerationOrchestrator", () => {
  it("retains an immutable shot association when a retry is created", async () => {
    const { repository, orchestrator } = setup();
    const request = snapshot({
      request: { ...snapshot().request, providerOptions: { mockBehavior: { outcome: "temporary_failure" } } },
    });

    await orchestrator.submit(request, { shotId });
    await orchestrator.execute(runId);
    await orchestrator.poll(runId);
    await orchestrator.poll(runId);

    const retry = [...repository.records.values()].find((record) => record.snapshot.retryOfRunId === runId);
    expect(repository.records.get(runId)?.shotId).toBe(shotId);
    expect(retry?.shotId).toBe(shotId);
    expect(retry?.snapshot.retryOfRunId).toBe(runId);
  });

  it("records only a sanitized Wan submit error code", async () => {
    const repository = new MemoryRepository();
    const failingProvider: GenerationProvider = {
      id: "wan",
      getCapabilities: async () => [],
      getCapabilityProfile: async () => { throw new Error("not used"); },
      validate: () => undefined,
      submit: async () => { throw new Error("Wan request failed (InvalidParameter)"); },
      poll: async () => { throw new Error("not used"); },
    };
    const orchestrator = new GenerationOrchestrator(repository, new MemoryQueue(), new Map([["wan", failingProvider]]));
    const request = snapshot({ providerId: "wan", providerModel: "wan2.7-r2v-2026-06-12" });

    await orchestrator.submit(request);
    await orchestrator.execute(runId);

    expect(repository.records.get(runId)?.events.at(-1)).toMatchObject({
      to: "failed",
      reasonCode: "provider_submit_failed_invalidparameter",
    });
  });
});
