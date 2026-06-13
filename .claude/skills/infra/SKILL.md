---
name: infra
description: Implementation patterns and acceptance rules for the `infra` module. Loaded automatically by Sandcastle when an issue carries `module:infra`.
---

# `infra` module

Build, CI/CD, tooling, and the Sandcastle agent harness.

## Surfaces (this module owns)

- `.github/workflows/**`
- `scripts/**`
- `vite.config.ts`, `vitest.config.ts`, `playwright.config.ts`
- `package.json`, `pnpm-workspace.yaml`, `biome.json`, `tsconfig.json`
- `.sandcastle/**` (Dockerfile, prompts, loop config — `.env` is git-ignored, never commit it)

## Patterns

- Package manager is pnpm; releases are semantic-release on main (`chore(release): x.y.z [skip ci]` commits land remotely — `git pull --rebase` before push).
- Quality gates run as hooks: pre-commit = ultracite check + commitlint; pre-push = typecheck + tests + build. Don't bypass with `--no-verify`.
- Commits follow `<type>(<scope>): <subject>` conventional format, subject ≤ 50 chars, imperative.
- Native dependencies (e.g. sharp) must stay out of the client bundle — lazy-import server-side; verify with a build + grep of `.output/public/assets`.

## Anti-patterns (do NOT do)

- Committing secrets — `.sandcastle/.env` and `.env*` are ignored for a reason.
- Pinning versions ad hoc in one place while the lockfile says otherwise — change `package.json` and let pnpm update the lockfile.
- Editing generated outputs (`.output/**`, `routeTree.gen.ts`, `src/lib/types/database.ts`).

## Acceptance checklist

Every change to this module must satisfy:

- [ ] `pnpm build` succeeds locally
- [ ] Hooks still pass end-to-end (commit + push dry run)
- [ ] No secrets in the diff
- [ ] CI workflow changes validated against the workflow syntax

## Commands (this module's feedback loops)

- Build: `pnpm build`
- Test: `pnpm test`
- E2E: `pnpm test:e2e:chromium`

## Dependencies on other modules

- All modules: this module owns their feedback loops
