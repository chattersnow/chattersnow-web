-- Marks which templates represent a community-story-type brief that needs
-- recorded consent before its content opportunity can move to
-- approved/scheduled/published (issue #113 scope item 1). Modeled as an
-- admin-editable template flag rather than a hardcoded template key check
-- in application code, so a future consent-requiring template doesn't need
-- a code change.

alter table public.content_brief_templates
  add column requires_consent boolean not null default false;

comment on column public.content_brief_templates.requires_consent is
  'When true, a content opportunity built from this template needs a recorded content_permissions row before it can move to approved/scheduled/published.';

update public.content_brief_templates
set requires_consent = true
where key = 'community_spotlight';
