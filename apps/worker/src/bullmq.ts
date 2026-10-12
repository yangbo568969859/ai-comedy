import { Queue, Worker, type ConnectionOptions } from "bullmq";

import { generationExecutionQueueName, type ExecutionQueue, type GenerationOrchestrator } from "@ai-manju/execution";

type WorkerJob = { readonly runId: string };

function options(connection: ConnectionOptions) {
  return { connection, defaultJobOptions: { removeOnComplete: true, removeOnFail: 100 } };
}

export class BullExecutionQueue implements ExecutionQueue {
  constructor(private readonly queue: Queue<WorkerJob>) {}

  async enqueueExecute(runId: string): Promise<void> {
    await this.queue.add("execute", { runId }, { jobId: `execute-${runId}` });
  }

  async enqueuePoll(runId: string, delayMs: number): Promise<void> {
    // A poll schedules its successor while it is still active. It therefore
    // cannot reuse a fixed BullMQ job id; duplicate polls are harmless because
    // the orchestrator reads the append-only current state before acting.
    await this.queue.add("poll", { runId }, { delay: delayMs });
  }
}

export function createBullExecutionQueue(connection: ConnectionOptions): { queue: Queue<WorkerJob>; executionQueue: ExecutionQueue } {
  const queue = new Queue<WorkerJob>(generationExecutionQueueName, options(connection));
  return { queue, executionQueue: new BullExecutionQueue(queue) };
}

export function createGenerationWorker(connection: ConnectionOptions, orchestrator: GenerationOrchestrator): Worker<WorkerJob> {
  return new Worker<WorkerJob>(
    generationExecutionQueueName,
    async (job) => {
      if (job.name === "execute") return orchestrator.execute(job.data.runId);
      if (job.name === "poll") return orchestrator.poll(job.data.runId);
      throw new Error(`Unsupported worker job ${job.name}`);
    },
    { connection, concurrency: 2 },
  );
}
