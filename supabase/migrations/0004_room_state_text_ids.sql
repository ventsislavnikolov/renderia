-- Room object ids are client-generated deterministic slugs (e.g. "door:left-frame")
-- and appearance ids embed photo id + timestamp, so neither fits uuid columns.
-- The uuid type made every room-state save fail after task_photos was already
-- written, silently dropping all detection boxes.

do $$
declare
  fk record;
begin
  for fk in
    select conname
    from pg_constraint
    where conrelid = 'public.room_object_appearances'::regclass
      and confrelid = 'public.room_objects'::regclass
      and contype = 'f'
  loop
    execute format(
      'alter table public.room_object_appearances drop constraint %I',
      fk.conname
    );
  end loop;
end $$;

alter table public.room_objects
  alter column id drop default,
  alter column id type text using id::text;

alter table public.room_object_appearances
  alter column id drop default,
  alter column id type text using id::text,
  alter column room_object_id type text using room_object_id::text;

alter table public.room_object_appearances
  add foreign key (room_object_id, owner_id, task_id)
    references public.room_objects (id, owner_id, task_id)
    on delete set null (room_object_id);
