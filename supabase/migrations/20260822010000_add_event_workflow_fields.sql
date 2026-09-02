-- Event lifecycle workflow: Basic/Planning fields not yet on `events`
-- (description, event_type, venue, capacity, registration, budget, lead)
-- plus After-phase report fields. See docs/technical-spec.md §5.2, §5.5.

alter table public.events
  add column description text,
  add column event_type text,
  add column venue text,
  add column capacity integer check (capacity is null or capacity >= 0),
  add column registration_enabled boolean not null default false,
  add column registration_deadline timestamptz,
  add column budget_amount numeric(10, 2) check (budget_amount is null or budget_amount >= 0),
  add column event_lead_id uuid references auth.users(id),
  add column report_status text not null default 'not_started'
    check (report_status in ('not_started', 'in_progress', 'submitted')),
  add column report_summary text,
  add column lessons_learned text,
  add column feedback_notes text,
  add column content_notes text,
  add column report_submitted_at timestamptz,
  add column report_submitted_by uuid references auth.users(id);

-- Widen the status lifecycle per §5.2 (draft, published, completed, cancelled, archived).
alter table public.events drop constraint events_status_check;
alter table public.events add constraint events_status_check
  check (status in ('draft', 'published', 'completed', 'cancelled', 'archived'));
