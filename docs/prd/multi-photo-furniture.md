# PRD: Multi-photo Furniture Items

> Resolves the multi-photo item deferred as out of scope in the Furniture Library PRD. Tracked as GitHub issue **#61** (milestone M7). Schema decision recorded in `docs/adr/0001-furniture-photos-normalized-child-table.md`.

## Problem Statement

A Furniture Item holds exactly one image today — its **Reference Image**. But a
real piece is rarely captured well by a single shot: a retailer page carries a
clean front cutout plus side, back, and in-room angles, and a phone photo of a
shop piece is one of several I take. With room for only one image I have to
discard the rest at import time, and if I later decide a different angle is the
better reference I must delete the item and re-add it. The extra photos the Link
Import already extracts from the product page are thrown away.

I want to keep several photos on one Furniture Item, see them together in the
library, and choose which one is the Reference Image generation uses — without
losing the simple "one image goes to the model" contract that keeps renders
predictable.

## Solution

A Furniture Item gains a set of **Furniture Photos** (1–6). Exactly one is the
**active** photo — the **Reference Image** — and that is the single image
generation sends, unchanged from today. The others are kept for the library:
better browsing, and a one-click switch of which photo is the reference.

- **Link Import** becomes multi-select: the confirm form lets me keep several of
  the extracted photos (default: all, capped at 6) and mark one as the Reference
  Image (default: the first). On confirm the server downloads each kept photo
  into the furniture bucket.
- The **edit dialog** becomes the home of photo management: a thumbnail gallery
  with a Reference Image badge, click-to-set-active, delete-per-photo, and an
  "Add photo" button that reuses the existing crop flow.
- **Manual add** is unchanged — one cropped photo at creation; more are added
  later from the edit dialog.
- **Generation is unchanged in behavior**: it sends one Reference Image per
  selected item — now resolved as that item's active Furniture Photo.

An item always has at least one Furniture Photo and exactly one active photo, so
generation can always resolve a Reference Image.

## User Stories

1. As a renovator, I want to keep more than one photo on a Furniture Item, so that a product cutout and a few real-life angles live together instead of forcing a choice.
2. As a renovator, I want to pick which photo is the Reference Image, so that I control the single image the AI uses without re-creating the item.
3. As a renovator, I want to switch the Reference Image later from the edit dialog, so that I can change my mind as I see how renders turn out.
4. As a renovator, I want Link Import to let me keep several of the photos it found, so that the extra angles the product page carries aren't discarded.
5. As a renovator, I want one of the imported photos marked as the Reference Image by default, so that import still produces a usable item in one click.
6. As a renovator, I want to add more photos to an existing item via the crop flow, so that a piece I later photograph in a shop joins the same item.
7. As a renovator, I want to delete an individual photo, so that a bad or duplicate shot can go without deleting the whole item.
8. As a renovator, I want to be stopped from deleting an item's last photo, so that an item is never left with no Reference Image — I delete the item instead.
9. As a renovator, I want deleting the active photo to promote another automatically, so that the item keeps a working Reference Image with no extra step.
10. As a renovator, I want the library card and picker to show each item's Reference Image, so that the active photo is what represents the item everywhere.
11. As a renovator, I want my existing single-image items to keep working unchanged after the change, so that nothing I already added is lost or altered.
12. As a renovator, I want a sensible cap on photos per item, so that the gallery stays tidy and I'm not tempted to dump a whole camera roll on one piece.

## Implementation Decisions

* **Normalized child table** (see ADR 0001). New `furniture_item_images`:
  `id`, `furniture_item_id` (FK → `furniture_items(id, owner_id)` on delete
  cascade), `owner_id`, `storage_bucket` (default `furniture-references`),
  `storage_path`, `original_name`, `content_type`, `source` (`product`/`photo`),
  `is_active` (boolean), `created_at`. The `(storage_bucket, storage_path)`
  uniqueness moves here.
* **Exactly one active per item** is a DB invariant: a partial unique index
  `(furniture_item_id) where is_active`. Set-active is a transaction that clears
  the old active and sets the new one.
* **Drop image columns from `furniture_items`**: `storage_path`,
  `original_name`, `content_type`, `source` move to the child table. The parent
  keeps identity + metadata (`label`, `source_link`, `brand`, `price`,
  `currency`, dimensions).
* **Migration backfills** one `furniture_item_images` row per existing item
  (`is_active = true`) copying its current image fields, then drops the columns.
  Idempotent and reversible only by restore — this is the hard-to-reverse step.
* **Cap of 6 Furniture Photos per item**, enforced server-side on add (import
  and edit-dialog add) and reflected client-side (the add control disables at 6).
* **Reference Image read path**: every place that read
  `furniture_items.storage_path` (generation reference loading, library list,
  picker) now joins `furniture_item_images where is_active`. Behavior is
  identical — one reference image per item.
* **Generation is untouched semantically**: it continues to send one Reference
  Image per selected item. Sending multiple angles of one item to the model is
  explicitly **out of scope** (see below) — it needs prompt work to tell the
  model "these are the same piece" and is a separate future issue.
* **Display order**: active photo first, then by `created_at` ascending. No
  manual reorder in v1.
* **Deletion**: deleting a photo is blocked when it is the item's last; deleting
  the active photo promotes the oldest remaining photo to active in the same
  transaction. Deleting the item cascades all photos (rows + storage objects),
  same as today.
* **Storage** is unchanged: same `furniture-references` bucket, same
  `<owner_id>/...` path scheme and owner-scoped object policies; rows just live
  in the child table now.
* **Glossary**: Reference Image (redefined as the active Furniture Photo) and
  Furniture Photo (new) — as defined in CONTEXT.md.

## Testing Decisions

* Assert external behavior at the highest existing seam — handler in, rows /
  payload out — never internal call order or private helpers.
* **Server-handler seam (existing pattern)**: add-photo, set-active,
  delete-photo, and the reworked list handler are tested with the mocked-Supabase
  stub pattern already used by the furniture handlers. Cover: cap-of-6 rejection,
  exactly-one-active after set-active, last-photo-delete rejection, and
  auto-promote on active-photo delete.
* **Link Import seam (existing pattern)**: the import confirm handler is tested
  for multi-photo — N kept photos produce N child rows with exactly one active;
  page fetch stays injected, fixtures only, no network.
* **Reference-image read seam**: generation reference loading is tested to send
  the active photo, and to keep sending it after the active photo is switched.
* **Migration**: a test (or migration assertion) that a pre-migration
  single-image item yields exactly one active child row with the same
  storage path.
* **Component seam (existing pattern, light)**: edit-dialog gallery renders the
  photos, shows the Reference Image badge on the active one, and disables add at 6.
* No new live-fetch tests — consistent with the Furniture Library PRD.

## Out of Scope

* **Sending several photos of one item to generation** (multiple angles of the
  same piece). Deferred — it requires prompt changes so the model treats the
  images as one piece, and carries render-duplication risk. A separate issue.
* Manual reorder / drag-to-sort of Furniture Photos.
* Multi-file upload with per-file crop in the manual add flow (crop is per-image;
  photos accumulate via the edit dialog instead).
* Per-photo metadata (captions, tags, angle labels).
* Re-fetching fresh photos from the Source Link after import.

## Issue Breakdown (Sandcastle-ready)

Each is intended to fit one autonomous iteration; ordered by dependency.

1. **Schema + migration**: create `furniture_item_images`, partial-unique active
   index, RLS; backfill one active row per item; drop the moved columns from
   `furniture_items`. Server furniture read/list updated to join the active photo
   so existing behavior and tests stay green.
2. **Photo management handlers**: add-photo (cap 6), set-active (transactional,
   one-active invariant), delete-photo (block last, auto-promote oldest on active
   delete). Handler-seam tests.
3. **Edit-dialog gallery UI**: thumbnail gallery, Reference Image badge,
   click-to-set-active, delete-per-photo, "Add photo" via the existing crop flow,
   add disabled at 6. Component tests.
4. **Link Import multi-select**: confirm form keeps several extracted photos
   (default all ≤6) with one active (default first); confirm handler downloads
   each kept photo into the bucket. Import-seam tests.

## Further Notes

* Generation's reference-image array already supports one image per item; this
  PRD only changes *where* that one image is read from, not the model contract.
* The cap of 6 is a soft product limit, not a model limit; it keeps the gallery
  and storage bounded and is unlikely to bind in practice.
