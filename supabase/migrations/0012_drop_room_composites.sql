-- Drop the Room Composite subsystem (added in 0010). The "360" composite
-- stitched the approved per-angle Structural Previews into one wide empty-room
-- view that the final design was generated against. It is superseded by
-- per-angle generation: the design is now generated against each approved
-- Structural Preview independently, which keeps every output coherent.
-- See docs/adr/0002.

-- Storage object policies for the bucket (the table's own RLS policy is dropped
-- with the table).
drop policy if exists "room composites owner select" on storage.objects;
drop policy if exists "room composites owner insert" on storage.objects;
drop policy if exists "room composites owner update" on storage.objects;

-- Remove any stored composite objects, then the bucket itself.
delete from storage.objects where bucket_id = 'room-composites';
delete from storage.buckets where id = 'room-composites';

-- Drop the table; its RLS policy, indexes, and foreign keys go with it.
drop table if exists public.room_composites;
