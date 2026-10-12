import { Queue } from "bullmq";

import type { GenerationProvider } from "@ai-manju/domain";
import {
  GenerationOrchestrator,
  createPostgresRunRepository,
  generationExecutionQueueName,
  type ExecutionQueue,
} from "@ai-manju/execution";

type WorkerJob = { readonly runId: string };

export function createStudioGenerationRuntime(databaseUrl: string, redisUrl: string) {
  const postgres = createPostgresRunRepository(databaseUrl);
  const queue = new Queue<WorkerJob>(generationExecutionQueueName, {
    connection: { url: redisUrl, maxRetriesPerRequest: null },
    defaultJobOptions: { removeOnComplete: true, removeOnFail: 100 },
  });
  const executionQueue: ExecutionQueue = {
    async enqueueExecute(runId) {
      await queue.add("execute", { runId }, { jobId: `execute-${runId}` });
    },
    async enqueuePoll(runId, delayMs) {
      await queue.add("poll", { runId }, { delay: delayMs });
    },
  };
  return {
    orchestrator: new GenerationOrchestrator(postgres.repository, executionQueue, new Map<string, GenerationProvider>()),
    close: async () => {
      await queue.close();
      await postgres.close();
    },
  };
}

export function resolveRedisUrl(environment: Record<string, string | undefined>): string | undefined {
  if (environment.REDIS_URL !== undefined && environment.REDIS_URL.length > 0) return environment.REDIS_URL;
  if (environment.REDIS_PASSWORD === undefined || environment.REDIS_PASSWORD.length === 0) return undefined;
  return `redis://:${encodeURIComponent(environment.REDIS_PASSWORD)}@127.0.0.1:${environment.REDIS_PORT ?? "6379"}`;
}
