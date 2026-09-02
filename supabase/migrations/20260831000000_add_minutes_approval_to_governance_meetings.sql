-- Adds minutes-approval tracking to governance_meetings (issue #522). Minutes
-- aren't a separate entity in this schema (folded into Agenda's body_text
-- per issue #408), so "approving the previous meeting's minutes" is recorded
-- against the *current* meeting doing the approving, not the prior one.
-- A single approver marking it done is sufficient (no separate vote entity) --
-- mirrors the approved_by/approved_at pattern already used for expense and
-- reimbursement approvals (auth.users id + timestamp).

alter table public.governance_meetings
  add column minutes_approved_at timestamptz,
  add column minutes_approved_by uuid references auth.users(id);
