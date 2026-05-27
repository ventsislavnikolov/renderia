alter table public.design_briefs
  add column if not exists style_rules text not null default '';
