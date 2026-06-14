-- Multi-photo furniture (PRD: multi-photo-furniture, ADR 0001): a Furniture
-- Item gains a set of Furniture Photos (1–6) living in a normalized child
-- table. Exactly one photo is the active Reference Image — the single image
-- generation sends — enforced as a DB invariant by a partial unique index.
--
-- The image columns (storage_path, original_name, content_type, source) and
-- the (storage_bucket, storage_path) uniqueness move off furniture_items onto
-- the child table. The parent keeps identity + metadata (label, source_link,
-- brand, price, currency, dimensions). This migration is destructive and
-- hard to reverse: it backfills one active child row per existing item, then
-- drops the moved columns from the parent.

create table public.furniture_item_images (
  id uuid primary key default gen_random_uuid(),
  furniture_item_id uuid not null,
  owner_id uuid not null references auth.users(id) on delete cascade,
  storage_bucket text not null default 'furniture-references' check (storage_bucket = 'furniture-references'),
  storage_path text not null,
  original_name text not null,
  content_type text not null,
  source text not null check (source in ('product', 'photo')),
  is_active boolean not null default false,
  created_at timestamptz not null default now(),
  unique (storage_bucket, storage_path),
  foreign key (furniture_item_id, owner_id) references public.furniture_items (id, owner_id) on delete cascade
);

-- Exactly one active photo per item.
create unique index furniture_item_images_active_idx
  on public.furniture_item_images (furniture_item_id)
  where is_active;

create index furniture_item_images_item_idx
  on public.furniture_item_images (furniture_item_id);
create index furniture_item_images_owner_idx
  on public.furniture_item_images (owner_id);

alter table public.furniture_item_images enable row level security;

-- Owner-scoped, mirroring the furniture_items policy: storage objects live
-- under <owner_id>/, so the path must be owner-prefixed.
create policy "furniture item images owner access"
  on public.furniture_item_images
  for all
  using (owner_id = auth.uid())
  with check (
    owner_id = auth.uid()
    and storage_path like auth.uid()::text || '/%'
  );

-- Backfill: one active child row per existing item, copying its image fields.
insert into public.furniture_item_images
  (furniture_item_id, owner_id, storage_bucket, storage_path, original_name, content_type, source, is_active)
select id, owner_id, storage_bucket, storage_path, original_name, content_type, source, true
from public.furniture_items;

-- Drop the moved columns from the parent. The (storage_bucket, storage_path)
-- unique constraint depends on storage_path and is dropped with it.
alter table public.furniture_items
  drop column storage_path,
  drop column original_name,
  drop column content_type,
  drop column source;
