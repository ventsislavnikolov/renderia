-- Room Composite: a single wide (3:2) empty-room view synthesised from every
-- approved Structural Preview. It replaces the single Reference Photo as the
-- source the final design is generated against. See docs/adr/0002.
--
-- Task-scoped with history rows (status generated → approved → superseded),
-- mirroring structural_previews. structural_previews is left untouched: it
-- keeps its per-photo reference_photo_id NOT NULL contract.

create table if not exists public.room_composites (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid not null,
  task_id uuid not null,
  storage_bucket text not null default 'room-composites' check (storage_bucket = 'room-composites'),
  storage_path text not null,
  prompt text not null,
  -- Provenance: the approved structural_preview ids that fed this synthesis.
  source_preview_ids jsonb not null default '[]'::jsonb,
  room_state_snapshot jsonb not null default '{}'::jsonb,
  status text not null default 'generated' check (status in ('generated', 'approved', 'superseded')),
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  unique (storage_bucket, storage_path),
  unique (id, owner_id, task_id),
  foreign key (task_id, owner_id, project_id) references public.renovation_tasks (id, owner_id, project_id) on delete cascade
);

create index if not exists room_composites_owner_task_idx on public.room_composites (owner_id, task_id);

alter table public.room_composites enable row level security;

create policy "room composites owner access"
  on public.room_composites
  for all
  using (owner_id = auth.uid())
  with check (
    owner_id = auth.uid()
    and storage_path like auth.uid()::text || '/%'
    and exists (
      select 1
      from public.renovation_tasks t
      where t.id = room_composites.task_id
        and t.owner_id = auth.uid()
        and t.project_id = room_composites.project_id
    )
  );

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('room-composites', 'room-composites', false, 10485760, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
set
  name = excluded.name,
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy "room composites owner select"
  on storage.objects
  for select
  using (
    bucket_id = 'room-composites'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "room composites owner insert"
  on storage.objects
  for insert
  with check (
    bucket_id = 'room-composites'
    and owner_id = auth.uid()::text
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "room composites owner update"
  on storage.objects
  for update
  using (
    bucket_id = 'room-composites'
    and owner_id = auth.uid()::text
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'room-composites'
    and owner_id = auth.uid()::text
    and (storage.foldername(name))[1] = auth.uid()::text
  );
