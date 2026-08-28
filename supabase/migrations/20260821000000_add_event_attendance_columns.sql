-- Simple event-level headcount; no per-attendee table (per product decision).
alter table public.events
  add column attendance_count integer check (attendance_count is null or attendance_count >= 0),
  add column attendance_notes text;
