-- Multi-tenancy Phase 5c (#707): let the operator run the platform from the
-- portal instead of a service_role shell.
--
-- Everything here already exists as a `service_role` function -- provisioning,
-- the domain, the status, the export (docs/tenants.md is the runbook). What is
-- missing is a way to reach any of it as a signed-in person, and the reason it
-- was missing is the reason this migration is careful: #707 has no super-admin
-- by design. `decisions/2026-09-05-multi-tenancy-model.md` rejected one because
-- a defect in a single bypass function becomes total cross-tenant exposure, and
-- because a standing cross-tenant read is exactly what a nonprofit asks about
-- before putting donor records in our database.
--
-- So this is not a bypass, and the shape is what keeps it honest:
--
--   * These RPCs touch tenant METADATA and provisioning. Not one of them reads
--     or writes a customer row. `tenant_data_snapshot()` is the exception that
--     proves it -- an export is the operator's existing service_role power, and
--     it is a download, not a view into the portal.
--   * Every policy predicate in the schema stays `tenant_id =
--     current_tenant_id() and has_permission(...)`. Nothing here adds an `or`
--     branch to has_permission() or to any policy, so tenant_isolation_gaps()
--     and the isolation suite keep meaning what they meant.
--   * The gate is three conditions, not one, and the second is the load-bearing
--     one: holding the permission is not enough, the caller has to be inside
--     the internal tenant. Without that, any tenant's admin could grant
--     themselves `platform_tenants` in their own matrix -- they own their
--     matrix -- and walk straight in.
--   * The third keeps a support grant out. Support staff hold a time-boxed
--     membership in a customer's tenant (Phase 4); one in the internal tenant
--     must not become a route to every other tenant's metadata.
--
-- Deliberately NOT here: deletion, which stays the two-step CLI
-- (`tenant:archive` then `tenant:delete --confirm <slug>`) so it remains a
-- considered act, and support grants, which stay the customer's to issue.
-- The list below reports open support grants read-only, so the operator can see
-- who is in without being able to let themselves in.

insert into public.resources (key, section, label, description, sort_order) values
  ('platform_tenants', 'Administration', 'Platform tenants',
   'Provision and administer the organizations on the platform. Resolves only inside the platform''s own tenant.',
   128);

-- Every tenant's admin role, not just the template's -- roles are per tenant
-- since Phase 2 and the join by name reaches all of them. Granting it outside
-- the internal tenant resolves to nothing, which is the point: the second half
-- of the gate is what decides, so a stray grant is inert rather than dangerous.
insert into public.role_permissions (role_id, resource_id, level)
select r.id, res.id, v.level
from (values
  ('admin', 'platform_tenants', 'manage')
) as v(role_name, resource_key, level)
join public.roles r on r.name = v.role_name
join public.resources res on res.key = v.resource_key;

-- The gate, defined once so there is one thing to read and one thing to audit.
create or replace function public.is_platform_operator()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select public.has_permission('platform_tenants', 'manage')
     and public.current_membership_kind() = 'member'
     and exists (
       select 1 from public.tenants t
       where t.id = (select public.current_tenant_id())
         and t.plan = 'internal'
     );
$$;

comment on function public.is_platform_operator() is
  'Whether the caller may administer tenants: holds platform_tenants:manage, is a full member (not a support grant), and is inside a tenant on the internal plan. All three, always.';

grant execute on function public.is_platform_operator() to authenticated;

create or replace function public.require_platform_operator()
returns void
language plpgsql
security definer
set search_path = public
stable
as $$
begin
  if not public.is_platform_operator() then
    raise exception 'Not authorized';
  end if;
end;
$$;

-- The wrappers. Each is a thin authenticated front door onto a Phase 4
-- function that is otherwise service_role only; those grants are untouched.
-- Ownership is what makes this work: these are owned by `postgres`, which owns
-- provision_tenant() and tenant_data_snapshot() too, and an owner keeps its own
-- execute privilege through `revoke ... from public`.

create or replace function public.platform_list_tenants()
returns table (
  id uuid,
  slug text,
  name text,
  status text,
  plan text,
  custom_domain text,
  member_count integer,
  support_grant_count integer,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = public
stable
as $$
begin
  perform public.require_platform_operator();

  return query
    select t.id, t.slug, t.name, t.status, t.plan, t.custom_domain,
           (select count(*)::integer from public.tenant_memberships m
             where m.tenant_id = t.id and m.kind = 'member'),
           -- Read-only, and only the live ones. The operator can see that a
           -- customer has support open and until when; issuing or ending it
           -- stays the customer's (Phase 4).
           (select count(*)::integer from public.tenant_memberships m
             where m.tenant_id = t.id and m.kind = 'support'
               and (m.expires_at is null or m.expires_at > now())),
           t.created_at
      from public.tenants t
     order by t.created_at;
end;
$$;

grant execute on function public.platform_list_tenants() to authenticated;

create or replace function public.platform_provision_tenant(
  p_name text,
  p_slug text,
  p_custom_domain text default null,
  p_plan text default 'white_label',
  p_admin_email text default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.require_platform_operator();

  -- No p_template_tenant_id: provision_tenant() defaults to the oldest
  -- internal tenant, which is the platform default matrix by construction.
  -- Choosing a template is choosing which organization's permission matrix a
  -- customer inherits, and that is not a dropdown.
  return public.provision_tenant(
    p_name => p_name,
    p_slug => p_slug,
    p_custom_domain => nullif(lower(btrim(coalesce(p_custom_domain, ''))), ''),
    p_plan => p_plan,
    p_admin_email => nullif(btrim(coalesce(p_admin_email, '')), ''),
    p_template_tenant_id => null
  );
end;
$$;

grant execute on function public.platform_provision_tenant(text, text, text, text, text) to authenticated;

create or replace function public.platform_set_tenant_domain(
  p_tenant_id uuid,
  p_custom_domain text
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.require_platform_operator();

  -- Lowercased here rather than relying on the caller: tenants.custom_domain
  -- has a check constraint that refuses anything else, and a 400 from a check
  -- constraint is a worse answer than just doing it.
  update public.tenants
     set custom_domain = nullif(lower(btrim(coalesce(p_custom_domain, ''))), '')
   where id = p_tenant_id;

  if not found then
    raise exception 'No such tenant';
  end if;
end;
$$;

grant execute on function public.platform_set_tenant_domain(uuid, text) to authenticated;

create or replace function public.platform_set_tenant_status(
  p_tenant_id uuid,
  p_status text
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_plan text;
begin
  perform public.require_platform_operator();

  if p_status not in ('active', 'suspended', 'archived') then
    raise exception 'Unknown tenant status: %', p_status;
  end if;

  select plan into v_plan from public.tenants where id = p_tenant_id;
  if v_plan is null then
    raise exception 'No such tenant';
  end if;

  -- Suspending or archiving the internal tenant takes this page off the air
  -- along with everything else, and there is no second door: platform access
  -- is a membership in that tenant, not a bypass. The CLI can still do it.
  if v_plan = 'internal' and p_status <> 'active' then
    raise exception 'The platform tenant cannot be suspended or archived from here';
  end if;

  update public.tenants set status = p_status where id = p_tenant_id;
end;
$$;

grant execute on function public.platform_set_tenant_status(uuid, text) to authenticated;

create or replace function public.platform_export_tenant(p_tenant_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.require_platform_operator();
  return public.tenant_data_snapshot(p_tenant_id);
end;
$$;

grant execute on function public.platform_export_tenant(uuid) to authenticated;

-- No new table, so no new policy and no new foreign key -- but run the
-- 20260906100000 self-check anyway. It is cheap, and this is exactly the kind
-- of migration (new resource, new definer functions) where the assumption
-- "I did not touch a policy" is worth verifying rather than believing.
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
  )
  select string_agg(gap, ', ') into v_gaps from gaps;

  if v_gaps is not null then
    raise exception 'Tenant isolation gaps remain: %', v_gaps;
  end if;
end $$;
