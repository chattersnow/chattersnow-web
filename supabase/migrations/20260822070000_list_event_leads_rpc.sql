-- The Planning tab's event-lead picker needs a name/email list of users who
-- can plausibly lead an event (admin or event_coordinator). list_portal_users()
-- can't be reused here since it self-restricts to admin callers only, and
-- event_coordinator must also be able to set an event's lead. Mirrors
-- list_portal_users(): security definer to read auth.users, self-restricted
-- to admin/event_coordinator callers rather than relying on caller grants.

create function public.list_event_leads()
returns table (
  user_id uuid,
  email text
)
language sql
security definer
set search_path = public
stable
as $$
  select distinct u.id, u.email
  from auth.users u
  join public.user_roles ur on ur.user_id = u.id
  join public.roles r on r.id = ur.role_id
  where r.name in ('admin', 'event_coordinator')
    and (public.has_role('admin') or public.has_role('event_coordinator'))
  order by u.email;
$$;

grant execute on function public.list_event_leads() to authenticated;
