-- Room-object ids are deterministic, task-independent slugs (e.g.
-- "other:new-fixed-element" for every manually-added "new fixed element"),
-- so the same slug legitimately recurs across tasks. The global PRIMARY KEY
-- (id) forbade that: saving a manual object in one task made the
-- onConflict:"id" upsert try to move the existing slug row to the current
-- task, and that task's appearances (FK is ON UPDATE NO ACTION) blocked the
-- task_id change -- so every "Add manual object" save failed with a generic
-- "Database error". Re-key room_objects per task instead; the appearance FK
-- already references the composite (id, owner_id, task_id).

alter table public.room_object_appearances
  drop constraint room_object_appearances_room_object_id_owner_id_task_id_fkey;

alter table public.room_objects
  drop constraint room_objects_pkey,
  drop constraint room_objects_id_owner_id_task_id_key;

alter table public.room_objects
  add constraint room_objects_pkey primary key (id, owner_id, task_id);

alter table public.room_object_appearances
  add constraint room_object_appearances_room_object_id_owner_id_task_id_fkey
    foreign key (room_object_id, owner_id, task_id)
    references public.room_objects (id, owner_id, task_id)
    on delete set null (room_object_id);
