import { createHash, randomUUID } from "node:crypto";

import {
  contractVersion,
  type GenerationProvider,
  type NormalizedGenerationRequest,
  type ProviderCapability,
  type ProviderPollResult,
  type ProviderSubmission,
} from "@ai-manju/domain";
import { z } from "zod";

const behaviorSchema = z.object({
  completeAfterPolls: z.number().int().min(1).max(10).default(2),
  outcome: z.enum(["succeed", "temporary_failure", "permanent_failure"]).default("succeed"),
});
export type MockBehavior = z.infer<typeof behaviorSchema>;

interface MockJob {
  readonly request: NormalizedGenerationRequest;
  readonly behavior: MockBehavior;
  polls: number;
  canceled: boolean;
}

/**
 * Deterministic in-memory provider for exercising the versioned provider
 * contract. It never writes media or speaks to a cloud provider.
 */
export class MockProvider implements GenerationProvider {
  readonly id = "mock";
  private readonly jobs = new Map<string, MockJob>();

  async getCapabilities(): Promise<readonly ProviderCapability[]> {
    return [{
      contractVersion,
      kind: "i2v",
      resolutions: ["480p", "720p", "1080p"],
      aspectRatios: ["9:16", "16:9", "1:1"],
      durationSec: { min: 1, max: 60 },
      supportsSeed: true,
      supportsReferenceImages: true,
      supportsAudio: false,
    }];
  }

  validate(request: NormalizedGenerationRequest): void {
    if (request.kind !== "i2v") throw new Error("MockProvider only supports i2v");
    if (request.audioAssetId !== undefined) throw new Error("MockProvider does not support audio");
  }

  async submit(request: NormalizedGenerationRequest): Promise<ProviderSubmission> {
    this.validate(request);
    const behavior = behaviorSchema.parse(request.providerOptions?.mockBehavior ?? {});
    const providerJobId = `mock-${randomUUID()}`;
    this.jobs.set(providerJobId, { request, behavior, polls: 0, canceled: false });
    return { contractVersion, providerJobId, acceptedAt: new Date().toISOString() };
  }

  async poll(providerJobId: string): Promise<ProviderPollResult> {
    const job = this.jobs.get(providerJobId);
    if (job === undefined) {
      return { state: "failed", retryable: false, errorKind: "permanent", message: "Mock job was not found" };
    }
    if (job.canceled) {
      return { state: "failed", retryable: false, errorKind: "permanent", message: "Mock job was canceled" };
    }
    job.polls += 1;
    if (job.polls < job.behavior.completeAfterPolls) {
      return job.polls === 1 ? { state: "queued", progressPercent: 0 } : { state: "running", progressPercent: 50 };
    }
    if (job.behavior.outcome !== "succeed") {
      return {
        state: "failed",
        retryable: job.behavior.outcome === "temporary_failure",
        errorKind: job.behavior.outcome === "temporary_failure" ? "temporary" : "permanent",
        message: `Mock ${job.behavior.outcome}`,
      };
    }
    return {
      state: "succeeded",
      outputAssetId: randomUUID(),
      outputHash: createHash("sha256").update(providerJobId).digest("hex"),
      actualCostMinorUnits: 0,
    };
  }

  async cancel(providerJobId: string): Promise<void> {
    const job = this.jobs.get(providerJobId);
    if (job === undefined) throw new Error("Mock job was not found");
    job.canceled = true;
  }
}
