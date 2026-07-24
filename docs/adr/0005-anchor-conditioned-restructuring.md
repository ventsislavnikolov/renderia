# Restructure Suggestions are realized on the Reference Photo and conditioned across the other angles

To let the app propose *structural* changes (move/remove a wall, add a window or
dormer) and render them — see the **Restructure Suggestion** glossary term — a
chosen suggestion is realized first on the **Reference Photo** (the anchor
angle), producing a new structural base. The remaining angles' restructured
Structural Previews are then **conditioned on that anchor result** so every
angle agrees on the new architecture, after which the normal preserve-and-style
layer runs unchanged against each restructured base.

This deliberately re-opens a problem ADR 0002 closed. ADR 0002 abandoned
cross-angle coherence: the four approved angles are non-overlapping corners with
nothing to stitch through, so any attempt to make them share one synthesized
reality produced incoherent collages — which is why the final design is now
generated **per angle, independently**. A structural change is the one case
where per-angle independence is *not* acceptable: if each angle invents its own
"what's behind the removed wall", the Room Set stops describing one room. We
therefore accept a bounded, anchor-driven coherence pass for restructuring only,
rather than reverting to a shared composite.

## Considered Options

- **Anchor-conditioned (chosen)** — realize on the Reference Photo, condition
  the other angles on it. Keeps a single source of truth for the new structure
  while leaving the per-angle styling layer (ADR 0002's outcome) intact. Cost:
  the conditioning step is unproven and is the feature's main technical risk.
- **Single-angle MVP** — restructure only the Reference Photo; leave other
  angles faithful/unchanged. Cheapest and ships the idea, but the Room Set is
  then internally inconsistent (one angle shows the change, others don't).
  Rejected as the default; viable as a fallback if conditioning proves
  intractable.
- **Independent per-angle** — send the same instruction to every angle with no
  conditioning. Rejected: this is precisely the incoherence ADR 0002 documented,
  now made worse because each angle must *invent* new structure rather than
  preserve existing structure.

## Consequences

- The restructure flow re-anchors, rather than discards, the architectural-
  fidelity rules: structure changes once at the base, then everything downstream
  stays faithful to that new base.
- `reference_photo_id` gains a second, load-bearing role (the restructure
  anchor) beyond seeding which angle a Structural Preview previews — it was left
  "vestigial for generation" by ADR 0002.
- The anchor-conditioning mechanism is the feature's primary feasibility risk; if
  it cannot produce coherent angles, the documented fallback is the single-angle
  MVP, not the rejected independent-per-angle path.
- Applies uniformly to Interior and Exterior Tasks, since both share the
  Structural Preview pipeline.

## Validation note (2026-07-24)

The conditioning mechanism was spiked on the *styling* layer first (v2 Concept
work, wayfinder ticket #137): on a real 2-angle Room Set, a non-anchor angle
generated with the anchor angle's render as an additional `images.edit`
reference visibly inherited the anchor's concrete design decisions (art, lamp,
table styling, textiles), where an unconditioned control diverged. Verdict:
**go** — anchor-conditioned generation is adopted for v2 Concepts (anchor angle
first, every other angle conditioned on its render). This materially de-risks
this ADR's flagged unknown, though restructuring (changing architecture, not
styling) still deserves its own spike before build.
