-- Administration > Users needs to list auth.users with their assigned
-- roles, but auth.users isn't exposed via PostgREST. security definer lets
-- this function read it directly; it self-restricts to admins (returns no
-- rows for anyone else) rather than relying on the caller's grants.
create function public.list_portal_users()
returns table (
  user_id uuid,
  email text,
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
