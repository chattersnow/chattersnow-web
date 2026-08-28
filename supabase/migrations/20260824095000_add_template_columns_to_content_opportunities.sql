-- Links a content-opportunity brief to the template it was built from,
-- frozen at the version in use when field values were entered (issue #107).
-- template_version_id, not template_id, is what rendering must key off of --
-- a template's fields can be revised later (new version rows), but a brief
-- always displays the fields from its own pinned version, never the
-- template's current/live one.
alter table public.content_opportunities
  add column template_id uuid references public.content_brief_templates(id),
  add column template_version_id uuid references public.content_brief_template_versions(id),
  add column template_field_values jsonb not null default '{}'::jsonb;
