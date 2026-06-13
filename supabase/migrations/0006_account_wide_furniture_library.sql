-- The Furniture Library moves from project scope to account scope: items
-- belong to the owner only, and any item is a candidate for any task's
-- generation run. Existing per-project items simply become visible
-- account-wide. `task_furniture` keeps the task->item links; its furniture
-- foreign key is reworked to (item, owner) while the task side stays
-- project-scoped, so deleting an item still detaches it from tasks via
-- cascade without touching the tasks themselves.

alter table public.task_furniture
  drop constraint task_furniture_furniture_item_id_owner_id_project_id_fkey;

alter table public.task_furniture
  add constraint task_furniture_furniture_item_id_owner_id_fkey
  foreign key (furniture_item_id, owner_id)
  references public.furniture_items (id, owner_id) on delete cascade;

-- Drop the policy before the column it references — the existing policy's
-- check depends on project_id, so the column drop fails while it exists.
drop policy "furniture items owner access" on public.furniture_items;

drop index public.furniture_items_owner_project_idx;

alter table public.furniture_items
  drop constraint furniture_items_id_owner_id_project_id_key;

alter table public.furniture_items
  drop constraint furniture_items_project_id_owner_id_fkey;

alter table public.furniture_items
  drop column project_id;

create index furniture_items_owner_idx on public.furniture_items (owner_id);

-- RLS still restricts to the owner; only the project-existence check goes.
create policy "furniture items owner access"
  on public.furniture_items
  for all
  using (owner_id = auth.uid())
  with check (
    owner_id = auth.uid()
    and storage_path like auth.uid()::text || '/%'
  );
