-- count_pending_event_expense_approvals / count_pending_reimbursement_approvals
-- (20260823120000, 20260826000000) counted every `submitted` row once the
-- caller held finance_approvals/reimbursement_approvals:manage, including
-- rows the caller themselves submitted -- which approve_event_expense /
-- approve_reimbursement (20260823050000) never let that same caller approve
-- (submitted_by <> auth.uid() is required on that path). That mismatch
-- inflated the portal's "N expenses to approve" badge with items the viewer
-- could never act on. Rebuild both counts to mirror the approve RPCs'
-- authorization exactly: an approver-held permission excluding self-submitted
-- rows, plus self-approval-eligible rows (self-approval permission held,
-- caller is the submitter, amount under the configured threshold).

create or replace function public.count_pending_event_expense_approvals()
returns integer
language sql
security definer
set search_path = public
stable
as $$
  select count(*)::integer
  from public.event_expenses e
  where e.status = 'submitted'
    and (
      (public.has_permission('finance_approvals', 'manage') and e.submitted_by <> auth.uid())
      or (
        public.has_permission('finance_self_approval', 'manage')
        and e.submitted_by = auth.uid()
        and e.amount < coalesce(
          (select (value #>> '{}')::numeric from public.app_settings
            where key = 'finance.expense_approval_threshold'),
          0
        )
      )
    );
$$;

create or replace function public.count_pending_reimbursement_approvals()
returns integer
language sql
security definer
set search_path = public
stable
as $$
  select count(*)::integer
  from public.reimbursements r
  where r.status = 'submitted'
    and (
      (public.has_permission('reimbursement_approvals', 'manage') and r.submitted_by <> auth.uid())
      or (
        public.has_permission('reimbursement_self_approval', 'manage')
        and r.submitted_by = auth.uid()
        and r.amount < coalesce(
          (select (value #>> '{}')::numeric from public.app_settings
            where key = 'finance.reimbursement_approval_threshold'),
          0
        )
      )
    );
$$;
