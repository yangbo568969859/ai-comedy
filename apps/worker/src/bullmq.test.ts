import { describe, expect, it } from "vitest";

import { BullExecutionQueue, createBullExecutionQueue, createGenerationWorker } from "./bullmq.js";
import { createEpisodeCompositionWorker } from "./episode-composition-queue.js";

describe("worker queue adapter", () => {
  it("exports the BullMQ adapter and worker factory", () => {
    expect(BullExecutionQueue).toBeTypeOf("function");
    expect(createBullExecutionQueue).toBeTypeOf("function");
    expect(createGenerationWorker).toBeTypeOf("function");
    expect(createEpisodeCompositionWorker).toBeTypeOf("function");
  });
});
