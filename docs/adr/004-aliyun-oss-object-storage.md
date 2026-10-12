# ADR-004: Alibaba Cloud OSS as the initial object store

- Status: accepted
- Date: 2026-10-04

## Context

The MVP must retain private reference media, generated outputs and export artifacts without storing binary media in PostgreSQL. The original local MinIO container could not be fetched reliably on this developer network after multiple registry and runtime attempts.

## Decision

Use a private Alibaba Cloud OSS Bucket for development and the first hosted environment. Access it only through a future storage adapter under `packages/storage/`; the domain and database layers retain opaque storage keys, hashes and metadata only. The adapter uses a dedicated RAM user's least-privilege credentials from environment variables and creates short-lived signed URLs server-side.

The local Docker Compose stack contains PostgreSQL and Redis only. A future local S3-compatible adapter remains permitted, but is not a prerequisite for this MVP.

## Consequences

The project removes MinIO image availability as a local blocker and verifies the production-relevant private-object lifecycle early. OSS credentials, signed URLs and raw object responses cannot be persisted in source code, logs or generation snapshots. Development now requires an OSS Bucket and billed cloud resources.

## Alternatives considered

- Continue trying public MinIO image proxies: rejected because several sources failed to deliver the same fixed image layers on this network.
- Store media blobs in PostgreSQL: rejected because it harms backups, query performance and media delivery.
- Local filesystem only: deferred because it does not verify private-object access or signed URL behavior.
