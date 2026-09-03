-- Administration -> Users renders a name from list_portal_users(), which
-- reads it straight out of auth.users.raw_user_meta_data -- i.e. whatever
-- Google supplied. Now that people.preferred_name exists (20260902000000)
-- and every portal account is expected to have a people row
-- (20260902040000/20260902050000), surface both the linked person and their
-- preferred name so the admin table can show, and edit, the same display
-- name the rest of the portal uses.
--
-- full_name is kept rather than replaced, so the display chain degrades
-- cleanly for an account whose people row hasn't been created yet:
-- preferred_name -> people.name -> auth full_name -> email.
--
-- Third drop + recreate of this function (after 20260824220000 added
-- full_name and 20260824230000 added deactivated_at) for the same reason as
-- both of those: CREATE OR REPLACE cannot change a RETURNS TABLE output list.

drop function if exists public.list_portal_users();

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
  left join public.user_roles ur on ur.user_id = u.id
  left join public.roles r on r.id = ur.role_id
  left join public.deactivated_users du on du.user_id = u.id
  left join public.people p on p.auth_user_id = u.id
  where public.is_admin()
  group by u.id, u.email, u.created_at, du.deactivated_at, p.id, p.preferred_name, p.name
  order by u.email;
$$;

grant execute on function public.list_portal_users() to authenticated;
