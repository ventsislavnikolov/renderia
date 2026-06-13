---
name: <module-name>
description: Implementation patterns and acceptance rules for the `<module-name>` module. Loaded automatically by Sandcastle when an issue carries `module:<module-name>`.
---

# `<module-name>` module

> Replace every `<placeholder>` and section content with module-specific rules. Keep it short. If a section doesn't apply, delete it — empty sections invite confusion.

## Surfaces (this module owns)

- `src/<module-name>/**`
- `<additional paths>`

## Surfaces this module may touch (read-only or thin glue)

- `<paths>`

## Patterns

- File layout: `<convention>`
- Naming: `<convention>`
- Imports: `<which paths to prefer>`
- State management: `<convention>`
- Errors: `<how this module raises and handles them>`

## Anti-patterns (do NOT do)

- `<thing>` — instead, `<replacement>`
- `<thing>` — instead, `<replacement>`

## Acceptance checklist

Every change to this module must satisfy:

- [ ] Files land in the surfaces listed above (no leakage)
- [ ] New behavior covered by at least one test
- [ ] Tests assert behavior, not implementation
- [ ] No `.skip`, no `@ts-ignore` without justification in the commit body
- [ ] Public API additions documented in `REFERENCE.md`
- [ ] `<module-specific check>`

## Test conventions

- Location: `<path>`
- Naming: `<convention>`
- Mocking strategy: `<convention>`
- What to assert: `<conventions>`

## Commands (this module's feedback loops)

- Test (scoped): `<command>`
- Lint (scoped): `<command>`
- Typecheck (scoped): `<command>`

## Dependencies on other modules

- `<module>`: `<reason>`
- `<module>`: `<reason>`

## Open questions / known gaps

- `<thing to figure out>`
