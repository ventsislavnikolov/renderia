create extension if not exists "pgcrypto";

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, owner_id)
);

create table public.renovation_tasks (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid not null,
  title text not null,
  category text not null,
  status text not null default 'active' check (status in ('suggested', 'active', 'archived')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, owner_id),
  unique (id, owner_id, project_id),
  foreign key (project_id, owner_id) references public.projects (id, owner_id) on delete cascade
);

create table public.photos (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid not null,
  storage_bucket text not null default 'source-photos' check (storage_bucket = 'source-photos'),
  storage_path text not null,
  original_name text not null,
  content_type text not null,
  width integer check (width is null or width > 0),
  height integer check (height is null or height > 0),
  notes text,
  created_at timestamptz not null default now(),
  unique (storage_bucket, storage_path),
  unique (id, owner_id),
  unique (id, owner_id, project_id),
  foreign key (project_id, owner_id) references public.projects (id, owner_id) on delete cascade
);

create table public.task_photos (
  owner_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid not null,
  task_id uuid not null,
  photo_id uuid not null,
  primary key (task_id, photo_id),
  foreign key (task_id, owner_id, project_id) references public.renovation_tasks (id, owner_id, project_id) on delete cascade,
  foreign key (photo_id, owner_id, project_id) references public.photos (id, owner_id, project_id) on delete cascade
);

create table public.protected_elements (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid not null,
  task_id uuid not null,
  photo_id uuid not null,
  label text not null,
  kind text not null,
  x numeric not null check (x >= 0),
  y numeric not null check (y >= 0),
  width numeric not null check (width > 0),
  height numeric not null check (height > 0),
  confidence numeric check (confidence is null or (confidence >= 0 and confidence <= 1)),
  status text not null default 'suggested' check (status in ('suggested', 'confirmed', 'rejected')),
  created_at timestamptz not null default now(),
  foreign key (task_id, owner_id, project_id) references public.renovation_tasks (id, owner_id, project_id) on delete cascade,
  foreign key (photo_id, owner_id, project_id) references public.photos (id, owner_id, project_id) on delete cascade
);

create table public.design_briefs (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  task_id uuid not null,
  markdown text not null,
  prompt text not null,
  version integer not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  unique (id, owner_id, task_id),
  foreign key (task_id, owner_id) references public.renovation_tasks (id, owner_id) on delete cascade
);

create table public.generation_jobs (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  task_id uuid not null,
  brief_id uuid,
  provider text not null,
  model text not null,
  status text not null default 'pending' check (status in ('pending', 'running', 'succeeded', 'failed')),
  prompt text not null,
  error_message text,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (id, owner_id, task_id),
  foreign key (task_id, owner_id) references public.renovation_tasks (id, owner_id) on delete cascade,
  -- Partial-column SET NULL requires PostgreSQL 15+ (Supabase default). Nulls only brief_id; owner_id/task_id remain NOT NULL.
  foreign key (brief_id, owner_id, task_id) references public.design_briefs (id, owner_id, task_id) on delete set null (brief_id)
);

create table public.generated_images (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  job_id uuid not null,
  task_id uuid not null,
  storage_bucket text not null default 'generated-outputs' check (storage_bucket = 'generated-outputs'),
  storage_path text not null,
  variation_index integer not null check (variation_index >= 0),
  is_favorite boolean not null default false,
  notes text,
  created_at timestamptz not null default now(),
  unique (storage_bucket, storage_path),
  unique (job_id, variation_index),
  foreign key (job_id, owner_id, task_id) references public.generation_jobs (id, owner_id, task_id) on delete cascade,
  foreign key (task_id, owner_id) references public.renovation_tasks (id, owner_id) on delete cascade
);

create index projects_owner_id_idx on public.projects (owner_id);
create index renovation_tasks_owner_project_idx on public.renovation_tasks (owner_id, project_id);
create index photos_owner_project_idx on public.photos (owner_id, project_id);
create index task_photos_owner_project_idx on public.task_photos (owner_id, project_id);
create index task_photos_photo_id_idx on public.task_photos (photo_id);
create index protected_elements_owner_task_idx on public.protected_elements (owner_id, task_id);
create index design_briefs_owner_task_idx on public.design_briefs (owner_id, task_id);
create index generation_jobs_owner_task_idx on public.generation_jobs (owner_id, task_id);
create index generated_images_owner_task_idx on public.generated_images (owner_id, task_id);

alter table public.projects enable row level security;
alter table public.renovation_tasks enable row level security;
alter table public.photos enable row level security;
alter table public.task_photos enable row level security;
alter table public.protected_elements enable row level security;
alter table public.design_briefs enable row level security;
alter table public.generation_jobs enable row level security;
alter table public.generated_images enable row level security;

create policy "projects owner access"
  on public.projects
  for all
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

create policy "renovation tasks owner access"
  on public.renovation_tasks
  for all
  using (owner_id = auth.uid())
  with check (
    owner_id = auth.uid()
    and exists (
      select 1
      from public.projects p
      where p.id = renovation_tasks.project_id
        and p.owner_id = auth.uid()
    )
  );

create policy "photos owner access"
  on public.photos
  for all
  using (owner_id = auth.uid())
  with check (
    owner_id = auth.uid()
    and storage_path like auth.uid()::text || '/%'
    and exists (
      select 1
      from public.projects p
      where p.id = photos.project_id
        and p.owner_id = auth.uid()
    )
  );

create policy "task photos owner access"
  on public.task_photos
  for all
  using (owner_id = auth.uid())
  with check (
    owner_id = auth.uid()
    and exists (
      select 1
      from public.projects p
      where p.id = task_photos.project_id
        and p.owner_id = auth.uid()
    )
  );

create policy "protected elements owner access"
  on public.protected_elements
  for all
  using (owner_id = auth.uid())
  with check (
    owner_id = auth.uid()
    and exists (
      select 1
      from public.renovation_tasks t
      join public.photos p on p.id = protected_elements.photo_id
      where t.id = protected_elements.task_id
        and t.owner_id = auth.uid()
        and p.owner_id = auth.uid()
        and p.id = protected_elements.photo_id
        and p.project_id = t.project_id
        and p.project_id = protected_elements.project_id
    )
  );

create policy "design briefs owner access"
  on public.design_briefs
  for all
  using (owner_id = auth.uid())
  with check (
    owner_id = auth.uid()
    and exists (
      select 1
      from public.renovation_tasks t
      where t.id = design_briefs.task_id
        and t.owner_id = auth.uid()
    )
  );

create policy "generation jobs owner access"
  on public.generation_jobs
  for all
  using (owner_id = auth.uid())
  with check (
    owner_id = auth.uid()
    and exists (
      select 1
      from public.renovation_tasks t
      where t.id = generation_jobs.task_id
        and t.owner_id = auth.uid()
    )
    and (
      generation_jobs.brief_id is null
      or exists (
        select 1
        from public.design_briefs b
        where b.id = generation_jobs.brief_id
          and b.owner_id = auth.uid()
          and b.task_id = generation_jobs.task_id
      )
    )
  );

create policy "generated images owner access"
  on public.generated_images
  for all
  using (owner_id = auth.uid())
  with check (
    owner_id = auth.uid()
    and storage_path like auth.uid()::text || '/%'
    and exists (
      select 1
      from public.generation_jobs j
      where j.id = generated_images.job_id
        and j.owner_id = auth.uid()
        and j.task_id = generated_images.task_id
    )
  );

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('source-photos', 'source-photos', false, 10485760, array['image/jpeg', 'image/png', 'image/webp']),
  ('generated-outputs', 'generated-outputs', false, 10485760, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
set
  name = excluded.name,
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy "source photos owner select"
  on storage.objects
  for select
  using (
    bucket_id = 'source-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "source photos owner insert"
  on storage.objects
  for insert
  with check (
    bucket_id = 'source-photos'
    and owner_id = auth.uid()::text
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "source photos owner update"
  on storage.objects
  for update
  using (
    bucket_id = 'source-photos'
    and owner_id = auth.uid()::text
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'source-photos'
    and owner_id = auth.uid()::text
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "source photos owner delete"
  on storage.objects
  for delete
  using (
    bucket_id = 'source-photos'
    and owner_id = auth.uid()::text
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "generated outputs owner select"
  on storage.objects
  for select
  using (
    bucket_id = 'generated-outputs'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "generated outputs owner insert"
  on storage.objects
  for insert
  with check (
    bucket_id = 'generated-outputs'
    and owner_id = auth.uid()::text
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "generated outputs owner update"
  on storage.objects
  for update
  using (
    bucket_id = 'generated-outputs'
    and owner_id = auth.uid()::text
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'generated-outputs'
    and owner_id = auth.uid()::text
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "generated outputs owner delete"
  on storage.objects
  for delete
  using (
    bucket_id = 'generated-outputs'
    and owner_id = auth.uid()::text
    and (storage.foldername(name))[1] = auth.uid()::text
  );
