# PRD: Restructure Suggestions (interior & exterior)

> Adds AI-proposed **structural** change suggestions — the first capability that
> alters architecture rather than preserving it — and extends the workspace to
> **Exterior Tasks**. Cross-angle coherence approach recorded in
> `docs/adr/0005-anchor-conditioned-restructuring.md`; the deliberate "no
> structural validation" stance in `docs/adr/0006-no-structural-validation.md`.
> New/updated glossary terms (Restructure Suggestion, Structural Addition,
> Exterior Task, broadened Room Set / Room Object / Appearance / Structural
> Preview / Reference Photo) are in `CONTEXT.md`.

## Problem Statement

Today the workspace only ever *preserves* architecture. A Task is a room, its
Room Objects are kept exactly or restyled in place, and the universal
architectural-fidelity rules forbid moving a wall, opening a doorway, or adding a
window. That is the right default for a faithful restyle — but it means the tool
can't answer the question renovators actually ask first: *"what could this space
become if I changed it?"* Removing the wall to the kitchen, adding a south-facing
window, putting a dormer in the roof — these are the high-value renovation
decisions, and the app is silent on all of them.

Two gaps follow. First, there is no way to see a *structural* change rendered on
your own photos — only cosmetic restyles. Second, the whole product is
interior-only: a property's outside (facade, roof, garden) has nowhere to live,
even though "restructure the outside" is exactly as common a question as "restyle
the inside".

I want the app to look at a room or a facade, **propose** concrete structural
changes, and render the one I pick — photoreal, on my own photos, coherent across
every angle — without pretending it's engineering advice and without breaking the
faithful-restyle flow that already works.

## Solution

A new **optional** step, **Restructure**, sits between Preview and Room. After
the faithful Structural Previews exist, the app analyses the Room Set and
proposes a ranked menu of **Restructure Suggestions**. The user can **skip**
(the flow is unchanged — today's faithful behaviour) or **pick one**, which mints
a new structural base that the rest of the flow (Room → Brief → Generate) runs
against.

- **AI proposes; the user picks.** The analysis step surfaces concrete
  suggestions ("open the wall to the kitchen", "add a window on the south wall",
  "widen the doorway") each with a one-line rationale. The user selects **one**
  (v1) to realise.
- **A suggestion decomposes into two primitives only.** Removing a Room Object
  (its new `remove` disposition) and adding a **Structural Addition** (a new
  window/dormer/doorway/wall). An in-place change like "widen the doorway" is
  *remove the old doorway + add a wider one* — there is no edit-in-place.
- **The change re-anchors fidelity, it doesn't discard it.** Realising a
  suggestion produces a **restructured Structural Preview** as the new base; the
  existing preserve-and-style layer then runs *faithfully against that new base*.
  Walls don't drift afterwards — they were changed once, deliberately, at the
  base.
- **Coherent across angles.** The change is realised first on the **Reference
  Photo** (the anchor), then the other angles' restructured previews are
  conditioned on that anchor result so the whole Room Set agrees on the new
  architecture (ADR 0005).
- **Exterior Tasks.** A Task is marked interior or exterior at creation. Exterior
  reuses the entire pipeline — Room Set, Appearances, Room Objects, Structural
  Previews, Restructure — with an exterior detection vocabulary (roof, gutter,
  render, fence, chimney…) and exterior fidelity rules. Same property's inside and
  outside are separate Tasks under one Project.
- **Concept, not engineering advice.** Suggestions are not feasibility-checked;
  every one carries a "concept only — confirm with a professional" disclaimer
  (ADR 0006).

The faithful flow is untouched when Restructure is skipped: no new mandatory
gates, no behaviour change for existing Tasks.

## User Stories

1. As a renovator, I want the app to suggest structural changes to a room, so that I see renovation options I hadn't framed myself.
2. As a renovator, I want each suggestion explained in a line, so that I understand *why* it's proposed before spending a render on it.
3. As a renovator, I want to pick one suggestion and see it rendered on my own photos, so that the change is concrete, not abstract.
4. As a renovator, I want the rendered change to look consistent across every angle of the room, so that the set still describes one coherent space.
5. As a renovator, I want to skip restructuring entirely, so that a plain faithful restyle still works exactly as before.
6. As a renovator, I want the restructured result to then be styled like any other design, so that I see the new structure *and* a finished look together.
7. As a renovator, I want to compare a couple of structural ideas, so that I can decide between them — by rendering them as separate options.
8. As a renovator, I want to create an Exterior Task for the outside of a property, so that I can restructure the facade and garden the same way I do a room.
9. As a renovator, I want exterior suggestions in exterior language (roof, render, gutters), so that the proposals fit what I'm actually looking at.
10. As a renovator, I want a clear "concept only — verify with a professional" note on every suggestion, so that I never mistake a render for a structural guarantee.
11. As a renovator, I want my existing rooms and renders to keep working unchanged, so that nothing I already made is affected by this feature.

## Implementation Decisions

* **Task scope.** Add a dedicated `scope: "interior" | "exterior"` column to
  `renovation_tasks` (default `interior`) rather than overloading the existing
  free-text `category` (which today defaults to `"general"` and reads as a
  room-type label). Scope is chosen at Task creation and is **immutable once the
  Room Set has photos**, because detection vocabulary and fidelity rules branch on
  it. Existing Tasks backfill to `interior`.
* **Removal disposition.** Extend `room_objects.preservation_mode` to
  `"exact_preserve" | "keep_type_restyle" | "remove"`. `remove` is only ever set
  as part of realising a suggestion, never in the normal Review step.
* **Structural Addition entity.** New `structural_additions` table:
  `id`, `owner_id`, `project_id`, `task_id`, `restructure_suggestion_id`
  (FK, cascade), `kind` (text — window/dormer/doorway/wall…), `label`,
  `placement` (text/JSON describing where, relative to the anchor view),
  `created_at`. An Addition has no source Appearance — it is the "add" half of the
  remove/add pair.
* **Restructure Suggestion entity.** New `restructure_suggestions` table:
  `id`, `owner_id`, `project_id`, `task_id`, `title`, `rationale`,
  `status` (`proposed | selected | rendered | failed`), `source` (`ai`),
  `created_at`. Its removal primitives are a normalized child
  `restructure_suggestion_removals` (`suggestion_id`, `room_object_id`); its
  additions are the `structural_additions` rows that point back to it. Normalized
  child tables follow the precedent in ADR 0001.
* **Restructured base reuses `structural_previews`.** Add a nullable
  `restructure_suggestion_id` FK to `structural_previews`. Faithful previews keep
  it `NULL`; a restructured preview points to the suggestion it realises. This
  reuses the per-photo preview machinery wholesale — `room_state_snapshot`,
  `status`, `approved_at`, the approval gate — for free. The "new base" is the set
  of restructured previews (one per Photo) for the selected suggestion.
* **Anchor-conditioned realisation (the risk; spike first).** The Reference
  Photo's restructured preview is generated first via the existing structural
  image-edit call, with the suggestion's remove/add primitives folded into the
  prompt. Each non-anchor angle is then generated with the **anchor restructured
  image supplied as an additional reference** so it matches the new structure.
  This is ADR 0005's flagged unknown — **validate it on a real multi-angle room
  before building the surrounding UI**; documented fallback is a single-angle MVP
  (anchor only, other angles left faithful) if conditioning can't be made
  coherent.
* **One suggestion per render (v1).** A Task carries at most one *selected*
  suggestion at a time. Picking a different suggestion supersedes the previous
  selection (its restructured previews are discarded/regenerated). Comparing ideas
  = render them as separate selections. No stacking of multiple suggestions onto
  one base in v1.
* **Generation source switch.** Per-angle generation already runs against
  approved Structural Previews; when a suggestion is selected, it runs against the
  *restructured* approved previews instead of the faithful ones. The model
  contract is otherwise unchanged.
* **Detection vocabulary by scope.** The Appearance/Room Object detection prompt
  branches on `scope`: interior kinds (window, door, wall, radiator…) vs a v1
  exterior kind set (roof, gutter, render/cladding, fence, chimney, garage door,
  external door, window). `kind` stays a free-text column — no DB enum — so the
  vocabulary is prompt-governed and extendable without migration.
* **Fidelity rules by scope.** The universal "keep where they are" rules gain an
  exterior variant (keep roofline, eaves, openings, boundary) applied to Exterior
  Tasks. These remain *universal under styling* — only a Restructure Suggestion
  overrides them, and only at the base.
* **Disclaimer.** A fixed "Concept only — confirm structural feasibility with a
  professional" caveat renders on the suggestion menu, on each restructured
  render, and is carried into any export. Copy lives in one constant; the
  suggestion-generation prompt makes no feasibility claim.
* **Glossary.** Restructure Suggestion, Structural Addition, Exterior Task (new);
  Room Set, Room Object, Appearance, Structural Preview, Reference Photo
  (broadened) — all as defined in `CONTEXT.md`.

## Testing Decisions

* Assert external behaviour at the highest existing seam — handler in, rows /
  payload out — never internal call order or private helpers (consistent with the
  furniture PRDs).
* **Scope handler seam**: creating an Exterior Task persists `scope = exterior`;
  scope is rejected on change once the Room Set has photos; existing Tasks read
  back as `interior`.
* **Suggestion-analysis seam**: the analysis handler, with detection input
  injected (fixtures, no model call), returns ranked suggestions whose primitives
  reference only Room Objects in the Task; exterior input yields exterior-kind
  suggestions.
* **Realisation seam**: selecting a suggestion sets the targeted Room Objects to
  `remove`, creates the `structural_additions`, and produces one restructured
  `structural_preview` per Photo linked to the suggestion; selecting a different
  suggestion supersedes the prior selection's previews.
* **Generation source seam**: with a selected suggestion, per-angle generation
  reads the restructured approved previews; with none, it reads the faithful ones
  (behaviour unchanged).
* **Anchor-conditioning seam**: the non-anchor realisation call receives the
  anchor restructured image as a reference input (assert the input wiring; the
  visual coherence itself is validated in the spike, not unit tests).
* **Skip path**: a Task that skips Restructure produces byte-for-byte the same
  Brief/Generate inputs as before the feature.
* No new live-fetch / live-model tests — consistent with prior PRDs; the model
  edit calls stay injected with fixtures.

## Out of Scope

* **Stacking multiple suggestions** onto one base (remove wall *and* add window in
  a single render). v1 is one-at-a-time; deferred to v2.
* **User-authored structural changes** (free-text "remove the wall on the left").
  v1 is AI-proposed only; a structural "Style Direction" is a separate future
  idea.
* **Structural / feasibility validation** of any kind — load-bearing detection,
  code compliance, cost. Deliberate and permanent for this feature (ADR 0006).
* **Editing a suggestion's primitives** by hand before rendering (toggling
  individual removes/adds). v1 realises a suggestion as proposed.
* **Garden / landscape generation** beyond the facade structure (planting,
  hardscape design) — exterior v1 is structural, not landscaping.
* **Changing a Task's scope** after photos exist (would require re-detection).

## Issue Breakdown (Sandcastle-ready)

Each is intended to fit one autonomous iteration; ordered by dependency. The
spike is first because it gates the whole feature's viability.

0. **Spike — anchor-conditioned coherence** (timeboxed, throwaway): on a real
   multi-angle room, realise one structural change on the Reference Photo and
   condition 1–2 other angles on it. Decide go (anchor-conditioned) vs fallback
   (single-angle MVP). Output is a decision note appended to ADR 0005, not
   production code.
1. **Schema + scope**: add `renovation_tasks.scope` (default `interior`, backfill);
   extend `room_objects.preservation_mode` with `remove`; add
   `structural_additions`, `restructure_suggestions`,
   `restructure_suggestion_removals`; add
   `structural_previews.restructure_suggestion_id`. RLS + handler reads updated so
   existing behaviour and tests stay green.
2. **Exterior detection vocabulary**: branch the detection prompt and fidelity
   rules on `scope`; Exterior Task creation + the scope-immutability rule. Tests
   for exterior-kind detection and scope persistence.
3. **Suggestion analysis**: the AI proposal step — analyse the Room Set, emit
   ranked `restructure_suggestions` with primitives. Analysis-seam tests
   (fixtures).
4. **Realisation + restructured base**: select-suggestion handler (set removes,
   create additions, generate restructured previews anchor-first with
   conditioning), supersede-on-reselect. Realisation + generation-source seam
   tests.
5. **Restructure step UI**: the optional step between Preview and Room — suggestion
   menu with rationales + disclaimer, skip, pick-one, restructured-preview review.
   Component tests (renders suggestions, disclaimer present, skip leaves flow
   unchanged).

## Further Notes

* The feature is additive and gated behind one optional step; the faithful flow
  and every existing Task are unaffected when Restructure is skipped.
* Reusing `structural_previews` for the restructured base is the key leverage:
  approval, per-angle storage, and `room_state_snapshot` all come for free, and
  per-angle generation already consumes approved previews.
* `reference_photo_id` — left "vestigial for generation" by ADR 0002 — regains a
  load-bearing role here as the restructure anchor.
* If the spike fails, ship issue list 1–5 with the single-angle MVP realisation;
  the schema and UI are unchanged, only step 4's conditioning is dropped.
