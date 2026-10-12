import { randomUUID } from "node:crypto";

import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import { MockProvider } from "@ai-manju/provider-mock";
import { GenerationOrchestrator, PostgresRunRepository } from "@ai-manju/execution";

import { createBullExecutionQueue, createGenerationWorker } from "./bullmq.js";

const databaseUrl = process.env.DATABASE_URL;
const redisUrl = process.env.REDIS_URL ?? (process.env.REDIS_PASSWORD === undefined
  ? undefined
  : `redis://:${encodeURIComponent(process.env.REDIS_PASSWORD)}@127.0.0.1:${process.env.REDIS_PORT ?? "6379"}`);
if (databaseUrl === undefined || redisUrl === undefined) throw new Error("DATABASE_URL and Redis configuration are required");

const pool = new Pool({ connectionString: databaseUrl });
const db = drizzle(pool);
const connection = { url: redisUrl, maxRetriesPerRequest: null };
const repository = new PostgresRunRepository(db);
const { queue, executionQueue } = createBullExecutionQueue(connection);
const orchestrator = new GenerationOrchestrator(repository, executionQueue, new Map([["mock", new MockProvider()]]), { pollDelayMs: 25 });
const worker = createGenerationWorker(connection, orchestrator);
const runId = randomUUID();

try {
  await orchestrator.submit({
    contractVersion: "v1",
    runId,
    providerId: "mock",
    providerModel: "mock-video-v1",
    workflowVersion: "demo-v1",
    promptVersion: "demo-v1",
    idempotencyKey: randomUUID(),
    request: {
      contractVersion: "v1",
      runId,
      kind: "i2v",
      prompt: "A test character turns toward the camera.",
      durationSec: 5,
      resolution: "720p",
      aspectRatio: "9:16",
      inputAssetIds: [randomUUID()],
      providerOptions: { mockBehavior: { completeAfterPolls: 2 } },
    },
    inputAssetHashes: ["0".repeat(64)],
    estimatedCostMinorUnits: 0,
    currency: "CNY",
    createdAt: new Date().toISOString(),
  });

  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    const run = await repository.findByRunId(runId);
    if (run?.events.at(-1)?.to === "succeeded") {
      process.stdout.write(`demo succeeded: ${run.events.map((event) => event.to).join(" -> ")}\n`);
      process.exitCode = 0;
      break;
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  if (process.exitCode === undefined) throw new Error("Demo timed out before success");
} finally {
  await worker.close();
  await queue.close();
  await pool.end();
}
