# PRD: Concept Pack, funnel metrics & caps (v2 · 4 of 4)

> Fourth v2 PRD from the wayfinder map (#130). Delivers the product's exit
> artifact — the **Concept Pack** a homeowner hands to a contractor — plus the
> funnel instrumentation that measures whether v2 works, and the soft spend
> caps. Depends on PRDs 1–3 (chosen Concept, fidelity flags, furniture roles,
> budget range). Glossary: Concept Pack is in `CONTEXT.md`. Competitive
> grounding: `docs/research/0001-competitor-landscape.md` — the Pack + coherent
> Concepts chain is the open differentiation.

## Problem Statement

Today the flow ends at a favorite button: there is no artifact that leaves the
app. For the target customer — a homeowner making a real renovation decision —
the missing half is exactly the deliverable: what stays, what changes, what to
buy for how much, what to ask the contractor. Meanwhile nothing measures where
users drop off, and nothing guards API spend.

## Solution

- **Concept Pack** (#133): generated from a Task's chosen Concept as a
  **visual-first** document — chosen direction summary (style, direction,
  intensity) → per-angle before/after sliders → what stays / what changes →
  product list with prices (owned Furniture Items at 0, ★ must-include, Source
  Links) totaled against the optional budget range ("within budget / over by
  X") → assumptions & unknown measurements (incl. "verify sizes before buying")
  → questions for the contractor → concept-only disclaimer with provenance.
  Delivered as a **read-only share link** (no account needed to view) with a
  **PDF download** from it; one template. Prototype (approved): linked from
  #133.
- **Funnel metrics** (#139): 12 canonical events emitted server-side where
  possible into **PostHog** (EU cloud, free tier); Vercel Analytics stays for
  page traffic. Baseline for 2–4 weeks before setting targets; **North Star: %
  of started Tasks that export a Concept Pack**.
- **Soft caps** (#141): 10 Concept runs per user per day, 20 per Task lifetime,
  env-configurable; hitting a cap shows a plain "come back tomorrow" message;
  nothing economy-related is user-visible before that. Every run logs its true
  cost (calls × model).

## User Stories

1. As a renovator, I want a document with my chosen direction, shopping list, and budget, so that I walk to a contractor with a plan, not a picture.
2. As a renovator, I want to share a read-only link with my partner or contractor, so that they see it without an account.
3. As a renovator, I want honest assumptions listed, so that I know what to verify before spending money.
4. As a renovator, I want a PDF for print or email, so that the plan works offline too.
5. As the product owner, I want funnel events and one North Star, so that v2's success is measured, not felt.
6. As the product owner, I want spend guard-rails, so that a runaway loop can't produce an unbounded API bill.

## Implementation Decisions

* **`concept_packs` table**: `id`, `owner_id`, `project_id`, `task_id`,
  `concept_id`, `share_token` (unguessable), `snapshot` (JSON of everything the
  template renders — products with import-time prices, decisions, assumptions,
  budget math), `created_at`. The snapshot freezes the Pack: later Library or
  Concept changes don't mutate a shared document.
* **Share route**: public read-only page keyed by `share_token` (no auth);
  noindex; revocable by deleting the pack row. PDF is generated from the same
  template (print stylesheet / server render — implementer's choice, one
  template is the requirement).
* **Budget math**: sum of to-buy items' snapshot prices; owned = 0; compared
  against the Direction's budget range; "labour/paint not included" note fixed
  in the template.
* **Fidelity warning hook** (PRD 3): including a flagged angle adds the Pack's
  warning line.
* **Assumptions block**: auto-lines — no measurements provided (always in v1,
  per #143), prices are import-time snapshots, concept-only disclaimer (same
  constant as everywhere).
* **Contractor questions**: template-assembled from decisions (walls repaint,
  floor untouched under Makeover, electrical for new lighting, ladder/radiator
  repaint options) — deterministic, no model call in v1.
* **PostHog**: server-side capture with the 12-event set from #139
  (`task_created(mode)` … `pack_shared`, `pdf_downloaded`,
  `quick_upgraded_to_precise`); no PII in properties; client used only where a
  server seam doesn't exist.
* **Caps**: per-user daily and per-Task counters checked in the generation
  handler; limits from env (`GENERATION_DAILY_CAP=10`,
  `GENERATION_TASK_CAP=20`); free regenerations (PRD 3) don't count against
  caps; every run writes `calls × model` cost into the log/event properties.

## Testing Decisions

* **Pack seam**: creating a Pack from a chosen Concept writes the frozen
  snapshot (products, prices, budget math, assumptions); later price changes
  don't alter it; share route renders from token without auth; deleting the
  row 404s the link.
* **Budget seam**: owned items zero; within/over budget branches; no-budget
  Direction omits the comparison line.
* **Events seam**: each funnel action emits exactly its event with the decided
  properties (PostHog client injected/fixtured).
* **Caps seam**: 11th run of the day and 21st of a Task refuse with the cap
  message; free regenerations bypass counters.

## Out of Scope

* Good/Better/Best product alternatives (no alternatives source in v1).
* Voting/comments on the share link; collaboration (map: out of scope).
* Numeric funnel targets (set after baseline); any credits/monetization UI.

## Issue Breakdown (Sandcastle-ready)

1. **Pack data + share** (`module:api`): `concept_packs`, snapshot assembly,
   share-token route, revocation; seam tests.
2. **Pack page + PDF** (`module:ui`): visual-first template (approved
   prototype), before/after sliders, print/PDF path; component tests.
3. **PostHog + events** (`module:api` + `module:infra`): integration, 12
   events server-side, env wiring; events seam tests.
4. **Caps + cost logging** (`module:api`): counters, env limits, cap
   messaging, per-run cost logging; caps seam tests.
