# ADR-007: Studio Server-State Ownership

## Status

Accepted

## Context

Studio currently reads the project tree with a client-side fetch and uses a reload token after mutations. The first real asset upload exposed that this approach can replace a populated workspace with a global loading state. Upcoming work adds independently changing assets, generation runs, run events, rights records, and reviews.

These values are persisted on the server, are shared by multiple Studio features, and need mutation-driven refresh, pending/error state, and later polling. They are not browser-only global state.

## Decision

Adopt `@tanstack/react-query` as the Studio server-state layer before the generation submission feature is implemented.

- Keep API DTO parsing at the existing Zod boundary. Query functions return parsed DTOs only.
- Define query-key factories by resource identity, for example project, shot assets, run, and run events.
- Use confirmed mutations first. On success, invalidate or update only the affected query; do not refetch the whole workspace through a reload token.
- Preserve selected episode, selected shot, active tab, dialog state, upload progress, and draft form values in component state or URL state.
- Poll only non-terminal generation runs. A later event stream updates the same query cache instead of adding a second state path.
- Do not persist the query cache and do not put credentials, signed URLs, provider payloads, or ORM records in it.

Do not add Zustand now. It may be introduced later only for shared, browser-only workspace preferences such as persisted panel layout or a command palette. It must not own API DTOs, run events, assets, reviews, or rights state.

## Consequences

The next Studio data-access batch must add one `QueryClientProvider` at the client boundary, typed query-option helpers under `features/studio`, and focused tests for mutation invalidation and selection preservation. The existing `reloadToken` pattern is transitional and must be removed as each resource is migrated.

## Alternatives considered

- Continue with local `useEffect` and reload tokens: rejected because mutation behavior and loading/error/cache behavior will be duplicated as features grow.
- Zustand for all state: rejected because it provides a client store but does not define remote-data freshness, invalidation, mutation lifecycle, or polling ownership.
- React Context for all state: rejected because it has the same remote-cache gaps and broad update behavior without improving data ownership.
