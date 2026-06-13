---
name: auth
description: Implementation patterns and acceptance rules for the `auth` module. Loaded automatically by Sandcastle when an issue carries `module:auth`.
---

# `auth` module

Supabase Auth integration: session flows and the bearer-token bridge between client and server functions.

## Surfaces (this module owns)

- `src/routes/sign-in.tsx`, `src/routes/auth.tsx`, `src/routes/auth_.callback.tsx`
- `src/lib/supabase/browser.ts`, `src/lib/supabase/server.ts`
- `src/lib/server-client/auth-headers.ts`

## Patterns

- Client → server auth is a bearer token: `getAuthHeaders()` reads the Supabase session and produces the `authorization` header; server functions resolve it with `readBearerToken` + `requireAuthedSupabase`, returning a user-scoped client so RLS evaluates as the caller.
- Route protection lives once, in the `_app` layout `beforeLoad` (session check → redirect to `/sign-in`). Don't duplicate guards per route.
- Components map `UNAUTHENTICATED_ERROR` to a redirect — keep that error message a stable contract.

## Anti-patterns (do NOT do)

- Using the service-role key in request paths — `requireAuthedSupabase` exists so RLS stays the enforcement layer.
- Storing tokens anywhere except the Supabase client's own session handling.
- Per-route session checks — instead, rely on the `_app` guard.

## Acceptance checklist

Every change to this module must satisfy:

- [ ] RLS remains the enforcement layer (no service-role shortcuts in user paths)
- [ ] Sign-in, callback, and sign-out flows still round-trip locally
- [ ] Auth helper changes covered in `tests/unit/server/auth.test.ts`
- [ ] `pnpm typecheck && pnpm lint && pnpm test` pass

## Test conventions

- Location: `tests/unit/server/auth.test.ts`
- Assert: token parsing, rejection of missing/invalid tokens, user scoping

## Commands (this module's feedback loops)

- Test: `pnpm test`
- Lint: `pnpm lint`
- Typecheck: `pnpm typecheck`

## Dependencies on other modules

- `api`: every server function consumes `requireAuthedSupabase`
- `ui`: consumes `getAuthHeaders` / `UNAUTHENTICATED_ERROR`
