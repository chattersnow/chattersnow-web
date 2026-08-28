-- Bug fix, surfaced by issue #322's new update/delete integration coverage:
-- volunteer_hours (20260823030000) wired up the shared set_updated_at
-- trigger, but that trigger function (20260819000000) writes both
-- new.updated_at and new.updated_by -- every other table using it
-- (volunteer_role_types, programs, etc.) has both columns. volunteer_hours
-- only had updated_at, so any update on the table failed with "record \"new\"
-- has no field \"updated_by\"" (42703), same bug and same fix as
-- 20260826230000 for volunteer_applications. This went unnoticed because
-- nothing previously exercised updateVolunteerHoursAction end to end.

alter table public.volunteer_hours
  add column updated_by uuid references auth.users(id);
