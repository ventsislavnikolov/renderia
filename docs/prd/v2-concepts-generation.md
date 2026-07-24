# PRD: Concepts & anchor-conditioned generation (v2 · 1 of 4)

> First of the four v2 PRDs produced by the wayfinder map (#130). Introduces the
> **Concept** — a named design direction realized coherently across every angle
> of a Room Set — replacing the hardcoded airy/layered Takes and per-angle
> independence. The conditioning mechanism was validated on a real 2-angle room
> in the spike (#137, go verdict; evidence linked from that ticket). Glossary
> terms (Concept, Direction) are already in `CONTEXT.md`. Depends on nothing;
> the other three v2 PRDs depend on this one.

## Problem Statement

Today every generation produces two hardcoded variations ("airy" and
"layered") regardless of what the user asked for, and each angle of a Room Set
is generated independently — there is no object that says "this is one design,
seen from every angle". The user cannot choose a *direction*, because a
direction does not exist as a thing: favorites live on individual images, angle
renders of the "same" variation can contradict each other, and a "warm and
dark" Style Direction still spends half the run on an airy variation nobody
wanted.

## Solution

A **Concept** is one named design direction for a Task, realized across every
angle of its Room Set from a single brief, and presented, compared, and
favorited as one unit.

- **Two Concepts per run, derived — not hardcoded.** The brief builder derives
  an *adaptive contrast pair* deterministically (no model call): both Concepts
  always honor Style + Style Direction + change intensity; the contrast axis
  defaults to light/airy ↔ warm/layered but switches (e.g. minimal ↔
  texture-rich) when the user's direction pins one end. Each Concept gets a
  human-readable name.
- **Anchor-conditioned coherence (validated).** The Reference Photo's angle
  generates first; every other angle generates with the anchor render supplied
  as an additional reference image on the same `images.edit` call — the exact
  mechanism already used for Furniture Reference Images, no new API surface.
  Cross-angle consistency is part of the Concept promise.
- **History, not supersede.** Regenerating mints new Concepts; prior ones stay,
  each carrying a snapshot of the Direction it was generated from. (Refinement
  lineage via `parent_id` is specified in PRD 3.)
- **Concept-level choice.** "Choose this direction" and favoriting act on the
  Concept; per-image favorites leave the main flow. The compare view shows the
  two Concepts side by side with a per-angle before/after slider against the
  source Photo.

## User Stories

1. As a renovator, I want each result to be a named direction covering all my angles, so that I compare rooms, not loose images.
2. As a renovator, I want both variations to respect my style direction, so that no generation is wasted on a mood I excluded.
3. As a renovator, I want the same furniture and finishes visible from every angle, so that the set reads as one room.
4. As a renovator, I want to choose a direction as a whole, so that my decision is about the room, not a picture.
5. As a renovator, I want past directions kept with what produced them, so that I can revisit why I rejected one.

## Implementation Decisions

* **`concepts` table**: `id`, `owner_id`, `project_id`, `task_id`, `name`,
  `contrast_descriptor`, `direction_snapshot` (JSON: style id, style-direction
  text, intensity, furniture roles, budget range), `parent_id` (nullable
  self-FK, used by PRD 3), `status`, `created_at`. RLS mirrors
  `generated_images`.
* **`generated_images.concept_id`**: nullable FK; legacy rows stay `NULL` and
  render as "Legacy renders" (see PRD 2's migration).
* **Anchor order**: `reference_photo_id`'s angle generates first; remaining
  angles run in parallel, each with `[angle photo, anchor render, ...furniture
  refs]` as the edit-image array plus a CROSS-ANGLE CONSISTENCY prompt block
  (wording per the spike script linked from #137).
* **Takes code path replaced**: `buildConceptVariationPrompts`'s fixed
  airy/layered constants become the contrast-axis derivation in the brief
  builder; the word "take" leaves the codebase (avoided term in `CONTEXT.md`).
* **Call budget** (spec numbers from #141): Quick 2 image calls per run;
  Precise `3P` per full run at `P` angles (P previews + 2P generation).
  Conditioned calls measured ~2× slower than unconditioned — generation UI
  copy and progress must expect it.
* **Concept compare UI**: two Concepts side by side; per-angle before/after
  slider against the source Photo; "Choose this direction" sets the chosen
  Concept on the Task (feeds PRD 4's Concept Pack).

## Testing Decisions

* Highest-seam assertions only (handler in, rows/payload out), fixtures for
  model calls — consistent with prior PRDs.
* **Generation seam**: one run against approved previews creates exactly 2
  `concepts` rows, each with one `generated_images` row per angle, all
  `concept_id`-linked; `direction_snapshot` matches the Direction inputs.
* **Conditioning seam**: the non-anchor generation call receives the anchor
  render in its image array (input wiring assert; visual coherence was the
  spike's job, not unit tests').
* **Contrast-pair seam**: brief-builder unit tests — default axis; pinned-end
  direction flips the axis; names non-empty and distinct.
* **Choice seam**: choosing a Concept persists it on the Task; per-image
  favorite endpoints are removed.

## Out of Scope

* Refinement / Report a problem (PRD 3), Fidelity Check (PRD 3).
* Concept Pack export (PRD 4).
* More than 2 Concepts per run; user-picked contrast axes.
* Any restructuring — `remove` dispositions stay restructure-only (map: out of scope).

## Issue Breakdown (Sandcastle-ready)

1. **Schema — concepts + concept_id** (`module:api`): `concepts` table,
   `generated_images.concept_id`, RLS, types regenerated; existing tests stay
   green with NULL concept_id.
2. **Adaptive contrast pair** (`module:api`): replace Take constants with
   deterministic axis derivation + naming in the brief builder; unit tests per
   the contrast-pair seam.
3. **Anchor-conditioned generation** (`module:api`): anchor-first ordering,
   conditioning image array + prompt block, concepts/images persistence; seam
   tests for generation + conditioning.
4. **Concepts UI** (`module:ui`): concepts view replacing the flat gallery —
   side-by-side compare, per-angle before/after slider, Concept-level choose;
   component tests.
