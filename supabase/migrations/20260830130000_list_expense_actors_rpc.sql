-- The expense detail view needs to show who submitted/approved/rejected/
-- paid an expense, but submitted_by/approved_by/rejected_by/paid_by are
-- only stored as auth.users ids. list_portal_users() can't be reused here
-- since it self-restricts to admin callers only (mirrors the reasoning in
-- 20260822070000_list_event_leads_rpc.sql). Add a narrow lookup scoped to
-- exactly the ids the caller asks for, gated on event_expenses:view (the
-- same permission that gates seeing the expenses list at all) rather than
-- admin.

create function public.list_expense_actors(p_user_ids uuid[])
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
  select u.id, u.email,
    coalesce(u.raw_user_meta_data ->> 'full_name', u.raw_user_meta_data ->> 'name')
  from auth.users u
  where public.has_permission('event_expenses', 'view')
    and u.id = any(p_user_ids)
$$;

grant execute on function public.list_expense_actors(uuid[]) to authenticated;
