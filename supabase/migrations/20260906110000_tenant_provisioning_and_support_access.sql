-- Multi-tenancy Phase 4 (#707): serve more than one tenant.
--
-- Part 1 of 3: provisioning, support access, and what "removing a user" means
-- once an account can belong to several tenants.
--
-- 1. provision_tenant() -- one call creates a tenant that is ready to sign
--    into: the five seeded roles with the whole permission matrix, the
--    catalog defaults a fresh database gets from migrations, the platform
--    default settings, and a staged admin grant for the first person in.
--
--    The matrix is copied from a *template tenant* rather than re-typed here.
--    Twelve migrations seed role_permissions with `join roles r on r.name =
--    ...`, which since Phase 2 seeds every tenant that has a role by that
--    name, so the oldest `internal` tenant always holds the current platform
--    default for the five seeded roles. Copying it is what keeps this
--    function correct when the next migration adds a resource: nothing here
--    has to change. Custom roles the template tenant added itself are not
--    copied -- they are that tenant's, not the platform's.
--
--    service_role only. Provisioning is a platform operation, the same as it
--    has been since Phase 1; the operator runs `bun run tenant:provision`
--    (scripts/provision-tenant.ts), which calls this and mints the first
--    admin's invite link.
--
-- 2. Support access is granted by the tenant, not taken by the platform.
--    Phase 1 made support grants service_role only, with the UI deferred. The
--    UI lands here with a deliberate choice about who operates it: a tenant's
--    own admin issues and revokes support grants for their tenant. That keeps
--    the two properties the model was built on -- the grant is still a
--    time-boxed membership row inside the isolation suite, not a bypass, and
--    no platform user has standing access anywhere -- and adds a third: the
--    customer consents to every support session, sees who is in and until
--    when, and can end it early. The service_role path stays documented for
--    an admin who has locked themselves out (docs/tenants.md).
--
--    The table policies from Phase 2 are untouched: they still forbid
--    touching a support row through the table, so the RPCs below are the
--    only path, and they refuse a caller whose own membership is a support
--    grant -- support staff cannot mint or extend support access for anyone,
--    themselves included.
--
-- 3. remove_tenant_member() and tenant-scoped deactivation. deactivated_users
--    is platform-wide (one row per auth account), so a tenant admin
--    deactivating an account that also belongs to another tenant cut it out
--    of both -- flagged in Phase 2 as a Phase 4 decision. Decided: a tenant
--    admin can deactivate an account only when this tenant is the only one
--    it belongs to; otherwise the users screen offers "remove from
--    organization", which drops the roles and membership here and touches
--    nothing elsewhere. list_portal_users() reports which case each row is.

-- 1. Provisioning ------------------------------------------------------------

create or replace function public.provision_tenant(
  p_name text,
  p_slug text,
  p_custom_domain text default null,
  p_plan text default 'white_label',
  p_admin_email text default null,
  p_template_tenant_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant_id uuid;
  v_template_id uuid;
  v_admin_role_id uuid;
begin
  if nullif(btrim(coalesce(p_name, '')), '') is null then
    raise exception 'TENANT_NAME_REQUIRED';
  end if;

  v_template_id := coalesce(
    p_template_tenant_id,
    (select t.id from public.tenants t where t.plan = 'internal' order by t.created_at limit 1)
  );
  if v_template_id is null then
    raise exception 'TEMPLATE_TENANT_NOT_FOUND';
  end if;
  if not exists (
    select 1 from public.roles r where r.tenant_id = v_template_id and r.name = 'admin'
  ) then
    raise exception 'TEMPLATE_TENANT_HAS_NO_ADMIN_ROLE';
  end if;

  -- The slug and domain checks on the table do the validating; this only
  -- normalises what they will see.
  insert into public.tenants (name, slug, custom_domain, plan, status)
  values (
    btrim(p_name),
    lower(btrim(p_slug)),
    nullif(lower(btrim(coalesce(p_custom_domain, ''))), ''),
    p_plan,
    'active'
  )
  returning id into v_tenant_id;

  -- Roles: the five the platform seeds (20260821080000), by name from the
  -- template. A tenant that renamed or dropped one changes what it copies;
  -- the admin role is the one that is required (checked above), because the
  -- staged grant below and every administration screen depend on it.
  insert into public.roles (tenant_id, name, description)
  select v_tenant_id, r.name, r.description
  from public.roles r
  where r.tenant_id = v_template_id
    and r.name in ('admin', 'event_coordinator', 'finance', 'board', 'volunteer');

  -- The matrix for those roles. set_tenant_id_from_role stamps tenant_id.
  insert into public.role_permissions (role_id, resource_id, level)
  select nr.id, rp.resource_id, rp.level
  from public.role_permissions rp
  join public.roles tr on tr.id = rp.role_id and tr.tenant_id = v_template_id
  join public.roles nr on nr.tenant_id = v_tenant_id and nr.name = tr.name;

  -- Catalog defaults that migrations give a fresh database: the inventory
  -- category vocabulary (20260904150000), the agenda templates
  -- (20260826050000) and the content brief templates (20260824105000).
  -- Copied whole from the template, current versions included, so a tenant
  -- starts with a working vocabulary rather than an empty picker. Everything
  -- else a migration seeded -- the observance calendar, the nonprofit-status
  -- milestones -- describes the template tenant itself and is not copied.
  insert into public.inventory_category_groups (tenant_id, key, label, sort_order, is_active)
  select v_tenant_id, g.key, g.label, g.sort_order, g.is_active
  from public.inventory_category_groups g
  where g.tenant_id = v_template_id;

  insert into public.inventory_categories (tenant_id, group_id, key, label, sort_order, is_active)
  select v_tenant_id, ng.id, c.key, c.label, c.sort_order, c.is_active
  from public.inventory_categories c
  join public.inventory_category_groups og on og.id = c.group_id
  join public.inventory_category_groups ng on ng.tenant_id = v_tenant_id and ng.key = og.key
  where c.tenant_id = v_template_id;

  insert into public.agenda_templates (tenant_id, key, name, description, is_active)
  select v_tenant_id, t.key, t.name, t.description, t.is_active
  from public.agenda_templates t
  where t.tenant_id = v_template_id;

  insert into public.agenda_template_versions (tenant_id, template_id, version, sections)
  select v_tenant_id, nt.id, v.version, v.sections
  from public.agenda_template_versions v
  join public.agenda_templates ot on ot.id = v.template_id
  join public.agenda_templates nt on nt.tenant_id = v_tenant_id and nt.key = ot.key
  where v.tenant_id = v_template_id;

  update public.agenda_templates nt
  set current_version_id = nv.id
  from public.agenda_templates ot
  join public.agenda_template_versions ov on ov.id = ot.current_version_id
  join public.agenda_template_versions nv
    on nv.tenant_id = v_tenant_id and nv.version = ov.version
  where nt.tenant_id = v_tenant_id
    and ot.tenant_id = v_template_id
    and nt.key = ot.key
    and nv.template_id = nt.id;

  insert into public.content_brief_templates (tenant_id, key, name, description, is_active, requires_consent)
  select v_tenant_id, t.key, t.name, t.description, t.is_active, t.requires_consent
  from public.content_brief_templates t
  where t.tenant_id = v_template_id;

  insert into public.content_brief_template_versions (tenant_id, template_id, version, fields)
  select v_tenant_id, nt.id, v.version, v.fields
  from public.content_brief_template_versions v
  join public.content_brief_templates ot on ot.id = v.template_id
  join public.content_brief_templates nt on nt.tenant_id = v_tenant_id and nt.key = ot.key
  where v.tenant_id = v_template_id;

  update public.content_brief_templates nt
  set current_version_id = nv.id
  from public.content_brief_templates ot
  join public.content_brief_template_versions ov on ov.id = ot.current_version_id
  join public.content_brief_template_versions nv
    on nv.tenant_id = v_tenant_id and nv.version = ov.version
  where nt.tenant_id = v_tenant_id
    and ot.tenant_id = v_template_id
    and nt.key = ot.key
    and nv.template_id = nt.id;

  -- Platform-default settings: the approval thresholds, the content lead
  -- time and the fiscal year. Not the template's images, page visibility,
  -- branding or site content -- those are the template tenant's own.
  insert into public.app_settings (tenant_id, key, value)
  select v_tenant_id, s.key, s.value
  from public.app_settings s
  where s.tenant_id = v_template_id
    and (s.key like 'finance.%' or s.key like 'content.%' or s.key like 'org.%');

  -- The first admin: a staged grant claim_pending_role_grants() turns into
  -- the admin role -- and, through ensure_membership_for_role, the
  -- membership -- the first time that address signs in. The operator script
  -- mints the invite link.
  if nullif(btrim(coalesce(p_admin_email, '')), '') is not null then
    select r.id into v_admin_role_id
    from public.roles r
    where r.tenant_id = v_tenant_id and r.name = 'admin';

    insert into public.pending_role_grants (email, role_id)
    values (lower(btrim(p_admin_email)), v_admin_role_id);
  end if;

  return v_tenant_id;
end;
$$;

comment on function public.provision_tenant(text, text, text, text, text, uuid) is
  'Creates a tenant ready to sign into: seeded roles and permission matrix, catalog defaults and platform settings copied from the template tenant (the oldest internal tenant unless given), and a staged admin grant for p_admin_email. service_role only.';

revoke execute on function public.provision_tenant(text, text, text, text, text, uuid) from public;
grant execute on function public.provision_tenant(text, text, text, text, text, uuid) to service_role;

-- 2. Support access -----------------------------------------------------------

-- The caller's own membership kind in the tenant they are looking at. Null
-- when they have none (which current_tenant_id() already rules out).
create or replace function public.current_membership_kind()
returns text
language sql
security definer
set search_path = public
stable
as $$
  select tm.kind
  from public.tenant_memberships tm
  where tm.user_id = auth.uid()
    and tm.tenant_id = (select public.current_tenant_id())
    and (tm.expires_at is null or tm.expires_at > now());
$$;

grant execute on function public.current_membership_kind() to authenticated;

create or replace function public.list_support_grants()
returns table (
  id uuid,
  user_id uuid,
  email text,
  reason text,
  expires_at timestamptz,
  created_at timestamptz,
  created_by_email text,
  roles text[]
)
language sql
security definer
set search_path = public
stable
as $$
  select
    tm.id,
    tm.user_id,
    u.email,
    tm.reason,
    tm.expires_at,
    tm.created_at,
    cb.email,
    coalesce(
      (select array_agg(r.name order by r.name)
         from public.user_roles ur
         join public.roles r on r.id = ur.role_id
        where ur.user_id = tm.user_id
          and ur.tenant_id = tm.tenant_id),
      '{}'
    )
  from public.tenant_memberships tm
  join auth.users u on u.id = tm.user_id
  left join auth.users cb on cb.id = tm.created_by
  where public.is_admin()
    and tm.tenant_id = (select public.current_tenant_id())
    and tm.kind = 'support'
  order by tm.expires_at desc;
$$;

grant execute on function public.list_support_grants() to authenticated;

-- Grants platform staff time-boxed access to the caller's tenant.
--
-- The account has to exist already: support staff are known accounts, and
-- resolving an address that nobody holds would stage access for whoever
-- registers it first -- the exact hazard #708 removed from the admin
-- bootstrap. Ninety days is the ceiling; a longer engagement is renewed,
-- which is one more deliberate act by the tenant.
--
-- The membership goes in before the role, so ensure_membership_for_role's
-- `on conflict do nothing` leaves it a support row. Re-granting an account
-- whose previous support grant expired refreshes that row rather than
-- failing on the (user_id, tenant_id) unique.
create or replace function public.grant_support_access(
  p_email text,
  p_reason text,
  p_expires_at timestamptz,
  p_role_name text default 'admin'
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant_id uuid := public.current_tenant_id();
  v_user_id uuid;
  v_role_id uuid;
  v_membership_id uuid;
begin
  if v_tenant_id is null or not public.is_admin() then
    raise exception 'NOT_AUTHORIZED' using errcode = '42501';
  end if;
  if public.current_membership_kind() <> 'member' then
    raise exception 'SUPPORT_CANNOT_GRANT_SUPPORT' using errcode = '42501';
  end if;
  if nullif(btrim(coalesce(p_reason, '')), '') is null then
    raise exception 'SUPPORT_REASON_REQUIRED';
  end if;
  if p_expires_at is null or p_expires_at <= now() then
    raise exception 'SUPPORT_EXPIRY_MUST_BE_FUTURE';
  end if;
  if p_expires_at > now() + interval '90 days' then
    raise exception 'SUPPORT_EXPIRY_TOO_FAR';
  end if;

  select u.id into v_user_id
  from auth.users u
  where lower(u.email) = lower(btrim(p_email))
  limit 1;
  if v_user_id is null then
    raise exception 'SUPPORT_USER_NOT_FOUND';
  end if;
  if v_user_id = auth.uid() then
    raise exception 'SUPPORT_CANNOT_GRANT_SELF';
  end if;
  if exists (
    select 1 from public.tenant_memberships tm
    where tm.user_id = v_user_id and tm.tenant_id = v_tenant_id and tm.kind = 'member'
  ) then
    raise exception 'SUPPORT_USER_ALREADY_MEMBER';
  end if;

  select r.id into v_role_id
  from public.roles r
  where r.tenant_id = v_tenant_id and r.name = p_role_name;
  if v_role_id is null then
    raise exception 'SUPPORT_ROLE_NOT_FOUND';
  end if;

  insert into public.tenant_memberships (user_id, tenant_id, kind, expires_at, reason, created_by)
  values (v_user_id, v_tenant_id, 'support', p_expires_at, btrim(p_reason), auth.uid())
  on conflict (user_id, tenant_id) do update
    set expires_at = excluded.expires_at,
        reason = excluded.reason,
        created_by = excluded.created_by,
        created_at = now()
    where public.tenant_memberships.kind = 'support'
  returning id into v_membership_id;

  insert into public.user_roles (user_id, role_id, created_by)
  values (v_user_id, v_role_id, auth.uid())
  on conflict (user_id, role_id) do nothing;

  return v_membership_id;
end;
$$;

comment on function public.grant_support_access(text, text, timestamptz, text) is
  'Tenant admin grants an existing account a time-boxed (max 90 days) support membership plus a role in the current tenant. Refused to callers whose own membership is a support grant.';

grant execute on function public.grant_support_access(text, text, timestamptz, text) to authenticated;

-- Ends a support grant now: the roles it was given here and the membership
-- both go, so the account has nothing left in this tenant to come back to.
-- The audit trigger on tenant_memberships records who ended it.
create or replace function public.revoke_support_access(p_membership_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant_id uuid := public.current_tenant_id();
  v_user_id uuid;
begin
  if v_tenant_id is null or not public.is_admin() then
    raise exception 'NOT_AUTHORIZED' using errcode = '42501';
  end if;
  if public.current_membership_kind() <> 'member' then
    raise exception 'SUPPORT_CANNOT_REVOKE_SUPPORT' using errcode = '42501';
  end if;

  select tm.user_id into v_user_id
  from public.tenant_memberships tm
  where tm.id = p_membership_id
    and tm.tenant_id = v_tenant_id
    and tm.kind = 'support';
  if v_user_id is null then
    raise exception 'SUPPORT_GRANT_NOT_FOUND';
  end if;

  delete from public.user_roles ur
  where ur.user_id = v_user_id and ur.tenant_id = v_tenant_id;

  delete from public.user_tenant_selection s
  where s.user_id = v_user_id and s.tenant_id = v_tenant_id;

  delete from public.tenant_memberships tm
  where tm.id = p_membership_id;
end;
$$;

grant execute on function public.revoke_support_access(uuid) to authenticated;

-- 3. Removing a user from one tenant -----------------------------------------

-- True when every membership the account holds is in the caller's current
-- tenant, i.e. when a platform-wide deactivation would affect nobody else.
create or replace function public.user_is_only_in_current_tenant(p_user_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.tenant_memberships tm
    where tm.user_id = p_user_id
      and tm.tenant_id = (select public.current_tenant_id())
  )
  and not exists (
    select 1 from public.tenant_memberships tm
    where tm.user_id = p_user_id
      and tm.tenant_id <> (select public.current_tenant_id())
  );
$$;

grant execute on function public.user_is_only_in_current_tenant(uuid) to authenticated;

-- deactivated_users: reading stays as it was; writing is now only for
-- accounts this tenant alone is responsible for.
drop policy "admin manage deactivated_users" on public.deactivated_users;

create policy "admin views deactivated_users" on public.deactivated_users
  for select to authenticated
  using (public.has_permission('administration', 'manage'));

create policy "admin deactivates own-tenant users" on public.deactivated_users
  for insert to authenticated
  with check (
    public.has_permission('administration', 'manage')
    and public.user_is_only_in_current_tenant(user_id)
  );

create policy "admin reactivates own-tenant users" on public.deactivated_users
  for delete to authenticated
  using (
    public.has_permission('administration', 'manage')
    and public.user_is_only_in_current_tenant(user_id)
  );

revoke update on public.deactivated_users from authenticated;

-- Drops an ordinary member from the current tenant: their roles here, their
-- membership, and their selection if it pointed here. Nothing about the
-- account itself changes, so any other tenant they belong to is unaffected.
-- Support grants go through revoke_support_access().
create or replace function public.remove_tenant_member(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant_id uuid := public.current_tenant_id();
begin
  if v_tenant_id is null or not public.is_admin() then
    raise exception 'NOT_AUTHORIZED' using errcode = '42501';
  end if;
  if p_user_id = auth.uid() then
    raise exception 'CANNOT_REMOVE_SELF';
  end if;
  if not exists (
    select 1 from public.tenant_memberships tm
    where tm.user_id = p_user_id and tm.tenant_id = v_tenant_id and tm.kind = 'member'
  ) then
    raise exception 'MEMBER_NOT_FOUND';
  end if;

  delete from public.user_roles ur
  where ur.user_id = p_user_id and ur.tenant_id = v_tenant_id;

  delete from public.user_tenant_selection s
  where s.user_id = p_user_id and s.tenant_id = v_tenant_id;

  delete from public.tenant_memberships tm
  where tm.user_id = p_user_id and tm.tenant_id = v_tenant_id;
end;
$$;

grant execute on function public.remove_tenant_member(uuid) to authenticated;

-- list_portal_users() gains `shared_account`, so the users screen can offer
-- removal instead of deactivation for an account that belongs elsewhere too.
-- Support grants are listed by list_support_grants() instead, so they leave
-- this list: an expiring grant is a different thing from a user.
drop function public.list_portal_users();

create function public.list_portal_users()
returns table (
  user_id uuid,
  email text,
  full_name text,
  person_id uuid,
  preferred_name text,
  person_name text,
  roles text[],
  created_at timestamptz,
  deactivated_at timestamptz,
  shared_account boolean
)
language sql
security definer
set search_path = public
stable
as $$
  select
    u.id,
    u.email,
    coalesce(u.raw_user_meta_data ->> 'full_name', u.raw_user_meta_data ->> 'name'),
    p.id,
    p.preferred_name,
    p.name,
    coalesce(array_agg(r.name order by r.name) filter (where r.name is not null), '{}'),
    u.created_at,
    du.deactivated_at,
    exists (
      select 1 from public.tenant_memberships o
      where o.user_id = u.id and o.tenant_id <> tm.tenant_id
    )
  from auth.users u
  join public.tenant_memberships tm
    on tm.user_id = u.id
   and tm.tenant_id = (select public.current_tenant_id())
   and tm.kind = 'member'
  left join public.user_roles ur
    on ur.user_id = u.id
   and ur.tenant_id = (select public.current_tenant_id())
  left join public.roles r on r.id = ur.role_id
  left join public.deactivated_users du on du.user_id = u.id
  left join public.people p
    on p.auth_user_id = u.id
   and p.tenant_id = (select public.current_tenant_id())
  where public.is_admin()
  group by u.id, u.email, u.created_at, du.deactivated_at, p.id, p.preferred_name, p.name, tm.tenant_id
  order by u.email;
$$;

grant execute on function public.list_portal_users() to authenticated;
