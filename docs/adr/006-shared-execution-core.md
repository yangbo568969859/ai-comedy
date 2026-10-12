# ADR-006: Shared execution core for the Studio API and Worker

- Status: accepted
- Date: 2026-10-05

## Context

The Studio API must create an immutable generation run and enqueue it, while the Worker must execute and poll that same run. Keeping the orchestration service under `apps/worker` would require the Studio application to depend on another application. It also leaves the existing `generation_runs.shot_id` association unused.

## Decision

Move the provider-neutral orchestration service, repository contract, and PostgreSQL run repository into `packages/execution`. Keep BullMQ process lifecycle and queue worker registration in `apps/worker`. The Studio server may depend on `packages/execution` to submit a run through the same repository and queue contract, but it never invokes a provider SDK directly.

Model the optional shot association as an immutable creation attribute beside the immutable request snapshot. It is written once with `generation_runs` and carried to every retry run. It is not an execution event and is never updated after creation.

## Consequences

The Studio API and Worker share one execution state machine, idempotency behavior, retry behavior, and persistence mapping. The Worker remains the only long-lived executor. Tests must prove a retry retains its originating shot association.

The new package introduces a deliberate dependency on Drizzle and PostgreSQL types. It does not read environment variables; applications supply the configured database and queue implementations.

## Alternatives considered

- Import `apps/worker` from `apps/studio`: rejected because applications must not be reusable libraries or depend on each other.
- Duplicate run-creation logic in the Studio API: rejected because idempotency, event sequencing, and retry semantics would drift.
- Put `shotId` into mutable run metadata: rejected because it would weaken the immutable execution evidence model.
