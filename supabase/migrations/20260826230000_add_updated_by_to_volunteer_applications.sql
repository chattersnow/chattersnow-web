-- Bug fix, surfaced by issue #173: volunteer_applications (20260825000000)
-- wired up the shared set_updated_at trigger, but that trigger function
-- (20260819000000) writes both new.updated_at and new.updated_by -- every
-- other table using it (volunteer_role_types, content_opportunities, etc.)
-- has both columns. volunteer_applications only had updated_at, so any
-- update on the table failed with "record \"new\" has no field
-- \"updated_by\"" (42703). This went unnoticed because nothing updated the
-- table before the ops-inbox status workflow added in this same issue.

alter table public.volunteer_applications
  add column updated_by uuid references auth.users(id);
