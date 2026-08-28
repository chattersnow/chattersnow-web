-- Portal CRUD for calendar items (issue #104) needs two things #103 didn't add:
--
-- 1. A plan/skip/defer decision per item. The requirements doc (§7) and spec
--    (§5.20) list this as base item-management scope, distinct from
--    `calendar_status` (a planning stage, not a decision) and distinct from
--    the content-opportunity brief fields owned by #106.
-- 2. An owner picker usable by event_coordinator, not just admin.
--    `list_portal_users()` self-restricts to admin callers; `list_event_leads()`
--    (see 20260822070000_list_event_leads_rpc.sql) solves the same problem for
--    events by self-restricting to admin/event_coordinator instead. Mirror it
--    here rather than reusing list_portal_users().

alter table public.calendar_items
  add column decision text check (decision in ('plan', 'skip', 'defer')),
  add column decision_note text;

create function public.list_calendar_owners()
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

grant execute on function public.list_calendar_owners() to authenticated;
