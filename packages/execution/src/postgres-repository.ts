import { randomUUID } from "node:crypto";

import { costLedgerEntries, generationRunEvents, generationRuns } from "@ai-manju/db";
import { executionEventSchema, generationRunSnapshotSchema, type ExecutionEvent, type GenerationRunSnapshot } from "@ai-manju/domain";
import { asc, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import type { RunRepository, StoredRun } from "./orchestrator.js";

type Database = NodePgDatabase;

function asIsoUtc(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error("Database returned an invalid timestamp");
  return date.toISOString();
}

function toStoredRun(
  record: typeof generationRuns.$inferSelect,
  events: readonly (typeof generationRunEvents.$inferSelect)[],
): StoredRun {
  const snapshot = generationRunSnapshotSchema.parse(record.requestSnapshot);
  return {
    snapshot,
    snapshotSha256: record.requestSnapshotSha256,
    ...(record.shotId === null ? {} : { shotId: record.shotId }),
    events: events.map((event) => executionEventSchema.parse({
      contractVersion: "v1",
      runId: event.runId,
      sequence: event.sequence,
      from: event.fromStatus,
      to: event.toStatus,
      occurredAt: asIsoUtc(event.occurredAt),
      ...(event.providerJobId === null ? {} : { providerJobId: event.providerJobId }),
      ...(event.reasonCode === null ? {} : { reasonCode: event.reasonCode }),
    })),
  };
}

/** PostgreSQL implementation only appends audit evidence; it never updates a run or event. */
export class PostgresRunRepository implements RunRepository {
  constructor(private readonly db: Database) {}

  async findByRunId(runId: string): Promise<StoredRun | null> {
    const [record] = await this.db.select().from(generationRuns).where(eq(generationRuns.id, runId)).limit(1);
    if (record === undefined) return null;
    const events = await this.db
      .select()
      .from(generationRunEvents)
      .where(eq(generationRunEvents.runId, runId))
      .orderBy(asc(generationRunEvents.sequence));
    return toStoredRun(record, events);
  }

  async findByIdempotencyKey(idempotencyKey: string): Promise<StoredRun | null> {
    const [record] = await this.db
      .select()
      .from(generationRuns)
      .where(eq(generationRuns.idempotencyKey, idempotencyKey))
      .limit(1);
    return record === undefined ? null : this.findByRunId(record.id);
  }

  async create(snapshot: GenerationRunSnapshot, snapshotSha256: string, shotId?: string): Promise<void> {
    await this.db.insert(generationRuns).values({
      id: snapshot.runId,
      providerId: snapshot.providerId,
      providerModel: snapshot.providerModel,
      ...(snapshot.modelVersion === undefined ? {} : { modelVersion: snapshot.modelVersion }),
      workflowVersion: snapshot.workflowVersion,
      promptVersion: snapshot.promptVersion,
      idempotencyKey: snapshot.idempotencyKey,
      requestSnapshot: snapshot,
      requestSnapshotSha256: snapshotSha256,
      estimatedCostMinorUnits: BigInt(snapshot.estimatedCostMinorUnits),
      currency: snapshot.currency,
      ...(shotId === undefined ? {} : { shotId }),
      ...(snapshot.retryOfRunId === undefined ? {} : { retryOfRunId: snapshot.retryOfRunId }),
      createdAt: snapshot.createdAt,
    });
  }

  async append(event: ExecutionEvent): Promise<void> {
    await this.db.insert(generationRunEvents).values({
      id: randomUUID(),
      runId: event.runId,
      sequence: event.sequence,
      fromStatus: event.from,
      toStatus: event.to,
      ...(event.providerJobId === undefined ? {} : { providerJobId: event.providerJobId }),
      ...(event.reasonCode === undefined ? {} : { reasonCode: event.reasonCode }),
      occurredAt: event.occurredAt,
    });
  }

  async recordActualCost(input: {
    runId: string;
    amountMinorUnits: number;
    currency: string;
    providerReference: string;
    occurredAt: string;
  }): Promise<void> {
    await this.db.insert(costLedgerEntries).values({
      id: randomUUID(),
      runId: input.runId,
      kind: "actual",
      amountMinorUnits: BigInt(input.amountMinorUnits),
      currency: input.currency,
      providerReference: input.providerReference,
      recordedBy: "worker",
      occurredAt: input.occurredAt,
    });
  }
}

export function createPostgresRunRepository(databaseUrl: string): { repository: PostgresRunRepository; close: () => Promise<void> } {
  const pool = new Pool({ connectionString: databaseUrl });
  return { repository: new PostgresRunRepository(drizzle(pool)), close: () => pool.end() };
}
