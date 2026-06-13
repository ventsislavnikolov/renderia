# `api` reference

## Domain vocabulary

See `CONTEXT.md` at the repo root — Furniture Library, Furniture Item, Reference Image, Link Import, Source Link.

## Data model (Supabase)

- `projects` → `renovation_tasks` → `task_photos` (join to `photos`)
- `protected_elements` — detection boxes persisted via the `replace_protected_elements` RPC (atomic full replace per task/photo)
- `task_room_sets`, `room_objects`, `room_object_appearances` — room evidence; objects unify appearances across photo angles
- `structural_previews` — one row per generation, latest-per-`reference_photo_id` is what the UI shows; approval marks one active on `task_room_sets`
- `design_briefs` — versioned brief markdown + prompt
- `generation_jobs` → `generated_images` (one row per variation; `is_favorite`, `notes` stores the room-contents JSON array)
- `furniture_items` + `task_furniture` — furniture references attached to generation runs
- All tables RLS-scoped to `owner_id = auth.uid()`; composite FKs carry `owner_id` through

## Storage buckets (all private)

- `source-photos` (10 MiB, jpeg/png/webp)
- `generated-outputs`
- `structural-previews`
- `furniture-references`

## AI providers

- `AI_PROVIDER=mock|openai` (default mock); model catalog in `src/lib/ai/models.ts` spans OpenAI, Gemini, Anthropic, Z.ai, Moonshot with per-action capability kinds
- Image generation/edit: gpt-image via `client.images.edit` (source photo + furniture references as image array) or `images.generate` (text-only)
- Debug payloads (`model`, `prompt`, `rawResponse`, `durationMs`) stripped in production by `attachDebugIfDev`
