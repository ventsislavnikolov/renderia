alter table public.task_photos
  add column if not exists display_order integer not null default 0,
  add column if not exists reviewed_at timestamptz;

create table if not exists public.task_room_sets (
  task_id uuid primary key,
  owner_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid not null,
  reference_photo_id uuid,
  preview_approved boolean not null default false,
  preview_approved_at timestamptz,
  active_preview_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (task_id, owner_id),
  unique (task_id, owner_id, project_id),
  foreign key (task_id, owner_id, project_id) references public.renovation_tasks (id, owner_id, project_id) on delete cascade,
  foreign key (reference_photo_id, owner_id, project_id) references public.photos (id, owner_id, project_id) on delete set null (reference_photo_id)
);

create table if not exists public.room_objects (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid not null,
  task_id uuid not null,
  label text not null,
  kind text not null,
  preservation_mode text not null check (preservation_mode in ('exact_preserve', 'keep_type_restyle')),
  is_persisted boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, owner_id, task_id),
  foreign key (task_id, owner_id, project_id) references public.renovation_tasks (id, owner_id, project_id) on delete cascade
);

create table if not exists public.room_object_appearances (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid not null,
  task_id uuid not null,
  photo_id uuid not null,
  room_object_id uuid,
  label text not null,
  kind text not null,
  x numeric not null check (x >= 0 and x <= 1),
  y numeric not null check (y >= 0 and y <= 1),
  width numeric not null check (width > 0 and width <= 1),
  height numeric not null check (height > 0 and height <= 1),
  check (x + width <= 1),
  check (y + height <= 1),
  confidence numeric check (confidence is null or (confidence >= 0 and confidence <= 1)),
  source text not null check (source in ('ai', 'manual')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, owner_id, task_id),
  foreign key (task_id, owner_id, project_id) references public.renovation_tasks (id, owner_id, project_id) on delete cascade,
  foreign key (photo_id, owner_id, project_id) references public.photos (id, owner_id, project_id) on delete cascade,
  foreign key (room_object_id, owner_id, task_id) references public.room_objects (id, owner_id, task_id) on delete set null (room_object_id)
);

create table if not exists public.structural_previews (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid not null,
  task_id uuid not null,
  reference_photo_id uuid not null,
  storage_bucket text not null default 'structural-previews' check (storage_bucket = 'structural-previews'),
  storage_path text not null,
  prompt text not null,
  room_state_snapshot jsonb not null default '{}'::jsonb,
  status text not null default 'generated' check (status in ('generated', 'approved', 'superseded')),
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  unique (storage_bucket, storage_path),
  unique (id, owner_id, task_id),
  foreign key (task_id, owner_id, project_id) references public.renovation_tasks (id, owner_id, project_id) on delete cascade,
  foreign key (reference_photo_id, owner_id, project_id) references public.photos (id, owner_id, project_id) on delete cascade
);

alter table public.task_room_sets
  add constraint task_room_sets_active_preview_fkey
  foreign key (active_preview_id, owner_id, task_id)
  references public.structural_previews (id, owner_id, task_id)
  on delete set null (active_preview_id);

create index if not exists task_room_sets_owner_task_idx on public.task_room_sets (owner_id, task_id);
create index if not exists room_objects_owner_task_idx on public.room_objects (owner_id, task_id);
create index if not exists room_object_appearances_owner_task_idx on public.room_object_appearances (owner_id, task_id);
create index if not exists room_object_appearances_photo_idx on public.room_object_appearances (photo_id);
create index if not exists structural_previews_owner_task_idx on public.structural_previews (owner_id, task_id);

alter table public.task_room_sets enable row level security;
alter table public.room_objects enable row level security;
alter table public.room_object_appearances enable row level security;
alter table public.structural_previews enable row level security;

create policy "task room sets owner access"
  on public.task_room_sets
  for all
  using (owner_id = auth.uid())
  with check (
    owner_id = auth.uid()
    and exists (
      select 1
      from public.renovation_tasks t
      where t.id = task_room_sets.task_id
        and t.owner_id = auth.uid()
        and t.project_id = task_room_sets.project_id
    )
  );

create policy "room objects owner access"
  on public.room_objects
  for all
  using (owner_id = auth.uid())
  with check (
    owner_id = auth.uid()
    and exists (
      select 1
      from public.renovation_tasks t
      where t.id = room_objects.task_id
        and t.owner_id = auth.uid()
        and t.project_id = room_objects.project_id
    )
  );

create policy "room object appearances owner access"
  on public.room_object_appearances
  for all
  using (owner_id = auth.uid())
  with check (
    owner_id = auth.uid()
    and exists (
      select 1
      from public.renovation_tasks t
      join public.photos p on p.id = room_object_appearances.photo_id
      where t.id = room_object_appearances.task_id
        and t.owner_id = auth.uid()
        and t.project_id = room_object_appearances.project_id
        and p.owner_id = auth.uid()
        and p.project_id = room_object_appearances.project_id
    )
  );

create policy "structural previews owner access"
  on public.structural_previews
  for all
  using (owner_id = auth.uid())
  with check (
    owner_id = auth.uid()
    and storage_path like auth.uid()::text || '/%'
    and exists (
      select 1
      from public.renovation_tasks t
      where t.id = structural_previews.task_id
        and t.owner_id = auth.uid()
        and t.project_id = structural_previews.project_id
    )
  );

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('structural-previews', 'structural-previews', false, 10485760, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
set
  name = excluded.name,
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy "structural previews owner select"
  on storage.objects
  for select
  using (
    bucket_id = 'structural-previews'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "structural previews owner insert"
  on storage.objects
  for insert
  with check (
    bucket_id = 'structural-previews'
    and owner_id = auth.uid()::text
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "structural previews owner update"
  on storage.objects
  for update
  using (
    bucket_id = 'structural-previews'
    and owner_id = auth.uid()::text
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'structural-previews'
    and owner_id = auth.uid()::text
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "structural previews owner delete"
  on storage.objects
  for delete
  using (
    bucket_id = 'structural-previews'
    and owner_id = auth.uid()::text
    and (storage.foldername(name))[1] = auth.uid()::text
  );
