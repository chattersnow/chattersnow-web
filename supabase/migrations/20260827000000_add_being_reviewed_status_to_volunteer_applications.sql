-- Adds a "being reviewed" status so admins can mark an application as
-- picked up before they've made contact or a placement decision (issue
-- #329), sitting between 'new' and 'contacted'.
alter table public.volunteer_applications drop constraint volunteer_applications_status_check;
alter table public.volunteer_applications add constraint volunteer_applications_status_check
  check (status in ('new', 'being reviewed', 'contacted', 'placed', 'declined', 'closed'));
