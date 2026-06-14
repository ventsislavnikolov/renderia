# Furniture Photos live in a normalized child table, not a denormalized pointer

To support multiple photos per Furniture Item (PRD: multi-photo-furniture), photos move
into a `furniture_item_images` child table and the image columns
(`storage_path`, `original_name`, `content_type`, `source`) are **dropped** from
`furniture_items`. The active **Reference Image** is the child row where
`is_active` is true, enforced by a partial unique index `(furniture_item_id) where is_active`;
generation and library reads resolve it with a join rather than reading a cached
pointer on the parent.

## Considered Options

- **Normalize (chosen)** — one source of truth. Reads cost one extra join (the
  code already issues a DB query at every read site), and a whole class of
  "parent pointer disagrees with `is_active`" bugs becomes unrepresentable.
- **Denormalize** — keep an `active_image_id` (or mirror the active path) on
  `furniture_items` for join-free reads. Rejected: every set-active and every
  active-photo delete would have to update the pointer transactionally, and any
  missed path silently breaks the Reference Image that generation depends on.

## Consequences

- The migration is **destructive and hard to reverse**: it drops columns from
  `furniture_items` after backfilling one active child row per existing item.
- `task_furniture` is unaffected — it still references `furniture_items (id, owner_id)`.
- The `(storage_bucket, storage_path)` uniqueness and the owner/RLS scoping move
  to the child table.
