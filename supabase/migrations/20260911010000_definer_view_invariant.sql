-- #887: record and enforce the security definer view pattern.
--
-- Supabase's database advisor reports lint 0010_security_definer_view (ERROR)
-- against every view in `public` that is not `security_invoker`. Eighteen of
-- ours are not, and none of them is an accident: a definer view is the only
-- mechanism this schema has for the two audiences RLS here was never written
-- for.
--
--   Family A -- `anon` reading a table whose select policy admits
--   `authenticated` only. `events`, `calendar_items`, `calendar_categories`,
--   `event_programs`, `event_sponsors`, `inventory_items`,
--   `volunteer_role_types`, `site_content` and `tenants` all say
--   `for select to authenticated`, and the public website reads as `anon`. An
--   invoker-rights view over any of them returns zero rows and the site
--   renders empty.
--
--   Family B -- a narrow slice of `app_settings` widened past its select
--   policy, which requires one of six `manage` permissions
--   (20260906040000_tenant_scope_app_settings_and_views.sql:30). Brand colours,
--   the fiscal-year start month and the notification kill switch all live in
--   that one table; each view hands one key prefix to a wider audience --
--   `anon`, or "any signed-in member regardless of permission" -- without
--   widening that OR-chain again.
--
-- Flipping them to `security_invoker` means giving those audiences real select
-- policies on the base tables instead: nine `anon` policies repeating the
-- visibility/status/tenant predicate that today lives in one place per view,
-- and -- for Family B -- `anon` on `app_settings` itself, a far wider blast
-- radius than a two-column view. Considered and declined; the advisor will
-- keep reporting these eighteen forever, and Supabase documents no way to
-- suppress a finding. docs/technical-spec.md §6 carries the decision.
--
-- What is real is the gap the pattern leaves. tenant_isolation_gaps()
-- (20260906100000) is the invariant that stops a future migration from
-- silently reopening a tenant leak, and it looks at policies and foreign keys
-- only -- while a definer view is precisely the construct that bypasses the
-- policies it checks. A new public_* view that forgets public_tenant_id(), or
-- an existing one that gains a write grant, is a cross-tenant leak nothing in
-- this repository would catch. This migration adds the two kinds that close
-- it, comments all eighteen views, and marks the anon-facing ones
-- `security_barrier`.

-- 1. The invariant.
--
-- Two new kinds alongside `policy` and `fk`:
--
--   view        a definer view in `public` that reads at least one table
--               carrying tenant_id and whose definition mentions neither
--               public_tenant_id() nor current_tenant_id(). Direct table
--               dependencies only: a view built on another view inherits that
--               view's predicate, and that view is checked on its own.
--   view_grant  a definer view in `public` with INSERT, UPDATE or DELETE
--               reachable by `anon` or `authenticated`. All eighteen are
--               SELECT-only today and nothing enforced it; one `grant all`
--               would hand out RLS-free writes to the base table --
--               20260908000000_site_content_drafts.sql:71 already warns about
--               exactly that with no check behind it.
create or replace function public.tenant_isolation_gaps()
returns table (kind text, table_name text, detail text)
language sql
security definer
set search_path = public
stable
as $$
  with tenant_tables as (
    select c.oid, c.relname
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    join pg_attribute a on a.attrelid = c.oid and a.attname = 'tenant_id' and not a.attisdropped
    where n.nspname = 'public'
      and c.relkind = 'r'
  ),
  definer_views as (
    select c.oid, c.relname
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind = 'v'
      and not exists (
        select 1
        from unnest(coalesce(c.reloptions, '{}'::text[])) opt
        where opt ~* '^security_invoker=(true|on|1|yes)$'
      )
  )
  select 'policy'::text, p.tablename::text, p.policyname::text
  from pg_policies p
  join tenant_tables t on t.relname = p.tablename
  where public.is_admin()
    and p.schemaname = 'public'
    and coalesce(p.qual, '') !~ 'tenant_id'
    and coalesce(p.with_check, '') !~ 'tenant_id'
    and not (p.tablename = 'user_roles' and p.policyname = 'user views own roles')

  union all

  select 'fk'::text, ch.relname::text, c.conname::text
  from pg_constraint c
  join tenant_tables ch on ch.oid = c.conrelid
  join tenant_tables pa on pa.oid = c.confrelid
  join pg_attribute fa on fa.attrelid = c.confrelid and fa.attnum = c.confkey[1]
  where public.is_admin()
    and c.contype = 'f'
    and array_length(c.conkey, 1) = 1
    and fa.attname = 'id'

  union all

  select 'view'::text, v.relname::text,
         'security definer view over a tenant table with no tenant predicate'::text
  from definer_views v
  where public.is_admin()
    and exists (
      select 1
      from pg_depend d
      join pg_rewrite r on r.oid = d.objid and r.ev_class = v.oid
      where d.classid = 'pg_rewrite'::regclass
        and d.refclassid = 'pg_class'::regclass
        and d.refobjid in (select oid from tenant_tables)
    )
    and pg_get_viewdef(v.oid) !~ '(public_tenant_id|current_tenant_id)\(\)'

  union all

  select 'view_grant'::text, v.relname::text, g.rolname || ' has ' || p.priv
  from definer_views v
  cross join (values ('anon'), ('authenticated')) as g(rolname)
  cross join (values ('INSERT'), ('UPDATE'), ('DELETE')) as p(priv)
  where public.is_admin()
    and exists (select 1 from pg_roles where rolname = g.rolname)
    and has_table_privilege(g.rolname, v.oid, p.priv)

  order by 1, 2, 3;
$$;

comment on function public.tenant_isolation_gaps() is
  'Policies on tenant tables with no tenant predicate, single-column foreign keys between tenant tables, security definer views over tenant tables with no tenant predicate, and write grants on those views. Empty on a correctly scoped schema; asserted empty by the isolation suite.';

revoke execute on function public.tenant_isolation_gaps() from public;
grant execute on function public.tenant_isolation_gaps() to authenticated, service_role;

-- 2. Why each definer view is one, where the next reader -- or the next
-- advisor run -- will look. Four carried a comment already; they keep what
-- they said and gain the rationale.

-- Family A: `anon` over a table whose select policy admits `authenticated`.
comment on view public.public_events is
  'Published, public events of the tenant the request host resolves to. Security definer by design (#887): `events` has no `anon` select policy, so an invoker-rights view would render the public site empty. Isolation is this view body -- tenant_id = public_tenant_id(), visibility/status, and an explicit column list that omits the internal fields.';

comment on view public.public_calendar_items is
  'The resolved tenant''s public community calendar: active/complete public calendar_items, unioned with its published public events. Security definer by design (#887): neither `calendar_items` nor `events` has an `anon` select policy. Isolation is tenant_id = public_tenant_id() on both arms plus the visibility/status filters; the editorial-guardrail columns are outside the column list.';

comment on view public.public_calendar_categories is
  'The resolved tenant''s active calendar categories, for the public community calendar filter (#834). Security definer by design (#887): `calendar_categories` admits `authenticated` only. Isolation is tenant_id = public_tenant_id() plus is_active.';

comment on view public.public_event_programs is
  'The programs behind the resolved tenant''s published public events. Security definer by design (#887): `event_programs`, `programs` and `events` all admit `authenticated` only. Isolation is e.tenant_id = public_tenant_id() plus the event''s visibility/status; only the program''s id and name are exposed.';

comment on view public.public_event_sponsors is
  'Sponsors the resolved tenant has marked public on its published public events. Security definer by design (#887): `event_sponsors`, `people` and `events` all admit `authenticated` only, and `people` is the donor directory. Isolation is e.tenant_id = public_tenant_id(), es.is_public and the event''s visibility/status; the join to `people` exposes name, logo_url and website and nothing else.';

comment on view public.public_gear_catalog is
  'The resolved tenant''s gear library: available gear_library inventory with its category and group labels denormalized in. Security definer by design (#887): `inventory_items` and the category vocabulary admit `authenticated` only. Isolation is ii.tenant_id = public_tenant_id() plus status/intended_use; face value, notes and every other internal column are outside the column list.';

comment on view public.public_volunteer_role_types is
  'The resolved tenant''s public volunteer opportunities (#60). Security definer by design (#887): `volunteer_role_types` admits `authenticated` only. Isolation is tenant_id = public_tenant_id() plus is_public.';

comment on view public.public_site_content is
  'The resolved tenant''s published public site copy. Security definer by design (#887): since #793 `site_content` admits `authenticated` only and its value column is not writable by one at all. Isolation is tenant_id = public_tenant_id() plus a published value; `draft_value` is outside the column list, which is the whole point of the view. A write grant here would bypass both RLS and those column grants in one line -- tenant_isolation_gaps() now refuses one.';

comment on view public.public_site_images is
  'The resolved tenant''s published site images, keyed by the slot registry in src/lib/site-images.ts. Security definer by design (#887), same reasoning as public_site_content, over the site_images.% key prefix.';

comment on view public.public_tenant_modules is
  'Module entitlements for the tenant the request host resolves to (#902). The public-site counterpart to tenant_module_enabled(), which answers only for a signed-in member. Security definer by design (#887): `tenant_modules` and `tenants` admit `authenticated` only. Isolation is public_tenant_id() on both joins; with no resolvable host every module falls back to its own default_enabled, which is a registry fact rather than any tenant''s configuration.';

comment on view public.public_tenant is
  'The tenant a public request is for: the header, footer, page titles, the portal login''s link back to the public site and its demo button all need it, and `tenants` itself is only readable by members. One row, always the tenant that owns the requested host. Security definer by design (#887): an invoker-rights view would leave every anon page without a name or a brand. Isolation is id = public_tenant_id(); the column list is id, name, slug, custom_domain and plan.';

-- Family B: one key prefix of `app_settings`, whose single select policy
-- requires one of six `manage` permissions.
comment on view public.public_branding is
  'The resolved tenant''s brand tokens for the public site (registry src/lib/branding.ts). Security definer by design (#887): `app_settings` has one select policy requiring a `manage` permission, and everything from brand colours to approval thresholds lives in that table. This view hands `anon` the brand.% prefix rather than widening that OR-chain. Isolation is tenant_id = public_tenant_id().';

comment on view public.public_page_visibility is
  'Which public pages the resolved tenant has switched on (#594). Security definer by design (#887), same reasoning as public_branding, over the page_visibility.% key prefix.';

comment on view public.public_legal_publication is
  'Per-tenant legal document publication state, keyed by the registry in src/lib/legal-documents.ts (#859). An absent row means the document is not in force and its route 404s; the privacy policy is served regardless. Security definer by design (#887), same reasoning as public_branding, over the legal_publication.% key prefix.';

comment on view public.public_site_layout is
  'Per-tenant public site layout settings, keyed by the slot registry in src/lib/site-layout.ts (#846). An unset slot renders the registry default. Security definer by design (#887), same reasoning as public_branding, over the layout.% key prefix.';

comment on view public.tenant_branding is
  'The current tenant''s brand tokens for the portal shell. Security definer by design (#887): the audience is any signed-in member, and `app_settings`'' select policy requires one of six `manage` permissions -- a volunteer would otherwise see an unbranded portal. Isolation is tenant_id = current_tenant_id() over the brand.% prefix.';

comment on view public.org_fiscal_year is
  'The current tenant''s fiscal-year start month, for the dashboard and every year-to-date figure. Security definer by design (#887): the reasoning is written out at 20260905030000_define_fiscal_year.sql:35 -- the audience is any signed-in member, not only the `manage` holders `app_settings`'' select policy admits. Isolation is tenant_id = current_tenant_id().';

comment on view public.org_notification_settings is
  'The current tenant''s outbound email kill switch, so /portal/account can explain why an enabled toggle is sending nothing. Security definer by design (#887): the reasoning is written out at 20260906140000_notification_preferences_and_deliveries.sql:205 -- every member needs the answer, not only the `manage` holders. Isolation is tenant_id = current_tenant_id().';

-- 3. security_barrier on the anon-facing views, so the view's own tenant and
-- publication predicates always run before a caller-supplied filter. The
-- practical risk today is small -- `anon` cannot define functions and
-- PostgREST filters use leakproof operators -- so this is hardening rather
-- than a fix, and these views return tens to hundreds of rows, where losing
-- predicate pushdown costs nothing measurable.
alter view public.public_events set (security_barrier = true);
alter view public.public_calendar_items set (security_barrier = true);
alter view public.public_calendar_categories set (security_barrier = true);
alter view public.public_event_programs set (security_barrier = true);
alter view public.public_event_sponsors set (security_barrier = true);
alter view public.public_gear_catalog set (security_barrier = true);
alter view public.public_volunteer_role_types set (security_barrier = true);
alter view public.public_site_content set (security_barrier = true);
alter view public.public_site_images set (security_barrier = true);
alter view public.public_tenant set (security_barrier = true);
alter view public.public_tenant_modules set (security_barrier = true);
alter view public.public_branding set (security_barrier = true);
alter view public.public_page_visibility set (security_barrier = true);
alter view public.public_legal_publication set (security_barrier = true);
alter view public.public_site_layout set (security_barrier = true);

-- 4. Close the gap the invariant just found on the hosted database.
--
-- Locally none of these views is writable by either role, because
-- supabase/config.toml leaves `auto_expose_new_tables` unset -- the CLI's
-- current default, under which a new entity in `public` reaches `anon` and
-- `authenticated` only through an explicit GRANT, and the only GRANT these
-- views ever got is SELECT. The hosted project predates that default and
-- still auto-exposes, so all eighteen were created there with ALL privileges
-- to both roles. A definer view runs as
-- its owner and is auto-updatable when its body is simple, so `anon` holding
-- UPDATE on public_site_content is a write to any tenant's site copy with no
-- RLS in the way -- exactly the hole the view_grant kind was added to refuse,
-- and the reason the first push of this migration aborted here rather than
-- passing as it does against a local reset.
--
-- Dynamic rather than eighteen REVOKE lines: it covers whatever the set of
-- definer views is when this runs, and it is a no-op wherever the grants were
-- never made. SELECT is untouched -- that is what these views are for.
do $$
declare
  v_view record;
begin
  for v_view in
    select c.oid::regclass as ident
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind = 'v'
      and not exists (
        select 1
        from unnest(coalesce(c.reloptions, '{}'::text[])) opt
        where opt ~* '^security_invoker=(true|on|1|yes)$'
      )
  loop
    execute format(
      'revoke insert, update, delete on %s from anon, authenticated',
      v_view.ident
    );
  end loop;
end $$;

-- 5. Self-check, in the style 20260906100000 already uses: refuse to leave a
-- gap behind this migration. is_admin() is false in a migration, so the
-- queries are repeated without the gate.
do $$
declare
  v_gaps text;
begin
  with tenant_tables as (
    select c.oid, c.relname
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    join pg_attribute a on a.attrelid = c.oid and a.attname = 'tenant_id' and not a.attisdropped
    where n.nspname = 'public' and c.relkind = 'r'
  ),
  definer_views as (
    select c.oid, c.relname
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind = 'v'
      and not exists (
        select 1
        from unnest(coalesce(c.reloptions, '{}'::text[])) opt
        where opt ~* '^security_invoker=(true|on|1|yes)$'
      )
  ),
  gaps as (
    select 'policy ' || p.tablename || '."' || p.policyname || '"' as gap
    from pg_policies p
    join tenant_tables t on t.relname = p.tablename
    where p.schemaname = 'public'
      and coalesce(p.qual, '') !~ 'tenant_id'
      and coalesce(p.with_check, '') !~ 'tenant_id'
      and not (p.tablename = 'user_roles' and p.policyname = 'user views own roles')
    union all
    select 'fk ' || ch.relname || '.' || c.conname
    from pg_constraint c
    join tenant_tables ch on ch.oid = c.conrelid
    join tenant_tables pa on pa.oid = c.confrelid
    join pg_attribute fa on fa.attrelid = c.confrelid and fa.attnum = c.confkey[1]
    where c.contype = 'f'
      and array_length(c.conkey, 1) = 1
      and fa.attname = 'id'
    union all
    select 'view ' || v.relname
    from definer_views v
    where exists (
        select 1
        from pg_depend d
        join pg_rewrite r on r.oid = d.objid and r.ev_class = v.oid
        where d.classid = 'pg_rewrite'::regclass
          and d.refclassid = 'pg_class'::regclass
          and d.refobjid in (select oid from tenant_tables)
      )
      and pg_get_viewdef(v.oid) !~ '(public_tenant_id|current_tenant_id)\(\)'
    union all
    select 'view_grant ' || v.relname || ' ' || g.rolname || ' ' || p.priv
    from definer_views v
    cross join (values ('anon'), ('authenticated')) as g(rolname)
    cross join (values ('INSERT'), ('UPDATE'), ('DELETE')) as p(priv)
    where exists (select 1 from pg_roles where rolname = g.rolname)
      and has_table_privilege(g.rolname, v.oid, p.priv)
  )
  select string_agg(gap, ', ') into v_gaps from gaps;

  if v_gaps is not null then
    raise exception 'Tenant isolation gaps remain: %', v_gaps;
  end if;
end $$;

-- Every definer view in `public` carries a comment explaining the choice.
do $$
declare
  v_missing text;
begin
  select string_agg(c.relname, ', ' order by c.relname) into v_missing
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relkind = 'v'
    and not exists (
      select 1
      from unnest(coalesce(c.reloptions, '{}'::text[])) opt
      where opt ~* '^security_invoker=(true|on|1|yes)$'
    )
    and coalesce(obj_description(c.oid, 'pg_class'), '') = '';

  if v_missing is not null then
    raise exception 'Security definer views with no comment explaining why: %', v_missing;
  end if;
end $$;
