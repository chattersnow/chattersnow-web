-- After-phase partner follow-up, tracked per sponsor/partner link since
-- follow-up is per-partner, not per-event.

alter table public.event_sponsors
  add column follow_up_status text not null default 'not_started'
    check (follow_up_status in ('not_started', 'in_progress', 'done')),
  add column follow_up_notes text;
