-- Issue #136: explicit per-registrant check-in. A walk-in (no
-- pre-registration) gets its own event_registrations row inserted directly
-- at check-in time (party_size defaulting to 1, checked_in_at set
-- immediately) rather than a separate table, so "who attended" is always
-- one query against this table. events.attendance_count/attendance_notes
-- (20260821000000) stay a separate manual estimate - not derived from this.

alter table public.event_registrations
  add column checked_in_at timestamptz;
