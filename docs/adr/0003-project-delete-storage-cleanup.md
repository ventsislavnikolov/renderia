# Deleting a Project cleans up Storage best-effort on the request path, not via a trigger

A **Project** is hard-deleted: one `delete` on the `projects` row, and the
`ON DELETE CASCADE` chain already in the schema removes every descendant row
(`renovation_tasks`, `photos`, `task_photos`, `protected_elements`,
`structural_previews`, `room_composites`, `generated_images`, …). The cascade is
DB-only, so it never touches Supabase Storage. The deleted Project's blobs live
across four buckets — `source-photos`, `structural-previews`, `room-composites`,
and `generated-outputs` — and storage paths are `${userId}/${uuid}-${name}`,
**not** prefixed by Project, so no prefix-delete shortcut exists.

The `deleteProject` handler therefore enumerates those paths **before** issuing
the cascade delete, then removes them from each bucket **best-effort** after the
rows are gone — the same gather-then-remove shape as the existing single
`deletePhoto`. Three of the four tables (`photos`, `structural_previews`,
`room_composites`) carry `project_id` directly; `generated_images` is only
task-scoped, so its paths are collected via the Project's `renovation_tasks`
ids. The account-wide `furniture-references` bucket is **never** touched —
the Furniture Library is not Project-scoped.

## Considered Options

- **Best-effort cleanup on the request path (chosen)** — enumerate the four
  buckets' paths, hard-delete the Project (cascade), then `storage.remove()` each
  batch; log and swallow removal errors so a Storage hiccup never blocks the
  delete. Matches how `deletePhoto` and `deleteFurnitureItem` already treat
  Storage, needs no new infra, and keeps deletion synchronous and observable. The
  cost is a chunkier handler and a non-transactional tail: a crash between the row
  delete and the removes leaks blobs (bounded, one Project's worth).
- **Accept orphans (no cleanup)** — just delete the row. Rejected: a
  generation-heavy app writes outputs on every run, so orphaned blobs grow
  without bound and silently inflate storage cost.
- **Postgres trigger / scheduled edge function** — reconcile orphans server-side,
  decoupled from the request. Rejected for now: heavier infra (a function with
  Storage credentials, or a periodic reconciler) for a single-user workspace, and
  it makes "did my data actually get deleted?" eventually-consistent rather than
  observable in the request that asked for it. Revisit if cleanup volume or
  reliability ever outgrows the request path.

## Consequences

- `deleteProject` is **not** a thin row delete — it owns a fixed enumeration of
  four buckets. A new Storage-backed, Project-scoped table means this handler must
  be extended, or its blobs leak. This coupling is the main maintenance cost and
  the reason this decision is written down.
- Storage cleanup is **best-effort**: removal failures are logged, not surfaced or
  retried. Orphans are possible but bounded; they are never user-visible.
- No migration: the existing `projects` `for all` RLS policy already authorizes
  the owner's `update` and `delete`, and the cascade FKs already exist.
- The choice is **reversible in principle** (a later trigger/reconciler could
  supersede it), but the behavior — deletion fully resolves within the request —
  is one users and callers will come to rely on.
