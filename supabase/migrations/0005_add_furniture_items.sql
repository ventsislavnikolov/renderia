-- Furniture reference images: a per-project library of furniture pieces
-- (product shots or cropped phone photos) that can be attached to a task's
-- generation run so the AI includes those pieces in the rendered variations.

create table public.furniture_items (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid not null,
  storage_bucket text not null default 'furniture-references' check (storage_bucket = 'furniture-references'),
  storage_path text not null,
  original_name text not null,
  content_type text not null,
  label text not null,
  source text not null check (source in ('product', 'photo')),
  created_at timestamptz not null default now(),
  unique (storage_bucket, storage_path),
  unique (id, owner_id),
  unique (id, owner_id, project_id),
  foreign key (project_id, owner_id) references public.projects (id, owner_id) on delete cascade
);

create table public.task_furniture (
  owner_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid not null,
  task_id uuid not null,
  furniture_item_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (task_id, furniture_item_id),
  foreign key (task_id, owner_id, project_id) references public.renovation_tasks (id, owner_id, project_id) on delete cascade,
  foreign key (furniture_item_id, owner_id, project_id) references public.furniture_items (id, owner_id, project_id) on delete cascade
);

create index furniture_items_owner_project_idx on public.furniture_items (owner_id, project_id);
create index task_furniture_owner_project_idx on public.task_furniture (owner_id, project_id);
create index task_furniture_furniture_item_id_idx on public.task_furniture (furniture_item_id);

alter table public.furniture_items enable row level security;
alter table public.task_furniture enable row level security;

create policy "furniture items owner access"
  on public.furniture_items
  for all
  using (owner_id = auth.uid())
  with check (
    owner_id = auth.uid()
    and storage_path like auth.uid()::text || '/%'
    and exists (
      select 1
      from public.projects p
      where p.id = furniture_items.project_id
        and p.owner_id = auth.uid()
    )
  );

create policy "task furniture owner access"
  on public.task_furniture
  for all
  using (owner_id = auth.uid())
  with check (
    owner_id = auth.uid()
    and exists (
      select 1
      from public.projects p
      where p.id = task_furniture.project_id
        and p.owner_id = auth.uid()
    )
  );

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('furniture-references', 'furniture-references', false, 10485760, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
set
  name = excluded.name,
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy "furniture references owner select"
  on storage.objects
  for select
  using (
    bucket_id = 'furniture-references'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "furniture references owner insert"
  on storage.objects
  for insert
  with check (
    bucket_id = 'furniture-references'
    and owner_id = auth.uid()::text
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "furniture references owner update"
  on storage.objects
  for update
  using (
    bucket_id = 'furniture-references'
    and owner_id = auth.uid()::text
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'furniture-references'
    and owner_id = auth.uid()::text
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "furniture references owner delete"
  on storage.objects
  for delete
  using (
    bucket_id = 'furniture-references'
    and owner_id = auth.uid()::text
    and (storage.foldername(name))[1] = auth.uid()::text
  );
