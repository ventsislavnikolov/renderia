# Modules

This file is the source of truth for module boundaries in this project. Every Linear issue should carry one `module:*` label matching a module listed here. Sandcastle dispatches per-module skills based on this label.

## Active modules

| Label | Skill | Surfaces | Owner |
|---|---|---|---|
| `auth` | `.claude/skills/auth/SKILL.md` | `src/routes/sign-in.tsx`, `src/routes/auth*.tsx`, `src/lib/supabase/**`, `src/lib/server-client/auth-headers.ts` | — |
| `api` | `.claude/skills/api/SKILL.md` | `src/server/**`, `src/lib/renovation/**`, `src/lib/ai/**`, `supabase/migrations/**`, `src/lib/types/database.ts` | — |
| `ui` | `.claude/skills/ui/SKILL.md` | `src/components/**`, `src/routes/**`, `src/styles.css`, `src/lib/format.ts`, `src/lib/workspace-context.tsx` | — |
| `infra` | `.claude/skills/infra/SKILL.md` | `.github/workflows/**`, `scripts/**`, `vite.config.ts`, `vitest.config.ts`, `playwright.config.ts`, `package.json`, `.sandcastle/**` | — |

Edit this table as the project evolves. When you add or rename a module:

1. Update the row above (or add a new one)
2. Create the matching label in Linear (`module:<name>`) inside the `module` label group
3. Create `.claude/skills/<name>/SKILL.md` and `REFERENCE.md` (use `.claude/skills/_module-template/SKILL.md` as starter)

## Cross-module work

When an issue spans modules, the issue's `module:*` label is **primary**. Defer to other modules' conventions when touching their surfaces, but the primary module's skill drives the high-level approach.

Example: an `auth` screen needs a new API hook → follow the `api` module's hook patterns for the hook itself, but lay out the screen per `auth` skill.

## Module-skill contract

Every `<module>/SKILL.md` MUST include:

- **Patterns** — accepted file/folder conventions, naming, common imports
- **Boundaries** — what files this module owns vs touches
- **Anti-patterns** — what NOT to do
- **Acceptance checklist** — what every change in this module must satisfy
- **Test conventions** — where tests live, naming, what to assert

`<module>/REFERENCE.md` holds domain context: data shapes, business rules, third-party integrations, vocabulary.
