# PRD: v2 flow shell — Quick & Precise (v2 · 2 of 4)

> Second v2 PRD from the wayfinder map (#130). Collapses the six-step wizard
> into two modes over four steps, replaces the technical Review with
> human-language Decisions chips, moves all design inputs into one Direction
> screen, and executes the hard cutover (kill list + legacy data). Depends on
> PRD 1 (Concepts) for the generation target. Glossary: Direction is in
> `CONTEXT.md`.

## Problem Statement

The current flow asks for six steps of work before any value: photos, a
technical review of bounding boxes with x/y/width/height inputs, per-angle
preview approvals, a read-only "Room" recap, a raw-Markdown Brief, and only
then generation — with furniture picked at the last moment and a model picker
nobody should see. Casual users never reach the first render; the Style rules
also force decisions the user didn't take (always a new floor, full
refurnishing).

## Solution

**Mode is Task state, not a type.** Every Task starts **Quick**; adding a
second photo upgrades it in place to **Precise**, inheriting all defaults and
keeping prior Concepts in history.

- **Quick: Upload → Direction → Concepts** (3 screens). One photo; detection
  runs silently during Direction; every detected element defaults to "keep
  exactly"; no Decisions screen, no Structural Preview gate.
- **Precise: Upload (1–4) → Decisions → Direction → Concepts.** Structural
  Previews generate in the background while the user fills Decisions and are
  approved as cards inside that screen, interrupting only on problems.
- **Decisions = on-photo chips** (prototype-picked, #134): one pill per Room
  Object anchored on the photo ("Window · Keep"); tap toggles Keep exactly ↔
  Can be restyled; boxes, drag-editing, and manual add live only behind an
  "Advanced accuracy" toggle; a standing note says everything without a chip is
  free to change.
- **Direction** (#135): visual Style cards (8 presets, image + one-liner);
  free-text Style Direction re-seeded on Style change; change intensity
  Refresh / Makeover / Full renovation (default Makeover — Styles stop forcing
  floors); Furniture Library picks moved here with **Must include / If it
  fits** and **I own this / To buy** tags; optional budget range (Pack-only);
  ends with a structured summary (style / keep / change / furniture) before
  Generate. The full brief is assembled invisibly and stored as a technical
  log.
- **Upload coach** (#143): static capture tips + client-side checks (min
  resolution, darkness, blur); hard failures block (unreadable, type, size,
  <1024px long side), everything else warns with "continue anyway"; zero
  detected elements later warns too. Precise adds a coverage tip and the
  add-more-angles nudge after first results.
- **Hard cutover** (#140): no parallel flow, no feature flag.

## User Stories

1. As a renovator, I want a first concept from one photo with almost no questions, so that I see value before investing effort.
2. As a renovator, I want to add angles after the first result, so that depth is an upgrade, not an entry toll.
3. As a renovator, I want to mark what stays in plain words on the photo itself, so that I never see coordinates or confidence values.
4. As a renovator, I want all design choices on one screen with a final summary, so that I know exactly what will be generated before spending a run.
5. As a renovator, I want my chosen intensity respected, so that a refresh doesn't repaint my floor.
6. As a renovator, I want my old tasks and renders still visible after the redesign, so that nothing I made disappears.

## Implementation Decisions

* **`renovation_tasks.mode`**: `"quick" | "precise"`, default `quick`, mutable;
  flips to `precise` when a second Photo joins the Room Set. Existing Tasks
  backfill by photo count (1 → quick, 2+ → precise).
* **Quick defaults**: silent detection on upload completion; all Room Objects
  `exact_preserve`; no preview gate — generation runs directly against the
  source photo (accepted risk; Fidelity Check in PRD 3 is the net).
* **Precise previews**: unchanged preview machinery, triggered in background
  when Decisions opens; approval cards embedded in the Decisions screen;
  approval gate per angle retained.
* **Furniture roles**: `task_furniture` gains `must_include boolean` and
  `owned boolean` (both default false). Must-include items are mandatory in the
  prompt; owned items price as 0 in PRD 4's budget estimate.
* **Budget range**: `budget_min`/`budget_max` on the Direction snapshot (stored
  with the Concept, PRD 1) — not a constraint on generation.
* **Kill list** (delete outright): Brief screen, user-facing model picker,
  standalone Preview step, read-only Room step, unwired
  `suggestTasksForProject`. `design_briefs` stays as the technical log; debug
  panel dev-only.
* **Legacy data**: old `generated_images` render as "Legacy renders"
  (`concept_id NULL`) in Task history; no backfill.
* **Detection vocabulary fix**: the detection schema's `kind` set must name
  `radiator` explicitly (today it falls out as `other`) — shared requirement
  with PRD 3's triggers.

## Testing Decisions

* **Mode seam**: creating a Task persists `quick`; adding a second photo flips
  to `precise` and opens Decisions with inherited keep-exactly choices; prior
  Concepts remain queryable.
* **Quick-path seam**: with one photo and no user decisions, generation input
  equals silent-defaults brief (byte-comparable fixture).
* **Decisions seam**: chip toggle persists `preservation_mode`; advanced-only
  editing still round-trips boxes as today.
* **Direction seam**: style switch re-seeds direction text; summary block
  reflects exactly the persisted Direction snapshot; furniture role tags
  persist.
* **Coach seam**: sub-1024px upload rejected with the coach message; dark/blurry
  accepted with a recorded warning.
* Component tests for Decisions chips, Direction cards, and the upgrade nudge.

## Out of Scope

* Dimension inputs of any kind (assumption text lives in PRD 4's Pack).
* Room-inventory keep/replace of detected furniture (deferred, #135).
* Exterior Tasks, Restructure (map: out of scope).

## Issue Breakdown (Sandcastle-ready)

1. **Mode + schema** (`module:api`): `renovation_tasks.mode`, task_furniture
   role columns, backfill, detection-kind `radiator` fix.
2. **Quick flow** (`module:ui`): 3-screen shell, silent detection defaults,
   upgrade nudge + in-place mode flip.
3. **Decisions screen** (`module:ui`): on-photo chips, advanced-accuracy
   toggle reusing today's box editor, embedded background-preview approval.
4. **Direction screen** (`module:ui`): style cards + re-seeded direction text,
   intensity, furniture picker with role tags, budget range, summary block;
   invisible brief assembly (`module:api` seam).
5. **Cutover** (`module:ui` + `module:api`): delete kill-list surfaces, legacy
   renders section, remove per-image favorites.
