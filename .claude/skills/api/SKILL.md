---
name: api
description: Implementation patterns and acceptance rules for the `api` module. Loaded automatically by Sandcastle when an issue carries `module:api`.
---

# `api` module

Server functions, business logic, AI provider integration, and database schema.

## Surfaces (this module owns)

- `src/server/**`
- `src/lib/renovation/**` (zod schemas, room-state domain logic)
- `src/lib/ai/**` (provider abstraction, prompts, model catalog)
- `supabase/migrations/**`
- `src/lib/types/database.ts` (generated — regenerate, don't hand-edit)

## Surfaces this module may touch (read-only or thin glue)

- `src/lib/supabase/server.ts` (auth helpers — owned by `auth`)
- Components that call server functions (owned by `ui`)

## Patterns

- Every user-facing export is `createServerFn({ method })` + `.validator(zodSchema)` + a handler that does exactly three things: `readAuthToken()`, `requireAuthedSupabase(...)` → `{ userId, supabase }`, delegate to a pure `__*Handler` function.
- Business logic lives in exported `__*Handler({ userId, supabase, input })` functions — pure, testable with a mocked Supabase client, no TanStack runtime needed.
- Zod schemas live in `src/lib/renovation/schema.ts`; share input types via `z.infer`.
- Supabase errors wrap through `wrapSupabaseError`; every query filters by `owner_id` even though RLS also enforces it.
- Storage objects are accessed via short-lived signed URLs (`SIGNED_URL_TTL_SECONDS`); buckets are private.
- Images sent to the edit API go through `normalizeImageToPng` (sharp is lazily imported — never import it at module scope).
- AI calls go through `getRenovationAiProvider()`; new capabilities are methods on `RenovationAiProvider`, implemented in both `openai-provider.ts` and `mock-provider.ts`.
- Migrations are append-only numbered files; update RLS policies and bucket config in the same migration as the tables they protect.

## Anti-patterns (do NOT do)

- Querying Supabase from components — instead, add a server function.
- Putting logic in the `createServerFn` handler body — instead, extend or add a `__*Handler`.
- Importing native/node-only modules at module scope in `src/server/**` — these files are evaluated by the client bundle; lazy-import inside the handler.
- Returning provider debug payloads unconditionally — instead, use `attachDebugIfDev`.
- Hand-editing `src/lib/types/database.ts` — regenerate from the schema.

## Acceptance checklist

Every change to this module must satisfy:

- [ ] Files land in the surfaces listed above (no leakage)
- [ ] New behavior covered by at least one handler test with mocked Supabase
- [ ] Tests assert behavior, not implementation
- [ ] No `.skip`, no `@ts-ignore` without justification in the commit body
- [ ] New tables/columns ship with RLS policies in the same migration
- [ ] `pnpm typecheck && pnpm lint && pnpm test` pass

## Test conventions

- Location: `tests/unit/server/<file>.test.ts` (mirrors `src/server/`), `tests/unit/ai/`, `tests/unit/renovation/`
- Mocking: build a chainable Supabase stub per table (see `tests/unit/server/room-state.test.ts`); mock the AI provider with `vi.fn()` implementations of the interface
- Assert: returned payload shapes and persisted row contents — never call order

## Commands (this module's feedback loops)

- Test: `pnpm test`
- Lint: `pnpm lint`
- Typecheck: `pnpm typecheck`

## Dependencies on other modules

- `auth`: `requireAuthedSupabase` / `readBearerToken` for user-scoped clients
- `ui`: consumes the server functions; payload types are the contract
