-- Link Import fills furniture items with richer metadata than the manual add
-- flow captures: where the piece came from, its brand, an import-time price
-- snapshot, and physical dimensions. Every column is nullable — manual items
-- have none of it, imported items have whatever the product page exposed, and
-- the user can clear any field in the edit form. A non-null `source_link`
-- marks an item as link-imported; the `source` enum stays product/photo.
--
-- No new RLS policy is needed: the existing "furniture items owner access"
-- policy is row-scoped (for all, owner_id = auth.uid()), so it already covers
-- every column on the row, new ones included.

alter table public.furniture_items
  add column source_link text,
  add column brand text,
  add column price numeric(12, 2),
  add column currency text,
  add column width_cm numeric(8, 1),
  add column height_cm numeric(8, 1),
  add column depth_cm numeric(8, 1);

alter table public.furniture_items
  add constraint furniture_items_price_nonnegative
    check (price is null or price >= 0),
  add constraint furniture_items_width_positive
    check (width_cm is null or width_cm > 0),
  add constraint furniture_items_height_positive
    check (height_cm is null or height_cm > 0),
  add constraint furniture_items_depth_positive
    check (depth_cm is null or depth_cm > 0);
