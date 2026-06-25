# The final design is generated from a synthesized Room Composite, not a single Reference Photo

> **Superseded by per-angle generation.** The Room Composite is no longer the
> generation source. Two attempts failed: a single `gpt-image-2` edit collapsed
> the multi-angle room to one corner, and a progressive-outpaint panorama
> produced incoherent collages (visible seams, mismatched perspective) because
> the four approved angles are non-overlapping corners with nothing to stitch
> through. The design is now generated **against each approved Structural
> Preview independently** — one design concept rendered per angle, each output
> photoreal because it edits one real photo, the set covering the whole room.
> Step 05 ("360") became a read-only "Room" review of the approved angles. The
> Room Composite code and the `room_composites` table were removed (the table is
> dropped in migration 0012). The rest of this ADR is kept for historical
> context.

Today the furnished renovation concepts are generated from one **Reference Photo**
— a single camera angle ("POV"). To support full-room design when the Room Set
contains several angles (and some Photos are poor quality), the flow gains a
**Room Composite**: a single wide (3:2) empty-room view synthesized from every
**approved Structural Preview**. The Room Composite, once approved, becomes the
`sourceImage` the final design is generated against, replacing the single
Reference Photo.

The composite covers **only the arc the Photos actually captured** — it does not
invent walls that were never photographed. It is **not a literal 360°
wrap-around**: the only image model wired in, OpenAI `gpt-image-2`, caps output
at 3:2 (1536×1024), so a true panorama is not generatable. The user-facing label
is "360 view"; code, types, and tables use "Room Composite".

## Considered Options

- **Captured-arc 3:2 composite (chosen)** — one `images.edit` call takes the
  approved per-angle previews as room evidence and emits a 3:2 empty-room view.
  Ships on the existing model with no new integration. Furnishing reuses the
  existing generation path with the composite as the source. The cost is honesty:
  "360" is aspirational; the artifact is a wide view, not a wrap-around.
- **Single-POV (status quo)** — keep generating from one Reference Photo.
  Rejected: a single angle can't express a whole-room design, and a bad chosen
  angle sinks the result.
- **Horizontal tile-and-stitch** — generate overlapping segments and stitch a
  genuinely wide image. Rejected for now: seam/consistency risk and materially
  more code and generation cost for a first version.
- **New panorama-capable image model** — integrate a model that outputs wide /
  equirectangular images. Rejected: none is wired today, and the model catalog
  notes none matches `gpt-image-2`'s interior-render quality.

## Consequences

- A new `room_composites` table (task-scoped, with history) holds the composite;
  `structural_previews` keeps its per-photo `reference_photo_id NOT NULL`
  contract unchanged.
- Approval becomes two-staged: **every kept Photo** must reach an approved
  Structural Preview (a bad angle is re-generated or the Photo is deleted),
  **then** the synthesized composite gets its own approval gate before Brief.
  The single `previewApproved` boolean is replaced by per-photo approval plus a
  composite-approved flag.
- `referencePhotoId` becomes vestigial for generation — it still seeds which
  angle a Structural Preview previews, but no longer sources the final design.
- The design brief draws protected elements from **all** approved appearances,
  not just the one Reference Photo's.
- A new "360" step sits between Preview and Brief
  (Upload → Review → Merge → Preview → 360 → Brief → Generate).
- The migration adding `room_composites` and reshaping room-set approval state
  is **hard to reverse** once tasks carry approved composites.
