-- Home page "Needs your attention" widget (issue #69). Board holds
-- finance_approvals:manage but not event_expenses:view (RLS reasons — see
-- 20260823050000), so a plain RLS-scoped `.from("event_expenses")` count
-- would return 0 for board approvers even though they can approve. This
-- security-definer RPC checks the same finance_approvals:manage permission
-- that gates approve_event_expense/reject_event_expense and returns the
-- pending count directly, bypassing RLS instead of widening event_expenses
-- grants for board.

create function public.count_pending_event_expense_approvals()
returns integer
language sql
security definer
set search_path = public
stable
as $$
  select case
    when public.has_permission('finance_approvals', 'manage')
      then (select count(*)::integer from public.event_expenses where status = 'submitted')
    else 0
  end;
$$;

grant execute on function public.count_pending_event_expense_approvals() to authenticated;
