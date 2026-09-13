-- #975: the security contact stops being the platform's and becomes the
-- tenant's.
--
-- `public/.well-known/security.txt` was a static file, so it was served on
-- every host this deployment answers on: Chatter Snow's board named as the
-- disclosure contact, and Chatter Snow's terms named as the governing policy,
-- on demo.rickiecruz.com today and on any customer's domain tomorrow. A
-- well-known path is the first place a researcher or a scanner looks, so a real
-- report about a real customer's data would have been routed to people with no
-- standing to receive it.
--
-- The file is now rendered per tenant from two site content slots
-- (`org.email_security`, `org.security_note`, added in
-- src/lib/site-content.ts) and is not served at all for a tenant that has set
-- no contact. This migration is what keeps chattersnow.org publishing the same
-- document it publishes today.
--
-- The address and the paragraph below are the static file's, word for word.
-- The rest of that file is not gone, it moved to where it belongs: the
-- heading naming the organization is rendered from the tenant's own name, the
-- two paragraphs about the portal's data and about not rummaging in it are
-- true of every tenant and are the platform's to say (`PLATFORM_NOTE` in
-- src/lib/security-txt.ts), and the maintainer note asking someone to bump
-- `Expires` every year is obsolete because the route computes it. What is left
-- is the part only Chatter Snow can say -- who answers, how long it takes, and
-- that there is no bounty.
--
-- 20260908040000 seeded Chatter Snow's other three addresses and said why this
-- one was not among them: it had no slot, because it was published at a
-- well-known path rather than on a page. It has one now, so this is the last
-- row of that migration, arriving late.
--
-- Scoped by slug, so the demo and platform tenants inherit nothing and an
-- environment with no `chatter-snow` tenant is a no-op. `on conflict do
-- nothing` because a value already written from Website > Site Content is
-- newer than a seed, always.
--
-- Triggers off for the write, the same reasoning as 20260908040000:
-- `set_updated_at` would stamp the rows with a null actor and `audit_log_row`
-- would record a change no person made. `stamp_site_content_authorship` stays
-- on -- it fills `published_by`, and `published_at` is passed explicitly.

alter table public.site_content
  disable trigger set_updated_at,
  disable trigger audit_log_row;

with tenant as (
  select id from public.tenants where slug = 'chatter-snow'
)
insert into public.site_content (tenant_id, key, value, published_at)
select tenant.id, v.key, v.value::jsonb, now()
from tenant, (values
  ('org.email_security', '"security@chattersnow.org"'),
  ('org.security_note', '["security@chattersnow.org is a distribution list reaching the board, not a staffed security team: we are a volunteer organization, we have no bounty programme, and a reply may take days rather than hours. Please report anyway."]')
) as v(key, value)
on conflict (tenant_id, key) do nothing;

alter table public.site_content
  enable trigger set_updated_at,
  enable trigger audit_log_row;
