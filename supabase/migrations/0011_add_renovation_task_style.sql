-- Parameterized Style presets (docs/adr/0004-parameterized-style-presets.md).
--
-- A renovation Task now carries its chosen Style — the aesthetic preset the
-- design prompt is rendered in (Scandinavian, Industrial, …). The set of valid
-- ids lives in code (`src/lib/ai/style-presets.ts`), not in a DB check
-- constraint, so adding a Style is a code change with no migration; the prompt
-- builder falls back to Scandinavian for any unknown id.
--
-- Existing Tasks default to 'scandinavian', preserving today's behaviour with
-- no backfill.

alter table public.renovation_tasks
  add column style text not null default 'scandinavian';
