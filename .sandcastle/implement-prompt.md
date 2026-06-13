# INPUTS

You are running inside a Sandcastle iteration. The Linear MCP server is available.

- Linear team: `ventsislavnikolov`
- Linear project: matches this repo's name
- Autonomy label: `Sandcastle`
- Done state env: `LINEAR_DONE_STATE` (default `Done`)

## Recent SANDCASTLE commits (last 10)

!`git log --grep=SANDCASTLE -n 10 --format='%H%n%ad%n%B---' --date=short 2>/dev/null || echo "No SANDCASTLE commits yet."`

# FETCH WORK

Use Linear MCP only. No CLI.

1. Resolve the Linear project by repo name (`!`basename "$PWD"`).
2. List milestones for the project, sorted by target date ascending.
3. List issues filtered by:
   - project = resolved id
   - labels include `Sandcastle`
   - state.type ∈ {`triage`, `backlog`, `unstarted`, `started`}
   - parent is null (top-level only)
   - exclude any issue whose labels include `blocked`

If zero match, output `<promise>NO MORE TASKS</promise>` and stop.

# TASK SELECTION

1. **Earliest unfinished milestone first** (lowest target date).
2. **Priority order within that milestone** (from the `type` label group):
   1. `bug` — critical bugfixes
   2. `task` — dev infrastructure (tests, types, dev scripts). Prerequisite to features.
   3. `tracer` — tracer bullets. A thin end-to-end slice through every layer to validate architecture before fan-out.
   4. `improvement` — polish and quick wins
   5. `feature` — new features
3. **Tie-break** by Linear's native `priority` field: `Urgent > High > Medium > Low > No priority`.
4. **Sub-issue walk**: if the selected issue has open sub-issues, recurse — pick the first open sub-issue and apply the same rules. The sub-issue is your actual task; the parent stays open until all sub-issues close.
5. **Never pick `blocked`.**

# EXPLORATION

Explore the repo with Glob and Grep. Do NOT read or traverse `node_modules/`, `.next/`, `.expo/`, `ios/`, `android/`, `dist/`, `build/`, `coverage/`, `.sandcastle/logs/`.

# MODULE DISPATCH

1. Inspect the task's labels. Find the one in the `module` group.
2. Read `.claude/skills/<module>/SKILL.md`.
3. Read `.claude/skills/<module>/REFERENCE.md` for domain context.
4. Follow the module skill's implementation patterns and acceptance checklist.

If the issue has no `module` label, use the generic flow below.

If the work spans modules, treat the task's `module` label as PRIMARY. Defer to other modules' conventions when touching their surfaces (e.g. an `auth` screen needing a new API hook → follow `api` patterns for the hook).

# IMPLEMENTATION

Before writing code:

1. Invoke `superpowers:test-driven-development`. Follow it strictly.
2. Red → green → refactor. **One test, one implementation at a time.** Never write multiple tests up front.
3. For `tracer` tasks: thin vertical slice through every layer. Don't widen until the slice is green end-to-end.

Complete the task as scoped. Do not expand scope. Do not refactor unrelated code.

# FEEDBACK LOOPS (mandatory pre-commit)

Run all three. Replace these commands with your project's:

- `pnpm test`
- `pnpm lint`
- `pnpm typecheck`

If any fails → invoke `superpowers:systematic-debugging`, fix, re-run. Do not commit until all three are green.

# PRE-COMMIT VERIFICATION

Invoke `superpowers:verification-before-completion`. Confirm:
- Acceptance criteria met
- No regressions introduced
- All feedback loops green
- Files changed are exactly the files this task should touch

# COMMIT

Format:

```
<type>(<scope>): <subject> (<LINEAR-ID>)

<short why>

Decisions:
- ...

Files:
- ...

Blockers (for next iteration):
- ... (or "none")

SANDCASTLE
```

- `<type>`: feat | fix | docs | refactor | test | chore | perf
- `<scope>`: module name when applicable
- `<subject>`: imperative, ≤ 50 chars, no trailing period
- `<LINEAR-ID>`: e.g. `ABC-123` — Linear auto-links it
- `SANDCASTLE` body marker is **required** for `git log --grep=SANDCASTLE` continuity across iterations.

# CLOSE THE ISSUE

Use Linear MCP:

- If task is complete: add a comment "Completed by Sandcastle" and move the issue to `LINEAR_DONE_STATE` (default `Done`). If the closed issue is a sub-issue and ALL sibling sub-issues are also Done, move the parent to Done too.
- If task is incomplete: add a comment summarizing what was done, what remains, and any blockers. Do not change state.

# RULES

- **One task per iteration.** Never combine multiple issues.
- **No scope expansion.** Stick to the issue's acceptance criteria.
- **No refactors of unrelated code.** Park them as new Linear issues with `improvement` label if worth doing.
- **Never modify another sub-issue's scope** — if you spot a problem there, comment on its issue.
- **Never disable feedback loops** to ship. If a test or typecheck fails, fix it or revert.
