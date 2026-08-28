-- Issue #132: Administration > Users identifies people by email only, even
-- though Google OAuth already populates a name
-- (auth.users.raw_user_meta_data ->> 'full_name'/'name') once someone signs
-- in -- it's just never read. Surface it in list_portal_users(), and let
-- admins label a staged pending_role_grants row with a name before the
-- person has ever signed in (Google's name wins once available, since it's
-- authoritative -- see users-table.tsx's `full_name ?? email` fallback).
--
-- CREATE OR REPLACE can't add a new output column to a RETURNS TABLE
-- function (Postgres requires an unchanged OUT parameter list), so this
-- drops and recreates list_portal_users() rather than replacing it in
-- place -- re-issuing the `grant execute` that goes with it.

drop function if exists public.list_portal_users();

create function public.list_portal_users()
returns table (
  user_id uuid,
  email text,
  full_name text,
  roles text[],
  created_at timestamptz
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
    u.created_at
  from auth.users u
  left join public.user_roles ur on ur.user_id = u.id
  left join public.roles r on r.id = ur.role_id
  where public.is_admin()
  group by u.id, u.email, u.created_at
  order by u.email;
$$;

grant execute on function public.list_portal_users() to authenticated;

alter table public.pending_role_grants add column name text;
