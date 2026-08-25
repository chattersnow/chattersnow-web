-- Issue #133: today the only way to cut off a portal user's access is
-- deleting every user_roles row one at a time (revokeRoleAction), with no
-- durable record that the account was *deliberately* deactivated (vs. never
-- granted anything) and no single audit entry. deactivated_users is a pure
-- on/off flag keyed by auth.uid()/user_roles.user_id, not people(id) -- a
-- people row is unrelated/optional relative to portal auth identity, and
-- every permission check already keys off auth.uid(). has_permission()/
-- my_permissions() zero out a deactivated user's effective permissions
-- without ever touching user_roles, so reactivating (deleting this row)
-- restores prior access automatically. Deactivation only takes effect on the
-- next permission check/page load -- there's no session-invalidation
-- mechanism in this codebase, same as every other permission change today.

create table public.deactivated_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  deactivated_at timestamptz not null default now(),
  deactivated_by uuid references auth.users(id)
);

alter table public.deactivated_users enable row level security;

create policy "admin manage deactivated_users" on public.deactivated_users
  for all to authenticated
  using (public.has_permission('administration', 'manage'))
  with check (public.has_permission('administration', 'manage'));

grant select, insert, update, delete on public.deactivated_users to authenticated;

-- Same audited set as user_roles/pending_role_grants: a deactivate/
-- reactivate action is an administration action and belongs in the trail.
-- Preserve the full existing allow-list -- see
-- 20260824140000_fix_audit_log_table_name_check_pending_role_grants.sql for
-- what happens when a rewrite here drops an existing entry instead.
do $$
declare
  v_constraint_name text;
begin
  select conname into v_constraint_name
  from pg_constraint
  where conrelid = 'public.audit_log'::regclass and contype = 'c' and conname like '%table_name%';

  if v_constraint_name is not null then
    execute format('alter table public.audit_log drop constraint %I', v_constraint_name);
  end if;
end $$;

alter table public.audit_log
  add constraint audit_log_table_name_check
  check (table_name in ('donations', 'inventory_items', 'inventory_movements', 'event_expenses', 'user_roles', 'app_settings', 'calendar_items', 'pending_role_grants', 'content_opportunities', 'deactivated_users'));

create trigger audit_log_row after insert or update or delete on public.deactivated_users
  for each row execute function public.audit_log_row();

-- has_permission()/is_admin() (is_admin is defined in terms of
-- has_permission, so it inherits this for free): a deactivated user has zero
-- permissions regardless of what's in user_roles.
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
       order by public.permission_rank(rp.level) desc
       limit 1),
      'none'
    )
  end
  from public.resources res
  order by res.sort_order, res.key;
$$;

-- list_portal_users(): surface deactivation state to the admin UI, alongside
-- #132's full_name column. Drop+recreate again since this adds another
-- output column (see 20260824220000 for why CREATE OR REPLACE can't do it).
drop function if exists public.list_portal_users();

create function public.list_portal_users()
returns table (
  user_id uuid,
  email text,
  full_name text,
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
    coalesce(array_agg(r.name order by r.name) filter (where r.name is not null), '{}'),
    u.created_at,
    du.deactivated_at
  from auth.users u
  left join public.user_roles ur on ur.user_id = u.id
  left join public.roles r on r.id = ur.role_id
  left join public.deactivated_users du on du.user_id = u.id
  where public.is_admin()
  group by u.id, u.email, u.created_at, du.deactivated_at
  order by u.email;
$$;

grant execute on function public.list_portal_users() to authenticated;
