import { describe, expect, it } from "vitest";

import { MockProvider } from "./mock-provider.js";

const request = {
  contractVersion: "v1" as const,
  runId: "be30edf2-07e3-4456-8ff2-9ec5e55b669d",
  kind: "i2v" as const,
  prompt: "A character looks into the camera.",
  durationSec: 5,
  resolution: "720p" as const,
  aspectRatio: "9:16" as const,
  inputAssetIds: ["b6a38dae-a444-4cad-88b5-9eabdd17f4be"],
};

describe("MockProvider", () => {
  it("reports queued, running, then a traceable success", async () => {
    const provider = new MockProvider();
    const submission = await provider.submit({ ...request, providerOptions: { mockBehavior: { completeAfterPolls: 3 } } });
    expect(await provider.poll(submission.providerJobId)).toMatchObject({ state: "queued" });
    expect(await provider.poll(submission.providerJobId)).toMatchObject({ state: "running" });
    expect(await provider.poll(submission.providerJobId)).toMatchObject({ state: "succeeded", actualCostMinorUnits: 0 });
  });

  it("produces a bounded retryable failure", async () => {
    const provider = new MockProvider();
    const submission = await provider.submit({ ...request, providerOptions: { mockBehavior: { outcome: "temporary_failure" } } });
    await provider.poll(submission.providerJobId);
    await expect(provider.poll(submission.providerJobId)).resolves.toMatchObject({ state: "failed", retryable: true });
  });
});
