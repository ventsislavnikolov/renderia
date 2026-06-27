# Restructure Suggestions are not structurally validated; they carry a disclaimer instead

The app proposes structural changes (see the **Restructure Suggestion** glossary
term) without assessing whether they are buildable — it does not try to decide
whether a wall is load-bearing, whether an opening is permissible, or whether an
addition is sound. Every suggestion is presented as a visual concept with an
explicit caveat ("concept only — confirm structural feasibility with a
professional"), and the suggestion-generation prompt makes no feasibility claim.

This is a deliberate "no". An image model cannot reliably infer load-bearing
structure, foundations, or services from a few interior/exterior photos, so any
gating we built would be guesswork dressed as expertise — worse than no gating,
because it implies a guarantee we cannot honor. We would rather under-claim and
let the user (and their engineer) judge buildability than ship a false signal.

## Considered Options

- **Free suggestions + disclaimer (chosen)** — suggest anything visually
  plausible; attach a non-engineering-advice caveat. Honest about the tool's
  limits; no liability posture beyond "concept".
- **Heuristic feasibility gating** — try to flag likely load-bearing or
  structural walls and suppress/warn. Rejected: unreliable from photos, and a
  hidden suggestion or a "safe" badge implies expertise the model does not have.
- **Conservative vocabulary only** — restrict to changes that are low-risk by
  construction. Rejected: "low-risk" is not determinable from a photo, so the
  restriction would be arbitrary and still need the same disclaimer.

## Consequences

- The product takes no engineering-advice posture; copy and prompts must keep
  the "concept only" framing consistent wherever a suggestion appears.
- No structural-analysis dependency, dataset, or model is introduced for v1.
- If feasibility signals are ever wanted, they arrive as a clearly-separate,
  appropriately-sourced feature — not retrofitted into the suggestion prompt.
