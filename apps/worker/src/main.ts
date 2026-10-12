import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { config as loadEnvironment } from "dotenv";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import { createDatabaseConnection } from "@ai-manju/db";
import type { GenerationProvider } from "@ai-manju/domain";
import { MockProvider } from "@ai-manju/provider-mock";
import { GenerationOrchestrator, PostgresRunRepository } from "@ai-manju/execution";

import { createBullExecutionQueue, createGenerationWorker } from "./bullmq.js";
import { createEpisodeCompositionWorker } from "./episode-composition-queue.js";
import { createPrivateEpisodeComposer } from "./private-episode-composer.js";
import { createWanProvider } from "./wan-runtime.js";

loadEnvironment({ path: resolve(dirname(fileURLToPath(import.meta.url)), "../../../.env") });

const databaseUrl = process.env.DATABASE_URL;
const redisUrl = process.env.REDIS_URL ?? (process.env.REDIS_PASSWORD === undefined
  ? undefined
  : `redis://:${encodeURIComponent(process.env.REDIS_PASSWORD)}@127.0.0.1:${process.env.REDIS_PORT ?? "6379"}`);

if (databaseUrl === undefined || redisUrl === undefined) {
  throw new Error("DATABASE_URL and REDIS_URL (or REDIS_PASSWORD) must be configured");
}

const database = createDatabaseConnection(databaseUrl);
const executionPool = new Pool({ connectionString: databaseUrl });
const executionDb = drizzle(executionPool);
const connection = { url: redisUrl, maxRetriesPerRequest: null };
const repository = new PostgresRunRepository(executionDb);
const { queue, executionQueue } = createBullExecutionQueue(connection);
const providers = new Map<string, GenerationProvider>([["mock", new MockProvider()], ["wan", createWanProvider(process.env, database)]]);
const orchestrator = new GenerationOrchestrator(repository, executionQueue, providers, { pollDelayMs: 15_000 });
const worker = createGenerationWorker(connection, orchestrator);
const episodeCompositionWorker = createEpisodeCompositionWorker(connection, createPrivateEpisodeComposer(process.env, database));

async function close(signal: string): Promise<void> {
  await episodeCompositionWorker.close();
  await worker.close();
  await queue.close();
  await database.close();
  await executionPool.end();
  process.exitCode = 0;
  process.stdout.write(`worker stopped (${signal})\n`);
}

process.once("SIGINT", () => void close("SIGINT"));
process.once("SIGTERM", () => void close("SIGTERM"));
process.stdout.write("generation and episode composition workers started\n");
