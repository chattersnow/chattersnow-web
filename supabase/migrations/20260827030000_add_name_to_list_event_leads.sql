-- Issue #343: the Planning tab's event-lead picker shows each lead's email
-- instead of their name, even though Google OAuth already populates one
-- (auth.users.raw_user_meta_data ->> 'full_name'/'name'). Mirrors
-- 20260824220000_add_name_to_list_portal_users_and_pending_role_grants.sql,
-- which did the same for list_portal_users().
--
-- CREATE OR REPLACE can't add a new output column to a RETURNS TABLE
-- function (Postgres requires an unchanged OUT parameter list), so this
-- drops and recreates list_event_leads() rather than replacing it in
-- place -- re-issuing the `grant execute` that goes with it.

drop function if exists public.list_event_leads();

create function public.list_event_leads()
returns table (
  user_id uuid,
  email text,
  full_name text
)
language sql
security definer
set search_path = public
stable
as $$
  select distinct u.id, u.email,
    coalesce(u.raw_user_meta_data ->> 'full_name', u.raw_user_meta_data ->> 'name')
  from auth.users u
  join public.user_roles ur on ur.user_id = u.id
  join public.role_permissions rp on rp.role_id = ur.role_id
  join public.resources res on res.id = rp.resource_id and res.key = 'events' and rp.level = 'manage'
  where public.has_permission('events', 'manage')
  order by u.email;
$$;

grant execute on function public.list_event_leads() to authenticated;
