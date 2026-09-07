-- Multi-tenancy Phase 2 (#707): the permission core answers for one tenant.
--
-- Until now has_permission() joined user_roles -> role_permissions -> resources
-- with no idea of tenancy, so "administration:manage" meant admin *everywhere*.
-- 20260906010000 gave roles, user_roles, role_permissions and
-- pending_role_grants a tenant_id; this migration makes the functions and
-- policies that read them honour it.
--
-- Four things happen here:
--
-- 1. Structural: roles gets unique (tenant_id, id), and the three tables that
--    reference a role do so through (tenant_id, role_id). A grant can then
--    never point across tenants, whatever the writer -- that is what makes the
--    trigger-derived tenant_id from 20260906000000 a guarantee rather than a
--    convention. Constraint names are kept so the cascade-on-role-delete
--    behaviour the roles screen relies on is unchanged.
--
-- 2. has_permission(), my_permissions(), has_role(), my_roles() filter
--    user_roles on current_tenant_id() -- the *selected* tenant, never
--    default_tenant_id()'s fallback. A user with several memberships and no
--    selection therefore has no permissions until they choose, and a user
--    whose only membership is in a suspended tenant has none at all. Fail
--    closed. is_admin() delegates to has_permission() and needs no change.
--
-- 3. A role in a tenant implies membership in it. Roles are granted to
--    accounts that have never signed in -- an admin assigns one from the
--    users screen after minting an invite link, the admin bootstrap in
--    docs/admin-bootstrap.md inserts one by hand, claim_pending_role_grants()
--    below grants one on first login -- and none of those paths would
--    otherwise create the tenant_memberships row that current_tenant_id()
--    needs before the role means anything. An AFTER INSERT trigger on
--    user_roles creates the ordinary `member` row when it is missing, so the
--    invariant holds for every writer rather than for the ones that
--    remembered. It never touches an existing row: a support grant stays a
--    support grant.
--
--    claim_pending_role_grants() itself grants into the tenant the invite
--    was staged in (pending_role_grants.tenant_id), not the caller's current
--    tenant -- it runs from the auth callback, before the portal layout has
--    had a chance to resolve one. That is safe: the staged row could only
--    have been written by someone passing the (now tenant-scoped)
--    pending_role_grants policy inside that tenant.
--
-- 4. Policies. The two `using (true)` selects on roles and role_permissions
--    would have shown every tenant's roles to everyone; they become
--    tenant-scoped, as do the admin write policies. The read-only stance
--    20260905180000 took on tenants and tenant_memberships was explicitly
--    "until has_permission() is tenant-scoped" -- it now is, so the deferred
--    write policies land: a tenant admin manages `member` rows in the tenant
--    they are looking at, can never mint or touch a `support` grant, and can
--    rename their own tenant. Every predicate is `tenant_id = (select
--    current_tenant_id())`, not `tenant_id in (select my_tenant_ids())`: an
--    admin of A who is an ordinary member of B must not manage B's people by
--    virtue of being admin somewhere.

-- 1. Structure --------------------------------------------------------------

alter table public.roles
  add constraint roles_tenant_id_id_key unique (tenant_id, id);

alter table public.user_roles
  drop constraint user_roles_role_id_fkey,
  add constraint user_roles_role_id_fkey
    foreign key (tenant_id, role_id) references public.roles (tenant_id, id) on delete cascade;

alter table public.role_permissions
  drop constraint role_permissions_role_id_fkey,
  add constraint role_permissions_role_id_fkey
    foreign key (tenant_id, role_id) references public.roles (tenant_id, id) on delete cascade;

alter table public.pending_role_grants
  drop constraint pending_role_grants_role_id_fkey,
  add constraint pending_role_grants_role_id_fkey
    foreign key (tenant_id, role_id) references public.roles (tenant_id, id) on delete cascade;

-- 2. Authorization helpers ---------------------------------------------------

create or replace function public.has_permission(p_resource_key text, p_min_level text)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select coalesce(max(public.permission_rank(rp.level)), 0) >= public.permission_rank(p_min_level)
  from public.user_roles ur
  join public.role_permissions rp on rp.role_id = ur.role_id
  join public.resources res on res.id = rp.resource_id
  where ur.user_id = auth.uid()
    and ur.tenant_id = (select public.current_tenant_id())
    and res.key = p_resource_key
    and not exists (
      select 1 from public.deactivated_users du where du.user_id = auth.uid()
    );
$$;

create or replace function public.my_permissions()
returns table (resource_key text, level text)
language sql
security definer
set search_path = public
stable
as $$
  select res.key, case
    when exists (select 1 from public.deactivated_users du where du.user_id = auth.uid())
    then 'none'
    else coalesce(
      (select rp.level
       from public.user_roles ur
       join public.role_permissions rp on rp.role_id = ur.role_id and rp.resource_id = res.id
       where ur.user_id = auth.uid()
         and ur.tenant_id = (select public.current_tenant_id())
       order by public.permission_rank(rp.level) desc
       limit 1),
      'none'
    )
  end
  from public.resources res
  order by res.sort_order, res.key;
$$;

create or replace function public.has_role(p_role text)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.user_roles ur
    join public.roles r on r.id = ur.role_id
    where ur.user_id = auth.uid()
      and ur.tenant_id = (select public.current_tenant_id())
      and r.name = p_role
  );
$$;

create or replace function public.my_roles()
returns text[]
language sql
security definer
set search_path = public
stable
as $$
  select coalesce(array_agg(r.name order by r.name), '{}')
  from public.user_roles ur
  join public.roles r on r.id = ur.role_id
  where ur.user_id = auth.uid()
    and ur.tenant_id = (select public.current_tenant_id());
$$;

-- 3. Membership follows the role ----------------------------------------------

create or replace function public.ensure_membership_for_role()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.tenant_memberships (user_id, tenant_id, kind, created_by)
  values (new.user_id, new.tenant_id, 'member', new.created_by)
  on conflict (user_id, tenant_id) do nothing;
  return new;
end;
$$;

create trigger ensure_membership_for_role after insert on public.user_roles
  for each row execute function public.ensure_membership_for_role();

create or replace function public.claim_pending_role_grants()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text;
  v_matched integer;
begin
  if auth.uid() is null then
    return 0;
  end if;

  select email into v_email from auth.users where id = auth.uid();
  if v_email is null then
    return 0;
  end if;

  select count(*) into v_matched
  from public.pending_role_grants
  where status = 'pending'
    and lower(trim(email)) = lower(trim(v_email))
    and (expires_at is null or expires_at > now());

  if v_matched = 0 then
    return 0;
  end if;

  -- Into the tenant the invite was staged in; ensure_membership_for_role
  -- joins the caller to it as an ordinary member.
  insert into public.user_roles (tenant_id, user_id, role_id, created_by)
  select prg.tenant_id, auth.uid(), prg.role_id, prg.created_by
  from public.pending_role_grants prg
  where prg.status = 'pending'
    and lower(trim(prg.email)) = lower(trim(v_email))
    and (prg.expires_at is null or prg.expires_at > now())
  on conflict (user_id, role_id) do nothing;

  update public.pending_role_grants
  set status = 'claimed', claimed_by = auth.uid(), claimed_at = now()
  where status = 'pending'
    and lower(trim(email)) = lower(trim(v_email))
    and (expires_at is null or expires_at > now());

  return v_matched;
end;
$$;

-- The administration user list: accounts with a live membership in the
-- current tenant, with the roles they hold there. Previously every account
-- in auth.users. Same return shape as 20260902030000, so `create or replace`.
create or replace function public.list_portal_users()
returns table (
  user_id uuid,
  email text,
  full_name text,
  person_id uuid,
  preferred_name text,
  person_name text,
  roles text[],
  created_at timestamptz,
  deactivated_at timestamptz
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
    du.deactivated_at
  from auth.users u
  join public.tenant_memberships tm
    on tm.user_id = u.id
   and tm.tenant_id = (select public.current_tenant_id())
   and (tm.expires_at is null or tm.expires_at > now())
  left join public.user_roles ur
    on ur.user_id = u.id
   and ur.tenant_id = (select public.current_tenant_id())
  left join public.roles r on r.id = ur.role_id
  left join public.deactivated_users du on du.user_id = u.id
  left join public.people p
    on p.auth_user_id = u.id
   and p.tenant_id = (select public.current_tenant_id())
  where public.is_admin()
  group by u.id, u.email, u.created_at, du.deactivated_at, p.id, p.preferred_name, p.name
  order by u.email;
$$;

create or replace function public.list_calendar_owners()
returns table (person_id uuid, auth_user_id uuid, name text, preferred_name text, email text)
language sql
security definer
set search_path = public
stable
as $$
  select p.id, p.auth_user_id, p.name, p.preferred_name, p.email
  from public.people p
  where p.auth_user_id is not null
    and p.tenant_id = (select public.current_tenant_id())
    and public.has_permission('content_calendar', 'view')
    and exists (
      select 1
      from public.user_roles ur
      join public.roles r on r.id = ur.role_id
      where ur.user_id = p.auth_user_id
        and ur.tenant_id = p.tenant_id
        and r.name in ('admin', 'event_coordinator')
    )
  order by coalesce(p.preferred_name, p.name, p.email);
$$;

-- 4. Policies ----------------------------------------------------------------

drop policy "authenticated read roles" on public.roles;
create policy "authenticated read roles" on public.roles for select to authenticated
  using (tenant_id = (select public.current_tenant_id()));

drop policy "admin manage roles" on public.roles;
create policy "admin manage roles" on public.roles for all to authenticated
  using (tenant_id = (select public.current_tenant_id()) and public.is_admin())
  with check (tenant_id = (select public.current_tenant_id()) and public.is_admin());

drop policy "authenticated read role_permissions" on public.role_permissions;
create policy "authenticated read role_permissions" on public.role_permissions for select to authenticated
  using (tenant_id = (select public.current_tenant_id()));

drop policy "admin manage role_permissions" on public.role_permissions;
create policy "admin manage role_permissions" on public.role_permissions for all to authenticated
  using (tenant_id = (select public.current_tenant_id()) and public.is_admin())
  with check (tenant_id = (select public.current_tenant_id()) and public.is_admin());

-- "user views own roles" (user_id = auth.uid()) stays: the switcher and the
-- account page want every tenant's roles for the signed-in user.
drop policy "admin manage user_roles" on public.user_roles;
create policy "admin manage user_roles" on public.user_roles for all to authenticated
  using (tenant_id = (select public.current_tenant_id()) and public.is_admin())
  with check (tenant_id = (select public.current_tenant_id()) and public.is_admin());

drop policy "admin manage pending_role_grants" on public.pending_role_grants;
create policy "admin manage pending_role_grants" on public.pending_role_grants for all to authenticated
  using (
    tenant_id = (select public.current_tenant_id())
    and public.has_permission('administration', 'manage')
  )
  with check (
    tenant_id = (select public.current_tenant_id())
    and public.has_permission('administration', 'manage')
  );

-- tenant_memberships: the Phase 1 select policy let an admin read the
-- membership list of *any* tenant they belong to; now only the one they are
-- looking at. Everyone still sees their own rows.
drop policy "tenant_memberships select" on public.tenant_memberships;
create policy "tenant_memberships select" on public.tenant_memberships for select to authenticated
  using (
    user_id = auth.uid()
    or (
      tenant_id = (select public.current_tenant_id())
      and public.has_permission('administration', 'manage')
    )
  );

create policy "tenant_memberships insert" on public.tenant_memberships for insert to authenticated
  with check (
    tenant_id = (select public.current_tenant_id())
    and kind = 'member'
    and public.has_permission('administration', 'manage')
  );

create policy "tenant_memberships update" on public.tenant_memberships for update to authenticated
  using (
    tenant_id = (select public.current_tenant_id())
    and kind = 'member'
    and public.has_permission('administration', 'manage')
  )
  with check (
    tenant_id = (select public.current_tenant_id())
    and kind = 'member'
    and public.has_permission('administration', 'manage')
  );

create policy "tenant_memberships delete" on public.tenant_memberships for delete to authenticated
  using (
    tenant_id = (select public.current_tenant_id())
    and kind = 'member'
    and public.has_permission('administration', 'manage')
  );

grant insert, update, delete on public.tenant_memberships to authenticated;

-- tenants: an admin may rename the tenant they are looking at. The column
-- grant is what limits it to `name` -- slug, domain, status and plan are
-- platform decisions and stay service_role only. "tenants select" is
-- unchanged: it is the switcher's list, so it is deliberately every tenant
-- the user belongs to.
create policy "tenants update" on public.tenants for update to authenticated
  using (id = (select public.current_tenant_id()) and public.has_permission('administration', 'manage'))
  with check (id = (select public.current_tenant_id()) and public.has_permission('administration', 'manage'));

grant update (name) on public.tenants to authenticated;
