# ADR-003: provider anti-corruption boundary and idempotency

- Status: accepted
- Date: 2026-10-04

## Context

Cloud and local video systems expose incompatible request formats, async states, pricing and error behavior. Submitting an unknown outcome twice can incur duplicate charges.

## Decision

Business code uses a versioned `GenerationProvider` contract defined in `packages/domain`. Adapters normalize provider results, preserve sanitized raw payload references outside the domain package, and require an idempotency key. The MVP routes manually; it does not automatically fail over between providers.

## Consequences

Provider SDKs stay replaceable and benchmark results stay comparable. Adapter authors must explicitly map errors and capabilities.

## Alternatives considered

- Direct SDK calls from route handlers: rejected because they lock the product to one provider and bypass auditable state changes.
- Automatic provider routing: deferred until real benchmark and cost data exist.
