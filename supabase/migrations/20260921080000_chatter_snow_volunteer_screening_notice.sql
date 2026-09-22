-- #690: Chatter Snow tells volunteer applicants what happens after they apply.
--
-- The slot `get_involved.volunteer_screening` is blank for every tenant by
-- design -- the platform has no business describing a screening process on
-- behalf of an organization it has never met (`docs/legal-basis.md` rule 2).
-- This writes Chatter Snow's own answer into its own row, the same way #864
-- amended its privacy policy: the words are the tenant's, the mechanism is the
-- platform's.
--
-- What it says is the position Chatter Snow's leadership has stated: no
-- background checks are run on volunteers, and roles that pair a volunteer with
-- a participant go through references and a conversation instead. It is
-- deliberately the cheap, honest answer #1320 group B anticipated -- "a
-- defensible interim position ... but that has to be a stated decision, not an
-- omission." **Board ratification is still open**, along with the other two
-- questions in that group (which roles sit in which tier, and who decides a
-- borderline case), so this is not the adopted policy; it is what is true today,
-- said out loud on the form that collects the application. The record is
-- planning/chatter-snow/legal/2026-09-21-volunteer-screening-no-background-checks.md.
--
-- Safe to push ahead of the code that reads the slot. `resolveSiteContent()`
-- skips any row whose key is not in the registry, so on a deployment running
-- older code this row is inert rather than rendered somewhere unintended.
--
-- Scoped by slug rather than `default_tenant_id()`, like
-- 20260908040000_seed_chatter_snow_identity.sql: the demo and platform tenants
-- must not inherit one nonprofit's volunteer process, and on an environment with
-- no `chatter-snow` tenant the CTE matches nothing and this is a no-op.
-- `on conflict do nothing` because a row somebody has already written from
-- Website > Pages is newer than anything a migration knows.

-- Triggers off for the write, the same reasoning as the identity seed:
-- `set_updated_at` would stamp the row with a null actor and `audit_log_row`
-- would write an audit entry for a change no person made.
-- `stamp_site_content_authorship` stays on -- it fills `published_by`, and
-- `published_at` is passed explicitly so the row is published rather than a
-- draft nobody would think to go and publish.

alter table public.site_content
  disable trigger set_updated_at,
  disable trigger audit_log_row;

with tenant as (
  select id from public.tenants where slug = 'chatter-snow'
)
insert into public.site_content (tenant_id, key, value, published_at)
select tenant.id, v.key, v.value::jsonb, now()
from tenant, (values
  ('get_involved.volunteer_screening', '["We''ll read your application and email you about next steps — usually a conversation about what you''d like to do and when you''re free.","We don''t run background checks on volunteers. For roles that pair you with a participant we''ll ask for references and talk it through with you first. If that ever changes we''ll say so here before it applies to anyone."]')
) as v(key, value)
on conflict (tenant_id, key) do nothing;

alter table public.site_content
  enable trigger set_updated_at,
  enable trigger audit_log_row;
