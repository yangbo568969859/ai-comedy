# ADR-001: pnpm TypeScript monorepo baseline

- Status: accepted
- Date: 2026-10-04

## Context

The first deliverable is an internal production control plane with a web UI, async worker, provider adapters and shared contracts. A solo maintainer needs one dependency graph and simple local commands.

## Decision

Use a pnpm workspace with TypeScript in strict mode. Keep reusable contracts in `packages/domain`; future applications live in `apps/*`. Use pnpm recursive scripts rather than Turborepo during the MVP.

## Consequences

Packages get independent public exports and typechecks with a shared compiler baseline. Builds remain simple, but task caching and remote execution are deliberately deferred.

## Alternatives considered

- Multiple repositories: rejected because contracts and coordinated releases would add overhead.
- Nx/Turborepo: deferred because the repository has no slow multi-package build yet.
- Python-first stack: rejected for the control plane; Python may later run isolated model workers.
