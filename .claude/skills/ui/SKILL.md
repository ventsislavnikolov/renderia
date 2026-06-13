---
name: ui
description: Implementation patterns and acceptance rules for the `ui` module. Loaded automatically by Sandcastle when an issue carries `module:ui`.
---

# `ui` module

React 19 components, TanStack Router routes, and presentation logic.

## Surfaces (this module owns)

- `src/components/**` (`ui/` holds shadcn-style primitives; feature dirs like `guided/`, `projects/`, `favorites/`, `layout/`)
- `src/routes/**` (file-based routes; `routeTree.gen.ts` is generated — never hand-edit)
- `src/styles.css`, `src/lib/format.ts`, `src/lib/workspace-context.tsx`

## Surfaces this module may touch (read-only or thin glue)

- Server function imports from `src/server/**` (owned by `api`)
- `src/lib/server-client/auth-headers.ts` (owned by `auth`)

## Patterns

- Routes are thin: `createFileRoute` + a component import; authenticated pages live under the pathless `_app` layout with `ssr: false`. The route tree regenerates on `pnpm build`/`vite dev`.
- Data fetching: direct `await serverFn({ data, headers })` in effects/handlers — no TanStack Query. Always `const headers = await getAuthHeaders()` first.
- Every async component follows the trio: skeleton loading state, `role="alert"` error state, explicit empty state.
- Unauthenticated errors: `if (caught.message === UNAUTHENTICATED_ERROR) window.location.assign("/sign-in")`.
- Effects guard against unmount with a `cancelledRef`; user mutations flip state optimistically and revert on error.
- Styling: Tailwind with the project tokens (`surface`, `ink-muted`, `ink-subtle`, `border`, `gold`, `warning`); `cn()` for conditional classes; lucide icons.
- Accessibility: `aria-pressed` on toggles, `aria-label` on icon-only buttons, `sr-only` live regions for announcements.
- Formatter sorts JSX props alphabetically (ultracite) — write them sorted to avoid churn.

## Anti-patterns (do NOT do)

- Calling `supabaseBrowser.from(...)` for app data — instead, add/use a server function (storage upload + auth are the exceptions).
- Editing `routeTree.gen.ts` — instead, add a route file and rebuild.
- Inventing new color/spacing values — instead, use the existing token classes.
- Module-scope imports of server-only packages in files reachable from components.

## Acceptance checklist

Every change to this module must satisfy:

- [ ] Files land in the surfaces listed above (no leakage)
- [ ] Loading, error, and empty states exist for any new async UI
- [ ] Keyboard/screen-reader basics: labels, roles, focus states
- [ ] Component test covers render + key states where the component owns logic
- [ ] `pnpm typecheck && pnpm lint && pnpm test` pass

## Test conventions

- Location: `tests/unit/components/`, `tests/unit/routes/`
- Mocking: mock server functions with `vi.mock` of the `src/server/*` module; MSW for network-level cases
- Assert: rendered behavior (text, roles, interactions) — not internal state

## Commands (this module's feedback loops)

- Test: `pnpm test`
- Lint: `pnpm lint`
- Typecheck: `pnpm typecheck`

## Dependencies on other modules

- `api`: server functions and payload types are the data contract
- `auth`: `getAuthHeaders` / `UNAUTHENTICATED_ERROR` for every call
