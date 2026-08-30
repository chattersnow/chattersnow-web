-- Expenses currently record rejected_at/rejection_reason but not who
-- rejected the expense, unlike approved_by/paid_by. The expense detail
-- view needs to show who approved/rejected an expense, so add the missing
-- actor column and have reject_event_expense() set it.

alter table public.event_expenses add column rejected_by uuid references auth.users(id);

create or replace function public.reject_event_expense(p_id uuid, p_reason text)
returns public.event_expenses
language plpgsql
security definer
set search_path = public
as $$
declare
  v_expense public.event_expenses;
begin
  if p_reason is null or btrim(p_reason) = '' then
    raise exception 'A rejection reason is required';
  end if;

  select * into v_expense from public.event_expenses where id = p_id for update;
  if v_expense.id is null then
    raise exception 'Expense not found';
  end if;
  if v_expense.status <> 'submitted' then
    raise exception 'Only submitted expenses can be rejected';
  end if;
  if not (public.has_permission('finance_approvals', 'manage') and v_expense.submitted_by <> auth.uid()) then
    raise exception 'Not authorized to reject this expense';
  end if;

  update public.event_expenses
    set status = 'rejected', rejected_at = now(), rejected_by = auth.uid(), rejection_reason = btrim(p_reason)
    where id = p_id
    returning * into v_expense;
  return v_expense;
end;
$$;
