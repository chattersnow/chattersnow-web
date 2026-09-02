-- Issue #525: event_expenses and reimbursements are fully independent --
-- there's no concept of who personally fronted an expense, and no way to
-- carry an expense's details over into a reimbursement request. Add both:
-- paid_by_person_id marks an expense as personally-fronted (its presence IS
-- the "is this reimbursable" flag -- no separate boolean needed), and
-- source_expense_id traces a reimbursement back to the expense it was
-- created from. This deliberately doesn't touch either table's approval
-- workflow (finance_approvals/finance_self_approval vs.
-- reimbursement_approvals/reimbursement_self_approval stay independent, per
-- 20260826000000's reasoning) -- only adds the missing linkage.

alter table public.event_expenses
  add column paid_by_person_id uuid references public.people(id);

alter table public.reimbursements
  add column source_expense_id uuid references public.event_expenses(id);

-- At most one reimbursement per source expense, so "Create reimbursement
-- from this expense" can't be used twice on the same expense (also guards
-- against a duplicate submit racing the UI's own check).
create unique index reimbursements_source_expense_id_key
  on public.reimbursements (source_expense_id)
  where source_expense_id is not null;
