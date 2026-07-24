# PRD: Fidelity Check & Refinement (v2 · 3 of 4)

> Third v2 PRD from the wayfinder map (#130). Closes the loop after
> generation: an automatic architecture check on every rendered angle, and the
> two user paths that act on results — free-text **Refinement** minting a child
> Concept, and structured **Report a problem**. Depends on PRD 1 (Concepts,
> anchor conditioning) and PRD 2 (flow shell). Glossary: Fidelity Check and
> Refinement are in `CONTEXT.md`.

## Problem Statement

Today a generated image is the end of the road: nothing verifies that a window
didn't drift, and a user who wants "the same but with a different floor" can
only re-run from scratch. The architectural-fidelity promise is enforced by
prompt alone, unmeasured; user dissatisfaction is invisible and unpriced.

## Solution

- **Fidelity Check** (#138): after each angle renders, detection runs on the
  output (Gemini Flash — negligible cost) and is diffed against the source
  Photo's keep-exactly Room Object boxes. Asynchronous, never blocks display.
  Three triggers, thresholds tunable: missing keep-exactly element; invented
  window/door/opening; element center drifted >5% of frame or box IoU <0.5.
  A flagged angle gets a ⚠ **"check this area"** badge, hover highlighting the
  suspect zone — a prompt to look, never an error claim, and never a gate on
  choosing or exporting (the Pack warns when a flagged angle is included).
- **Refinement** (#132): one natural-language instruction applied to a whole
  Concept ("keep everything, but change the floor"). The anchor angle
  regenerates from its current render plus the instruction; remaining angles
  condition on the new anchor. The result is a **new Concept with
  `parent_id`** — history reads as an evolution of directions. No per-image
  edits.
- **Report a problem**: quick structured chips, no text required — moved
  window/door/radiator · wrong scale · wrong or missing must-include furniture
  · angles don't match · not in the chosen style · other. Stored structured
  (the most valuable product data v2 collects).
- **Free regeneration policy**: a check-confirmed flag regenerates that angle
  free (anchor flagged → anchor + affected angles free), capped at 2 free
  attempts per angle per Concept; an unconfirmed report is recorded and grants
  1 goodwill free regeneration per Concept. A paid refinement costs one Concept
  generation (PRD 1's call budget).

## User Stories

1. As a renovator, I want the app to point at areas where architecture may have drifted, so that I check before trusting a render.
2. As a renovator, I want a bad render regenerated free when the app itself confirms the defect, so that model failures don't spend my runs.
3. As a renovator, I want to say "same, but change X" and get a coherent new direction, so that iteration doesn't restart from zero.
4. As a renovator, I want my complaint captured with one tap, so that reporting isn't an essay.
5. As a renovator, I want refined directions linked to their parents, so that I can walk back an evolution.

## Implementation Decisions

* **Check pipeline**: reuse `detectProtectedElements` against the rendered
  image (needs a fetchable URL — the stored output in `generated-outputs`);
  diff by kind + geometry against keep-exactly boxes of that angle's source
  Photo. Store per-image: `fidelity_status` (`ok | flagged | unchecked`),
  `fidelity_flags` JSON (trigger, zone box). Thresholds in one constants
  module.
* **Depends on the `radiator` kind fix** (PRD 2) — triggers key on element
  kinds.
* **Refinement handler**: input = concept id + instruction; loads the parent's
  Direction snapshot, appends the instruction as a refinement layer, runs the
  PRD 1 pipeline with the parent's renders as generation bases; new Concept row
  with `parent_id`.
* **Report handler**: input = concept id (+ optional angle) + chip enum;
  persists a `concept_reports` row (`id`, `owner_id`, `concept_id`,
  `generated_image_id` nullable, `reason` enum-as-text, `created_at`); if the
  angle is check-flagged → free path; else marks the Concept's goodwill regen
  as consumed when used.
* **Caps accounting**: free-regen counters live on the concept/image rows, not
  a billing system (v1 has none, PRD 4 caps runs).
* **UI**: badge + zone overlay in the Concepts view (PRD 1's screen); Refine
  and Report as two distinct actions on a Concept; refinement shows the parent
  chain.

## Testing Decisions

* **Check seam**: fixture detection outputs → flag matrix per trigger
  (missing / invented / drift / IoU), thresholds boundary-tested; status +
  flags rows written; display never blocked on `unchecked`.
* **Free-regen seam**: flagged angle regenerates without consuming a run; 3rd
  attempt on the same angle refuses free; goodwill regen consumable once per
  Concept.
* **Refinement seam**: refining creates a child Concept with `parent_id`, a
  snapshot layering the instruction, and per-angle images; the anchor call's
  image array contains the parent anchor render (wiring assert).
* **Report seam**: chip persists a structured row linked to concept/image; no
  free text required.

## Out of Scope

* Multi-turn refinement chat (one instruction per refinement; history = parent chain).
* Auto-regeneration without user action.
* Fidelity scoring/aggregate quality dashboards (raw flags + reports only).

## Issue Breakdown (Sandcastle-ready)

1. **Fidelity pipeline** (`module:api`): post-render detection diff, status +
   flags persistence, threshold constants; seam tests.
2. **Fidelity UI** (`module:ui`): badge + hover zone in Concepts view, Pack
   warning hook; component tests.
3. **Refinement** (`module:api` + `module:ui`): handler with parent lineage +
   Refine action UI with parent chain display.
4. **Report a problem + free regen** (`module:api` + `module:ui`):
   `concept_reports`, chips UI, free/goodwill regeneration accounting.
