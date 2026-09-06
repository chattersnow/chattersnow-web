-- Multi-tenancy Phase 4 (#707): per-tenant branding and a content model for
-- the public site.
--
-- Part 3 of 3.
--
-- Branding is a handful of `brand.*` rows in app_settings -- the colour
-- tokens globals.css defines, the accent gradient's stops, and the logo --
-- read through two views. The public site reads `public_branding`, resolved
-- from the request host like every other public_* view, so a signed-in admin
-- of one tenant browsing another tenant's site sees that site's colours. The
-- portal shell reads `tenant_branding`, resolved from the session, so the
-- switcher restyles the shell. Nothing here knows which tokens exist: the
-- registry is BRAND_TOKENS in src/lib/branding.ts, and a token that is not
-- set falls back to the stylesheet, which is Chatter Snow's palette.
--
-- Site content is its own table rather than more app_settings rows. The
-- public site's copy is a different kind of thing from a threshold or a
-- toggle: it has its own audience (whoever writes for the site, not whoever
-- administers it), its own screen, and it will grow a version history. The
-- keys and the shape of every value are the registry in
-- src/lib/site-content.ts, with Chatter Snow's copy as the default for each
-- -- so an unset key renders exactly what the page rendered before this
-- migration, and a provisioned tenant starts from a complete site it can
-- rewrite slot by slot. A structured document per legal page (privacy,
-- terms, code of conduct) is stored the same way, since another organization
-- has to publish its own.
--
-- `site_content` is a new resource in the permission catalog, so writing for
-- the site can be granted to a role without handing it Administration.

-- Branding ------------------------------------------------------------------

create or replace view public.public_branding as
select substring(key from length('brand.') + 1) as token, value
from public.app_settings
where key like 'brand.%'
  and tenant_id = public.public_tenant_id();

create or replace view public.tenant_branding as
select substring(key from length('brand.') + 1) as token, value
from public.app_settings
where key like 'brand.%'
  and tenant_id = public.current_tenant_id();

grant select on public.public_branding to anon, authenticated;
grant select on public.tenant_branding to authenticated;

-- The tenant a public request is for, by name: the header, the footer and
-- the page titles need it, and `tenants` itself is only readable by members.
create or replace view public.public_tenant as
select t.id, t.name, t.slug
from public.tenants t
where t.id = public.public_tenant_id();

grant select on public.public_tenant to anon, authenticated;

-- Site content ----------------------------------------------------------------

create table public.site_content (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) default public.default_tenant_id(),
  key text not null check (key ~ '^[a-z0-9_]+(\.[a-z0-9_]+)*$'),
  value jsonb not null,
  updated_at timestamptz not null default now(),
  updated_by uuid default auth.uid() references auth.users(id),
  unique (tenant_id, key),
  unique (tenant_id, id)
);

comment on table public.site_content is
  'Per-tenant copy for the public site, keyed by the slot registry in src/lib/site-content.ts (#707 Phase 4). An unset key renders the registry default.';

create index site_content_tenant_id_idx on public.site_content (tenant_id);

create trigger set_updated_at before update on public.site_content
  for each row execute function public.set_updated_at();

alter table public.site_content enable row level security;

create policy "site_content select" on public.site_content for select to authenticated
  using (
    tenant_id = (select public.current_tenant_id())
    and public.has_permission('site_content', 'view')
  );
create policy "site_content insert" on public.site_content for insert to authenticated
  with check (
    tenant_id = (select public.current_tenant_id())
    and public.has_permission('site_content', 'manage')
  );
create policy "site_content update" on public.site_content for update to authenticated
  using (
    tenant_id = (select public.current_tenant_id())
    and public.has_permission('site_content', 'manage')
  )
  with check (
    tenant_id = (select public.current_tenant_id())
    and public.has_permission('site_content', 'manage')
  );
create policy "site_content delete" on public.site_content for delete to authenticated
  using (
    tenant_id = (select public.current_tenant_id())
    and public.has_permission('site_content', 'manage')
  );

grant select, insert, update, delete on public.site_content to authenticated;

create or replace view public.public_site_content as
select key, value
from public.site_content
where tenant_id = public.public_tenant_id();

grant select on public.public_site_content to anon, authenticated;

insert into public.resources (key, section, label, description, sort_order) values
  ('site_content', 'Administration', 'Public site content', 'The copy on the public website: page headings, introductions, team bios, legal documents', 127);

-- Every tenant's admin role, not just the template's: roles are per tenant
-- since Phase 2 and the join by name reaches all of them.
insert into public.role_permissions (role_id, resource_id, level)
select r.id, res.id, v.level
from (values
  ('admin', 'site_content', 'manage')
) as v(role_name, resource_key, level)
join public.roles r on r.name = v.role_name
join public.resources res on res.key = v.resource_key;

-- Audit: what the public site says is a record worth keeping.
insert into public.audited_tables (table_name) values ('site_content');

create trigger audit_log_row after insert or update or delete on public.site_content
  for each row execute function public.audit_log_row();

-- Self-check, the same one 20260906100000 runs: the new table must not have
-- opened an isolation gap.
do $$
declare
  v_gaps text;
begin
  select string_agg(p.policyname, ', ') into v_gaps
  from pg_policies p
  where p.schemaname = 'public'
    and p.tablename = 'site_content'
    and coalesce(p.qual, '') !~ 'tenant_id'
    and coalesce(p.with_check, '') !~ 'tenant_id';
  if v_gaps is not null then
    raise exception 'site_content policies without a tenant predicate: %', v_gaps;
  end if;
end $$;
