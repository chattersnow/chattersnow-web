-- Multi-tenancy Phase 1 (#707): give every existing database exactly one
-- tenant, and put every existing account in it.
--
-- This has to run everywhere, not just in production. ensure_tenant_membership()
-- (20260905180000) only auto-joins a user when the database contains exactly
-- one active tenant, and Phase 2's `default current_tenant_id()` needs a
-- tenant to resolve to -- so a database with none is unusable, and unlike the
-- admin bootstrap in #708 this cannot default to a no-op.
--
-- The name and slug are Organization Material under
-- decisions/2026-09-05-portal-ip-ownership.md, so they are settings with
-- defaults rather than literals. A white-label deployment overrides them
-- before `supabase db push`, the same way #708's admin bootstrap works:
--
--   alter database postgres set app.initial_tenant_name = 'Example Nonprofit';
--   alter database postgres set app.initial_tenant_slug = 'example-nonprofit';
--
-- The defaults below are the one remaining Chatter-specific literal in this
-- migration set. When the Core/Organization split is executed, dropping them
-- and requiring the settings is a one-line change -- which is the point of
-- routing through a setting at all.
--
-- Idempotent, so it is safe on a fresh database and on one that has already
-- run it.

do $$
declare
  v_name text;
  v_slug text;
  v_tenant_id uuid;
begin
  v_name := coalesce(
    nullif(btrim(coalesce(current_setting('app.initial_tenant_name', true), '')), ''),
    'Chatter Snow'
  );
  v_slug := coalesce(
    nullif(btrim(coalesce(current_setting('app.initial_tenant_slug', true), '')), ''),
    'chatter-snow'
  );

  insert into public.tenants (name, slug, plan, status)
  values (v_name, v_slug, 'internal', 'active')
  on conflict (slug) do nothing;

  select id into v_tenant_id from public.tenants where slug = v_slug;

  raise notice 'Initial tenant: % (%)', v_name, v_slug;

  -- Every account that exists at this point predates tenancy, so it belongs
  -- to this tenant by definition. created_by is left null: a backfill has no
  -- actor, and claiming one would make the audit trail say something untrue.
  insert into public.tenant_memberships (user_id, tenant_id, kind)
  select u.id, v_tenant_id, 'member'
  from auth.users u
  on conflict (user_id, tenant_id) do nothing;
end $$;
