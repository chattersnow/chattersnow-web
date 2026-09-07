-- Multi-tenancy Phase 2 (#707): the two helpers every later Phase 2 migration
-- leans on. Nothing here touches an existing table.
--
-- 1. default_tenant_id() -- the column default for tenant_id.
--
--    current_tenant_id() (20260905180000) answers "which tenant is this signed-in
--    user looking at", and is null whenever there is no user: the anon-facing
--    intake RPCs (register_for_event, submit_contact_message, ...), pg_cron
--    (run_retention_purge), `supabase db reset` seeding, service_role fixtures
--    in the test suites, and migrations themselves. A `not null default
--    current_tenant_id()` column would therefore reject every one of those
--    writes on day one.
--
--    default_tenant_id() falls back to the sole active tenant when exactly one
--    exists -- the same guard ensure_tenant_membership() uses -- so on today's
--    single-tenant database every sessionless writer keeps working unchanged.
--    On a database with two active tenants the fallback is null and an
--    unscoped insert fails closed on the not-null constraint rather than
--    landing in somebody else's organisation. Phase 3 replaces the fallback
--    with resolution from the request host; callers do not change.
--
--    Deliberately NOT used inside has_permission() and the other
--    authorization helpers: those must answer for the tenant the user has
--    actually selected, and a null there must mean "no permissions", never
--    "whichever tenant happens to be the only one".
--
-- 2. set_tenant_id_from_role() -- the trigger that stamps tenant_id on
--    user_roles, role_permissions and pending_role_grants from the role they
--    point at. Every migration that seeds permissions for a new resource does
--    `... join public.roles r on r.name = ...`, and in a migration there is no
--    session, so a default cannot resolve once there is more than one tenant.
--    Deriving the value from the role makes those inserts correct on any
--    number of tenants by construction, and is what lets the composite
--    foreign keys in 20260906030000 hold without anyone having to think about
--    it. Unconditional: column defaults are applied before BEFORE triggers
--    run, so an "only if null" guard would never fire.

create or replace function public.default_tenant_id()
returns uuid
language sql
security definer
set search_path = public
stable
as $$
  select coalesce(
    public.current_tenant_id(),
    (select t.id
       from public.tenants t
      where t.status = 'active'
        and (select count(*) from public.tenants where status = 'active') = 1)
  );
$$;

comment on function public.default_tenant_id() is
  'Tenant for a new row: the caller''s current tenant, else the sole active tenant, else null. Column default for tenant_id; Phase 3 of #707 replaces the fallback with host resolution.';

grant execute on function public.default_tenant_id() to anon, authenticated, service_role;

create or replace function public.set_tenant_id_from_role()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  select r.tenant_id into new.tenant_id
  from public.roles r
  where r.id = new.role_id;
  return new;
end;
$$;

comment on function public.set_tenant_id_from_role() is
  'BEFORE INSERT OR UPDATE OF role_id: tenant_id follows the referenced role. Attached to user_roles, role_permissions and pending_role_grants in 20260906010000.';
