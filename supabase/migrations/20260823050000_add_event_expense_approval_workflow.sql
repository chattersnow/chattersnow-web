-- Expense approval workflow (issue #29, spec §5.16): submitted -> approved/
-- rejected -> paid, gated by the configurable threshold seeded in the
-- previous migration. `finance` may self-approve its own submission below
-- the threshold; anyone else (event_coordinator submissions, or a finance
-- submission at/above the threshold) needs a second approver holding
-- finance_approvals:manage who isn't the submitter. Scope is intentionally
-- limited to this 2-tier mechanism — the 5-tier escalation model in
-- planning/governance/roles-and-responsibilities.md needs a budget concept
-- (tier 3) and a "related party" definition (tier 4) that don't exist in
-- the schema yet and remain open governance questions (issue #13).

alter table public.event_expenses
  add column status text not null default 'submitted'
    check (status in ('submitted', 'approved', 'rejected', 'paid'));

alter table public.event_expenses add column submitted_by uuid references auth.users(id);
update public.event_expenses set submitted_by = created_by where submitted_by is null;
alter table public.event_expenses alter column submitted_by set not null;
alter table public.event_expenses alter column submitted_by set default auth.uid();

alter table public.event_expenses
  add column approved_by uuid references auth.users(id),
  add column approved_at timestamptz,
  add column rejected_at timestamptz,
  add column rejection_reason text,
  add column paid_by uuid references auth.users(id),
  add column paid_at timestamptz;

create index event_expenses_status_idx on public.event_expenses (status);

insert into public.resources (key, section, label, description, sort_order) values
  ('finance_approvals', 'Finance', 'Expense approvals', 'Approve, reject, or mark paid any submitted expense (must not be the submitter)', 75),
  ('finance_self_approval', 'Workflow', 'Self-approve own expenses', 'Self-approve your own routine, below-threshold expense submissions', 155);

insert into public.role_permissions (role_id, resource_id, level)
select r.id, res.id, v.level
from (values
  ('admin', 'finance_approvals', 'manage'),
  ('event_coordinator', 'finance_approvals', 'none'),
  ('finance', 'finance_approvals', 'none'),
  ('board', 'finance_approvals', 'manage'),
  ('volunteer', 'finance_approvals', 'none'),

  ('admin', 'finance_self_approval', 'none'),
  ('event_coordinator', 'finance_self_approval', 'none'),
  ('finance', 'finance_self_approval', 'manage'),
  ('board', 'finance_self_approval', 'none'),
  ('volunteer', 'finance_self_approval', 'none')
) as v(role_name, resource_key, level)
join public.roles r on r.name = v.role_name
join public.resources res on res.key = v.resource_key;

-- Now that finance_approvals exists, let approvers read the threshold too.
drop policy "app_settings select" on public.app_settings;
create policy "app_settings select" on public.app_settings for select to authenticated
  using (
    public.has_permission('system_settings', 'manage')
    or public.has_permission('event_expenses', 'manage')
    or public.has_permission('finance_approvals', 'manage')
  );

-- Tighten event_expenses writes: a row can only be edited/deleted while
-- still 'submitted' (status changes go through the RPCs below, which are
-- security definer and bypass RLS, same as create_donation_with_items /
-- record_event_distribution). This also stops a plain .update() call from
-- smuggling a status change past the approval RPCs.
drop policy "event_expenses insert" on public.event_expenses;
drop policy "event_expenses update" on public.event_expenses;
drop policy "event_expenses delete" on public.event_expenses;

create policy "event_expenses insert" on public.event_expenses for insert to authenticated
  with check (public.has_permission('event_expenses', 'manage') and submitted_by = auth.uid() and status = 'submitted');
create policy "event_expenses update" on public.event_expenses for update to authenticated
  using (public.has_permission('event_expenses', 'manage') and status = 'submitted')
  with check (public.has_permission('event_expenses', 'manage') and status = 'submitted');
create policy "event_expenses delete" on public.event_expenses for delete to authenticated
  using (public.has_permission('event_expenses', 'manage') and status in ('submitted', 'rejected'));

create or replace function public.approve_event_expense(p_id uuid)
returns public.event_expenses
language plpgsql
security definer
set search_path = public
as $$
declare
  v_expense public.event_expenses;
  v_threshold numeric;
begin
  select * into v_expense from public.event_expenses where id = p_id for update;
  if v_expense.id is null then
    raise exception 'Expense not found';
  end if;
  if v_expense.status <> 'submitted' then
    raise exception 'Only submitted expenses can be approved';
  end if;

  if public.has_permission('finance_approvals', 'manage') and v_expense.submitted_by <> auth.uid() then
    update public.event_expenses
      set status = 'approved', approved_by = auth.uid(), approved_at = now()
      where id = p_id
      returning * into v_expense;
    return v_expense;
  end if;

  if public.has_permission('finance_self_approval', 'manage') and v_expense.submitted_by = auth.uid() then
    select (value #>> '{}')::numeric into v_threshold
      from public.app_settings where key = 'finance.expense_approval_threshold';
    if v_threshold is null then
      raise exception 'Approval threshold is not configured';
    end if;
    if v_expense.amount >= v_threshold then
      raise exception 'This expense is at or above the approval threshold and requires a second approver';
    end if;
    update public.event_expenses
      set status = 'approved', approved_by = auth.uid(), approved_at = now()
      where id = p_id
      returning * into v_expense;
    return v_expense;
  end if;

  raise exception 'Not authorized to approve this expense';
end;
$$;

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
    set status = 'rejected', rejected_at = now(), rejection_reason = btrim(p_reason)
    where id = p_id
    returning * into v_expense;
  return v_expense;
end;
$$;

create or replace function public.mark_event_expense_paid(p_id uuid)
returns public.event_expenses
language plpgsql
security definer
set search_path = public
as $$
declare
  v_expense public.event_expenses;
begin
  if not public.has_permission('finance', 'manage') then
    raise exception 'Not authorized to mark this expense paid';
  end if;

  select * into v_expense from public.event_expenses where id = p_id for update;
  if v_expense.id is null then
    raise exception 'Expense not found';
  end if;
  if v_expense.status <> 'approved' then
    raise exception 'Only approved expenses can be marked paid';
  end if;

  update public.event_expenses
    set status = 'paid', paid_by = auth.uid(), paid_at = now()
    where id = p_id
    returning * into v_expense;
  return v_expense;
end;
$$;

grant execute on function public.approve_event_expense(uuid) to authenticated;
grant execute on function public.reject_event_expense(uuid, text) to authenticated;
grant execute on function public.mark_event_expense_paid(uuid) to authenticated;
