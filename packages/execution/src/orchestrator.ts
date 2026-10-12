import { createHash, randomUUID } from "node:crypto";

import {
  assertExecutionTransition,
  contractVersion,
  executionEventSchema,
  generationRunSnapshotSchema,
  shotIdSchema,
  type ExecutionEvent,
  type ExecutionStatus,
  type GenerationProvider,
  type GenerationRunSnapshot,
} from "@ai-manju/domain";

export interface StoredRun {
  readonly snapshot: GenerationRunSnapshot;
  readonly snapshotSha256: string;
  readonly shotId?: string;
  readonly events: readonly ExecutionEvent[];
}

export interface RunRepository {
  findByRunId(runId: string): Promise<StoredRun | null>;
  findByIdempotencyKey(idempotencyKey: string): Promise<StoredRun | null>;
  create(snapshot: GenerationRunSnapshot, snapshotSha256: string, shotId?: string): Promise<void>;
  append(event: ExecutionEvent): Promise<void>;
  recordActualCost(input: {
    runId: string;
    amountMinorUnits: number;
    currency: string;
    providerReference: string;
    occurredAt: string;
  }): Promise<void>;
}

export interface ExecutionQueue {
  enqueueExecute(runId: string): Promise<void>;
  enqueuePoll(runId: string, delayMs: number): Promise<void>;
}

export interface SubmitGenerationRunOptions {
  readonly shotId?: string;
}

export interface OrchestratorOptions {
  readonly pollDelayMs?: number;
  readonly maxRetryDepth?: number;
  readonly now?: () => Date;
  readonly createId?: () => string;
}

function stableJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>).sort(([left], [right]) => left.localeCompare(right));
  return `{${entries.map(([key, child]) => `${JSON.stringify(key)}:${stableJson(child)}`).join(",")}}`;
}

export function snapshotSha256(snapshot: GenerationRunSnapshot): string {
  return createHash("sha256").update(stableJson(snapshot)).digest("hex");
}

function currentStatus(run: StoredRun): ExecutionStatus {
  const latest = run.events.at(-1);
  if (latest === undefined) throw new Error(`Run ${run.snapshot.runId} has no execution event`);
  return latest.to;
}

function providerJobId(run: StoredRun): string {
  for (const event of [...run.events].reverse()) {
    if (event.providerJobId !== undefined) return event.providerJobId;
  }
  throw new Error(`Run ${run.snapshot.runId} has no provider job id`);
}

/**
 * Preserves a provider's stable error code without allowing request content,
 * signed media URLs, or credentials to enter the append-only event log.
 */
function submissionFailureReason(error: unknown): string {
  if (!(error instanceof Error)) return "provider_submit_failed";
  const match = /^Wan request failed \(([A-Za-z0-9_-]{1,80})\)$/.exec(error.message);
  const code = match?.[1];
  return code === undefined
    ? "provider_submit_failed"
    : `provider_submit_failed_${code.toLowerCase()}`;
}

export class GenerationOrchestrator {
  private readonly pollDelayMs: number;
  private readonly maxRetryDepth: number;
  private readonly now: () => Date;
  private readonly createId: () => string;

  constructor(
    private readonly repository: RunRepository,
    private readonly queue: ExecutionQueue,
    private readonly providers: ReadonlyMap<string, GenerationProvider>,
    options: OrchestratorOptions = {},
  ) {
    this.pollDelayMs = options.pollDelayMs ?? 1_000;
    this.maxRetryDepth = options.maxRetryDepth ?? 2;
    this.now = options.now ?? (() => new Date());
    this.createId = options.createId ?? randomUUID;
  }

  async submit(input: GenerationRunSnapshot, options: SubmitGenerationRunOptions = {}): Promise<StoredRun> {
    const snapshot = generationRunSnapshotSchema.parse(input);
    const shotId = options.shotId === undefined ? undefined : shotIdSchema.parse(options.shotId);
    const existing = await this.repository.findByIdempotencyKey(snapshot.idempotencyKey);
    if (existing !== null) {
      if (currentStatus(existing) === "queued") await this.queue.enqueueExecute(existing.snapshot.runId);
      return existing;
    }

    const digest = snapshotSha256(snapshot);
    await this.repository.create(snapshot, digest, shotId);
    const queued = this.makeEvent(snapshot.runId, 1, "draft", "queued");
    await this.repository.append(queued);
    await this.queue.enqueueExecute(snapshot.runId);
    return { snapshot, snapshotSha256: digest, ...(shotId === undefined ? {} : { shotId }), events: [queued] };
  }

  async execute(runId: string): Promise<void> {
    const run = await this.requireRun(runId);
    if (currentStatus(run) !== "queued") return;
    const provider = this.requireProvider(run.snapshot.providerId);
    const submitting = await this.transition(run, "submitting");
    try {
      const providerContext = { providerModel: run.snapshot.providerModel };
      provider.validate(run.snapshot.request, providerContext);
      const submission = await provider.submit(run.snapshot.request, providerContext);
      const afterSubmission = await this.requireRun(runId);
      await this.transition(afterSubmission, "provider_queued", { providerJobId: submission.providerJobId });
      await this.queue.enqueuePoll(runId, this.pollDelayMs);
    } catch (error) {
      const afterFailure = await this.requireRun(runId);
      if (currentStatus(afterFailure) === "submitting") {
        await this.transition(afterFailure, "failed", { reasonCode: submissionFailureReason(error) });
      }
    }
    void submitting;
  }

  async poll(runId: string): Promise<void> {
    const run = await this.requireRun(runId);
    const status = currentStatus(run);
    if (status === "cancel_requested") {
      await this.completeCancellation(run);
      return;
    }
    if (status !== "provider_queued" && status !== "running") return;

    const provider = this.requireProvider(run.snapshot.providerId);
    const jobId = providerJobId(run);
    let result;
    try {
      result = await provider.poll(jobId, { runId });
    } catch {
      await this.transition(run, "failed", { reasonCode: "provider_poll_failed" });
      return;
    }

    if (result.state === "queued") {
      await this.queue.enqueuePoll(runId, this.pollDelayMs);
      return;
    }
    if (result.state === "running") {
      const latest = await this.requireRun(runId);
      if (currentStatus(latest) === "provider_queued") await this.transition(latest, "running", { providerJobId: jobId });
      await this.queue.enqueuePoll(runId, this.pollDelayMs);
      return;
    }
    if (result.state === "succeeded") {
      const latest = await this.requireRun(runId);
      if (currentStatus(latest) === "provider_queued" || currentStatus(latest) === "running") {
        await this.transition(latest, "succeeded", { providerJobId: jobId });
        if (result.actualCostMinorUnits !== undefined) {
          await this.repository.recordActualCost({
            runId,
            amountMinorUnits: result.actualCostMinorUnits,
            currency: latest.snapshot.currency,
            providerReference: jobId,
            occurredAt: this.now().toISOString(),
          });
        }
      }
      return;
    }

    const failedRun = await this.requireRun(runId);
    if (currentStatus(failedRun) !== "provider_queued" && currentStatus(failedRun) !== "running") return;
    await this.transition(failedRun, "failed", { providerJobId: jobId, reasonCode: `provider_${result.errorKind}` });
    if (result.retryable) await this.createRetry(failedRun);
  }

  async requestCancel(runId: string): Promise<void> {
    const run = await this.requireRun(runId);
    const status = currentStatus(run);
    if (status === "queued") {
      await this.transition(run, "canceled", { reasonCode: "canceled_before_submission" });
      return;
    }
    if (status === "provider_queued" || status === "running") {
      await this.transition(run, "cancel_requested", { providerJobId: providerJobId(run), reasonCode: "cancel_requested" });
      await this.queue.enqueuePoll(runId, 0);
    }
  }

  private async completeCancellation(run: StoredRun): Promise<void> {
    const provider = this.requireProvider(run.snapshot.providerId);
    const jobId = providerJobId(run);
    try {
      if (provider.cancel === undefined) throw new Error("Provider does not support cancellation");
      await provider.cancel(jobId);
      const latest = await this.requireRun(run.snapshot.runId);
      if (currentStatus(latest) === "cancel_requested") {
        await this.transition(latest, "canceled", { providerJobId: jobId, reasonCode: "provider_canceled" });
      }
    } catch {
      const latest = await this.requireRun(run.snapshot.runId);
      if (currentStatus(latest) === "cancel_requested") {
        await this.transition(latest, "failed", { providerJobId: jobId, reasonCode: "provider_cancel_failed" });
      }
    }
  }

  private async createRetry(failedRun: StoredRun): Promise<void> {
    const depth = await this.retryDepth(failedRun);
    if (depth >= this.maxRetryDepth) return;
    const runId = this.createId();
    const retry: GenerationRunSnapshot = {
      ...failedRun.snapshot,
      runId,
      idempotencyKey: this.createId(),
      retryOfRunId: failedRun.snapshot.runId,
      request: { ...failedRun.snapshot.request, runId },
      createdAt: this.now().toISOString(),
    };
    await this.submit(retry, { ...(failedRun.shotId === undefined ? {} : { shotId: failedRun.shotId }) });
  }

  private async retryDepth(run: StoredRun): Promise<number> {
    let depth = 0;
    let current: StoredRun | null = run;
    while (current?.snapshot.retryOfRunId !== undefined) {
      depth += 1;
      current = await this.repository.findByRunId(current.snapshot.retryOfRunId);
    }
    return depth;
  }

  private async transition(run: StoredRun, to: ExecutionStatus, extras: { providerJobId?: string; reasonCode?: string } = {}): Promise<ExecutionEvent> {
    const from = currentStatus(run);
    assertExecutionTransition(from, to);
    const event = this.makeEvent(run.snapshot.runId, run.events.length + 1, from, to, extras);
    await this.repository.append(event);
    return event;
  }

  private makeEvent(runId: string, sequence: number, from: ExecutionStatus, to: ExecutionStatus, extras: { providerJobId?: string; reasonCode?: string } = {}): ExecutionEvent {
    return executionEventSchema.parse({ contractVersion, runId, sequence, from, to, occurredAt: this.now().toISOString(), ...extras });
  }

  private async requireRun(runId: string): Promise<StoredRun> {
    const run = await this.repository.findByRunId(runId);
    if (run === null) throw new Error(`Unknown generation run ${runId}`);
    return run;
  }

  private requireProvider(providerId: string): GenerationProvider {
    const provider = this.providers.get(providerId);
    if (provider === undefined) throw new Error(`No configured provider for ${providerId}`);
    return provider;
  }
}
