# ADR-005: Tailwind and Radix foundation for the studio UI

- Status: accepted
- Date: 2026-10-05

## Context

The first studio screen proved the production-flow layout, but it uses a single hand-written stylesheet and a large client component. That does not provide a consistent visual system, accessible composite controls, or maintainable feature boundaries for the upcoming asset, run, and review APIs.

## Decision

Use Tailwind CSS as the styling and design-token layer for `apps/studio`. Use Radix Primitives only where accessible composite behavior is needed, such as menus, dialogs, selects, tabs, and tooltips. Keep the visual UI component source in this repository under `apps/studio/src/components/ui/`, following the editable component ownership model popularized by shadcn/ui.

The studio uses one semantic token system and Lucide icons. It does not use Radix Themes, Material UI, or another complete visual system. Server and client feature modules exchange typed DTOs only; no provider, storage, ORM, or secret crosses into client components.

## Consequences

The team owns and tests the small UI component source it adopts, avoiding opaque visual defaults and enabling domain-specific production-tool ergonomics. Tailwind is a build-time dependency, while Radix is limited to behavior primitives, keeping the bundle and design surface focused.

The application must keep Tailwind configuration, design tokens, and UI primitives coherent. Future upstream component changes are intentional source updates, not automatic package upgrades.

## Alternatives considered

- Keep hand-written global CSS: rejected because it already concentrates layout, tokens, and business-specific visuals in one place.
- Use Radix Themes: rejected because it would impose a second visual token system over the studio's own production-tool design.
- Use Material UI or another full component suite: rejected because its visual defaults and component surface add unnecessary lock-in for a focused internal MVP.
