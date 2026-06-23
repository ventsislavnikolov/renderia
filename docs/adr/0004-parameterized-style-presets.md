# The design prompt is layered into universal fidelity rules, a parameterized Style preset, and a global Take — not hardcoded Scandinavian

Today `buildDesignPrompt` is ~80% hardcoded to a single **Style**: white walls,
"Scandinavian laminate", IKEA/JYSK furniture, "no dark wall colors". The user's
**Style Direction** (`styleRules`) is labelled an "override layer" but is dropped
in *after* those hard rules, so it cannot actually change the aesthetic — only
season it. `CONTEXT.md` describes Renderia as a general "interior renovation
workspace", and the product intent is for the user to pick among several Styles
per Task. The hardcoding contradicts that.

The prompt is therefore split into three independent layers:

1. **Fidelity layer (universal)** — keep windows, doors, walls, radiators, and
   room geometry exactly where the source shows them. Applies under *every*
   Style.
2. **Style layer (parameter)** — a `StylePreset` (`id`, `label`, `palette`,
   `materials`, `furnitureVocabulary`, `windowTreatment`, `negativeStyle`)
   selected per Task. Scandinavian is the carried-over existing content; seven
   further presets (Industrial, Mid-century modern, Japandi, Minimalist, Coastal,
   Rustic, Boho) ship as first-pass vocabularies, refined later against real
   renders.
3. **Take layer (global)** — two contrasting design moods ("airy & minimal",
   "warm & layered") that produce the two variations, independent of both the
   room's function and the Style.

These three axes were previously conflated: the old `VARIATION_CONCEPTS` baked
the Style, fixed room *functions* (variation 0 was always a living room), and the
variation axis into one list — so a kitchen Task could be rendered as a bedroom.
That list is removed; function now comes from `taskTitle`, Style from the preset,
and the variation from the Take.

## Considered Options

- **Parameterized Style presets + deterministic template (chosen)** — the brief
  stays a pure string-builder (no LLM call), now composed from
  fidelity + active `StylePreset` + Take. Adding a Style is one catalogue entry,
  no template surgery. Determinism keeps the existing string-builder unit tests
  meaningful, adds no per-render token cost or latency, and keeps the
  prompt-injection surface small. The cost is up-front authoring: eight presets
  to write, seven of them unvalidated until rendered.
- **Keep Scandinavian hardcoded (status quo)** — rejected: it contradicts the
  general-tool product direction and leaves Style Direction unable to change the
  aesthetic it claims to override.
- **LLM-authored brief (GPT-5.5 writes the image prompt)** — rejected: the task
  is highly constrained (fixed fidelity rules + a fixed Style vocabulary), so a
  template matches or beats a generated prompt while staying deterministic and
  testable; an LLM author adds cost, latency, and non-determinism to every brief,
  and `gpt-image-2` reads the output either way.
- **Build only the seam now, defer the picker** — rejected: the product call was
  to ship user-selectable Styles now, and a multi-Style system can only be
  validated with more than one Style actually reachable.

## Consequences

- A migration adds `renovation_tasks.style text not null default 'scandinavian'`.
  Existing Tasks keep rendering Scandinavian with no backfill.
- The Style is picked in the guided flow's `brief-step`, directly above the Style
  Direction field, where the aesthetic intent already lives.
- Protected elements are passed to `gpt-image-2` as **natural-language** phrases
  ("the tall window on the left wall"), not numeric bounding-box coordinates: in
  edit mode the model sees the photo, and diffusion image models do not localize
  reliably from `bbox left=23.5%` text. The coordinates remain authoritative for
  the UI overlay and the `protected_elements` rows — only the image prompt drops
  them.
- Variations are cut from four to two (one per Take), roughly halving the
  dominant per-run image cost.
- Seven first-pass presets are expected to produce uneven renders until tuned;
  depth (negative instructions, edge cases) is added iteratively per Style, since
  prompt wording cannot be tuned without seeing how `gpt-image-2` reacts to it.
- The migration plus the `StylePreset` catalogue and picker make this **hard to
  reverse** once Tasks carry a non-default Style.
