# ADR-002: immutable generation execution and independent review

- Status: accepted
- Date: 2026-10-04

## Context

An output may be generated successfully but fail copyright, content or AI-label review. Retries and cancellation must preserve evidence of what happened and what was billed.

## Decision

Treat the submitted request on `GenerationRun` as immutable. Model execution changes are represented by append-only `GenerationRunEvent` records. `AssetReview` is independent and records separate content, rights and labeling decisions. A retry creates a new run linked with `retryOfRunId`.

## Consequences

The system can explain cancellations, duplicate polls, provider failures and review outcomes without rewriting history. Queries are more involved but remain small at MVP scale.

## Alternatives considered

- One status field from draft to approved: rejected because it conflates machine execution with human approval.
- Mutable run record: rejected because it loses billing and compliance evidence.
