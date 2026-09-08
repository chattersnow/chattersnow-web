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
--   alter database postgres set app.initial_tenant_name = 'Riverside Trails';
--   alter database postgres set app.initial_tenant_slug = 'riverside-trails';
--
-- The defaults are deliberately nobody's organization (#795 Phase 3). They used
-- to be 'Chatter Snow' / 'chatter-snow', which made one client the platform's
-- bootstrap identity: a fresh database anywhere -- a white-label deployment, a
-- contributor's laptop, a CI run -- came up named after them.
--
-- They cannot simply be dropped in favour of *requiring* the settings, which is
-- what the ticket first asked for. `supabase db reset` drops and recreates the
-- database, so an `alter database postgres set ...` is wiped before migrations
-- run and there is no hook to set one first. Nor can this migration skip when
-- unset, the way #708's admin bootstrap does: ensure_tenant_membership() only
-- auto-joins when exactly one active tenant exists and Phase 2's
-- `default current_tenant_id()` needs one to resolve to, so a database with no
-- tenant is unusable rather than merely un-bootstrapped. A fallback is the only
-- shape that works; making it neutral is the part that matters.
--
-- Chatter Snow's production tenant is unaffected: this migration ran there long
-- ago and migrations do not re-run, so its row still says 'chatter-snow'. What
-- changes is what a *new* database bootstraps as -- local, CI, and any future
-- deployment -- which is why the seeding migrations that write Chatter Snow's
-- own copy (20260908040000, 20260908050000, 20260908060000, 20260908070000)
-- are scoped `where slug = 'chatter-snow'` and now correctly no-op locally.
-- supabase/seed.sql gives local and CI their own copy instead.
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
    'Example Nonprofit'
  );
  v_slug := coalesce(
    nullif(btrim(coalesce(current_setting('app.initial_tenant_slug', true), '')), ''),
    'example-nonprofit'
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
