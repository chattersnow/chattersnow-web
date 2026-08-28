-- Issue #407: milestones need a way to be marked as no longer applicable
-- (distinct from not_started/in_progress/done). Follows the same
-- drop-and-recreate check-constraint pattern as
-- 20260827000000_add_being_reviewed_status_to_volunteer_applications, and
-- reuses the "cancelled" spelling/label already used for event and meeting
-- status elsewhere in the app.
alter table public.nonprofit_status_milestones drop constraint nonprofit_status_milestones_status_check;
alter table public.nonprofit_status_milestones add constraint nonprofit_status_milestones_status_check
  check (status in ('not_started', 'in_progress', 'done', 'cancelled'));
