-- Reimbursements (issue #51, spec §5.18/§6): personal-spend requests that
-- go through the same submitted -> approved/rejected -> paid workflow as
-- event_expenses (§5.16), since the underlying control question -- who may
-- approve spend -- is the same. Table/RLS/RPCs are written directly in their
-- final shape (mirroring event_expenses' end state across
-- 20260821030000/20260823050000) rather than replayed as separate
-- base+workflow migrations, since there's no pre-workflow state to support
-- here.
--
-- Unlike event_expenses.submitted_by (always the staff member who typed the
-- expense in), a reimbursement's requester may not be a portal user at all
-- (e.g. a volunteer) -- spec §6 calls for a people.id FK for the requester.
-- So this table carries both: `person_id` (who gets reimbursed) and
-- `submitted_by` (the staff member who recorded it, default auth.uid(),
-- same as event_expenses). Self-approval eligibility still compares against
-- submitted_by, not person_id, since that's who's actually acting.
--
-- Approvals get their own dedicated resources (reimbursement_approvals /
-- reimbursement_self_approval) rather than reusing finance_approvals /
-- finance_self_approval, matching the more recent event_revenue precedent
-- (20260825010000) of minting a dedicated resource per table even when
-- grants exactly mirror another table's -- this keeps expense and
-- reimbursement approval rights independently governable later.

create table public.reimbursements (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references public.people(id),
  event_id uuid references public.events(id) on delete set null,
  description text not null,
  amount numeric(10, 2) not null check (amount >= 0),
  currency text not null default 'USD',
  receipt_url text,
  notes text,
  status text not null default 'submitted'
    check (status in ('submitted', 'approved', 'rejected', 'paid')),
  submitted_by uuid not null default auth.uid() references auth.users(id),
  approved_by uuid references auth.users(id),
  approved_at timestamptz,
  rejected_at timestamptz,
  rejection_reason text,
  paid_by uuid references auth.users(id),
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid not null default auth.uid() references auth.users(id),
  updated_by uuid references auth.users(id)
);

create index reimbursements_status_idx on public.reimbursements (status);
create index reimbursements_person_id_idx on public.reimbursements (person_id);

create trigger set_updated_at before update on public.reimbursements
  for each row execute function public.set_updated_at();
create trigger audit_log_row after insert or update or delete on public.reimbursements
  for each row execute function public.audit_log_row();

alter table public.reimbursements enable row level security;

-- Also readable by anyone who can approve (board holds reimbursement_approvals
-- but not reimbursements itself) -- unlike event_expenses, whose select
-- policy only checks event_expenses:view, leaving board unable to see any
-- rows on the page it's otherwise let into via the layout guard.
create policy "reimbursements select" on public.reimbursements for select to authenticated
  using (
    public.has_permission('reimbursements', 'view')
    or public.has_permission('reimbursement_approvals', 'manage')
  );
create policy "reimbursements insert" on public.reimbursements for insert to authenticated
  with check (public.has_permission('reimbursements', 'manage') and submitted_by = auth.uid() and status = 'submitted');
create policy "reimbursements update" on public.reimbursements for update to authenticated
  using (public.has_permission('reimbursements', 'manage') and status = 'submitted')
  with check (public.has_permission('reimbursements', 'manage') and status = 'submitted');
create policy "reimbursements delete" on public.reimbursements for delete to authenticated
  using (public.has_permission('reimbursements', 'manage') and status in ('submitted', 'rejected'));

grant select, insert, update, delete on public.reimbursements to authenticated;

insert into public.resources (key, section, label, description, sort_order) values
  ('reimbursements', 'Finance', 'Reimbursements', 'Personal-spend reimbursement requests', 72),
  ('reimbursement_approvals', 'Finance', 'Reimbursement approvals', 'Approve, reject, or mark paid any submitted reimbursement (must not be the submitter)', 77),
  ('reimbursement_self_approval', 'Workflow', 'Self-approve own reimbursements', 'Self-approve your own routine, below-threshold reimbursement submissions', 156);

insert into public.role_permissions (role_id, resource_id, level)
select r.id, res.id, v.level
from (values
  ('admin', 'reimbursements', 'manage'),
  ('event_coordinator', 'reimbursements', 'manage'),
  ('finance', 'reimbursements', 'manage'),
  ('board', 'reimbursements', 'none'),
  ('volunteer', 'reimbursements', 'none'),

  ('admin', 'reimbursement_approvals', 'manage'),
  ('event_coordinator', 'reimbursement_approvals', 'none'),
  ('finance', 'reimbursement_approvals', 'none'),
  ('board', 'reimbursement_approvals', 'manage'),
  ('volunteer', 'reimbursement_approvals', 'none'),

  ('admin', 'reimbursement_self_approval', 'none'),
  ('event_coordinator', 'reimbursement_self_approval', 'none'),
  ('finance', 'reimbursement_self_approval', 'manage'),
  ('board', 'reimbursement_self_approval', 'none'),
  ('volunteer', 'reimbursement_self_approval', 'none')
) as v(role_name, resource_key, level)
join public.roles r on r.name = v.role_name
join public.resources res on res.key = v.resource_key;

-- Let reimbursement approvers/submitters read the self-approval threshold,
-- same reasoning as the event_expenses grant added in 20260823050000. Also
-- restores the finance_approvals clause that 20260823050000 added but
-- 20260824070000 (content_calendar) accidentally dropped while rebuilding
-- this same policy -- board holds finance_approvals:manage but not
-- system_settings/event_expenses, so without it board approvers can't read
-- the expense threshold either.
drop policy "app_settings select" on public.app_settings;
create policy "app_settings select" on public.app_settings for select to authenticated
  using (
    public.has_permission('system_settings', 'manage')
    or public.has_permission('event_expenses', 'manage')
    or public.has_permission('finance_approvals', 'manage')
    or public.has_permission('content_calendar', 'manage')
    or public.has_permission('reimbursements', 'manage')
    or public.has_permission('reimbursement_approvals', 'manage')
  );

-- Placeholder value only, independent from finance.expense_approval_threshold
-- so the two spend types can be tuned separately once the board decides on
-- real numbers (see planning/governance/roles-and-responsibilities.md,
-- issue #13).
insert into public.app_settings (key, value) values
  ('finance.reimbursement_approval_threshold', to_jsonb(500.00::numeric));

create function public.approve_reimbursement(p_id uuid)
returns public.reimbursements
language plpgsql
security definer
set search_path = public
as $$
declare
  v_reimbursement public.reimbursements;
  v_threshold numeric;
begin
  select * into v_reimbursement from public.reimbursements where id = p_id for update;
  if v_reimbursement.id is null then
    raise exception 'Reimbursement not found';
  end if;
  if v_reimbursement.status <> 'submitted' then
    raise exception 'Only submitted reimbursements can be approved';
  end if;

  if public.has_permission('reimbursement_approvals', 'manage') and v_reimbursement.submitted_by <> auth.uid() then
    update public.reimbursements
      set status = 'approved', approved_by = auth.uid(), approved_at = now()
      where id = p_id
      returning * into v_reimbursement;
    return v_reimbursement;
  end if;

  if public.has_permission('reimbursement_self_approval', 'manage') and v_reimbursement.submitted_by = auth.uid() then
    select (value #>> '{}')::numeric into v_threshold
      from public.app_settings where key = 'finance.reimbursement_approval_threshold';
    if v_threshold is null then
      raise exception 'Approval threshold is not configured';
    end if;
    if v_reimbursement.amount >= v_threshold then
      raise exception 'This reimbursement is at or above the approval threshold and requires a second approver';
    end if;
    update public.reimbursements
      set status = 'approved', approved_by = auth.uid(), approved_at = now()
      where id = p_id
      returning * into v_reimbursement;
    return v_reimbursement;
  end if;

  raise exception 'Not authorized to approve this reimbursement';
end;
$$;

create function public.reject_reimbursement(p_id uuid, p_reason text)
returns public.reimbursements
language plpgsql
security definer
set search_path = public
as $$
declare
  v_reimbursement public.reimbursements;
begin
  if p_reason is null or btrim(p_reason) = '' then
    raise exception 'A rejection reason is required';
  end if;

  select * into v_reimbursement from public.reimbursements where id = p_id for update;
  if v_reimbursement.id is null then
    raise exception 'Reimbursement not found';
  end if;
  if v_reimbursement.status <> 'submitted' then
    raise exception 'Only submitted reimbursements can be rejected';
  end if;
  if not (public.has_permission('reimbursement_approvals', 'manage') and v_reimbursement.submitted_by <> auth.uid()) then
    raise exception 'Not authorized to reject this reimbursement';
  end if;

  update public.reimbursements
    set status = 'rejected', rejected_at = now(), rejection_reason = btrim(p_reason)
    where id = p_id
    returning * into v_reimbursement;
  return v_reimbursement;
end;
$$;

create function public.mark_reimbursement_paid(p_id uuid)
returns public.reimbursements
language plpgsql
security definer
set search_path = public
as $$
declare
  v_reimbursement public.reimbursements;
begin
  if not public.has_permission('reimbursements', 'manage') then
    raise exception 'Not authorized to mark this reimbursement paid';
  end if;

  select * into v_reimbursement from public.reimbursements where id = p_id for update;
  if v_reimbursement.id is null then
    raise exception 'Reimbursement not found';
  end if;
  if v_reimbursement.status <> 'approved' then
    raise exception 'Only approved reimbursements can be marked paid';
  end if;

  update public.reimbursements
    set status = 'paid', paid_by = auth.uid(), paid_at = now()
    where id = p_id
    returning * into v_reimbursement;
  return v_reimbursement;
end;
$$;

grant execute on function public.approve_reimbursement(uuid) to authenticated;
grant execute on function public.reject_reimbursement(uuid, text) to authenticated;
grant execute on function public.mark_reimbursement_paid(uuid) to authenticated;

-- Home page "Outstanding reimbursements" widget (issue #51), same reasoning
-- as count_pending_event_expense_approvals (20260823120000): board holds
-- reimbursement_approvals:manage but not reimbursements:view, so a plain
-- RLS-scoped count would undercount for board approvers.
create function public.count_pending_reimbursement_approvals()
returns integer
language sql
security definer
set search_path = public
stable
as $$
  select case
    when public.has_permission('reimbursement_approvals', 'manage')
      then (select count(*)::integer from public.reimbursements where status = 'submitted')
    else 0
  end;
$$;

grant execute on function public.count_pending_reimbursement_approvals() to authenticated;

-- Board holds reimbursement_approvals:manage but people:none, so the
-- REIMBURSEMENT_COLUMNS people(name, email) embed on a joined select would
-- come back null for board approvers without this -- same carve-out pattern
-- as people_intake in 20260823160000_people_select_intake_carveout.sql.
drop policy "people select" on public.people;
create policy "people select" on public.people for select to authenticated
  using (
    public.has_permission('people', 'view')
    or public.has_permission('people_intake', 'manage')
    or public.has_permission('reimbursement_approvals', 'manage')
  );

-- Widen the audit_log table_name allow-list, same pattern as
-- 20260825010000_create_event_revenue.sql.
do $$
declare
  v_constraint_name text;
begin
  select conname into v_constraint_name
  from pg_constraint
  where conrelid = 'public.audit_log'::regclass and contype = 'c' and conname like '%table_name%';

  if v_constraint_name is not null then
    execute format('alter table public.audit_log drop constraint %I', v_constraint_name);
  end if;
end $$;

alter table public.audit_log
  add constraint audit_log_table_name_check
  check (table_name in ('donations', 'inventory_items', 'inventory_movements', 'event_expenses', 'user_roles', 'app_settings', 'calendar_items', 'pending_role_grants', 'content_opportunities', 'deactivated_users', 'event_revenue', 'reimbursements'));
