-- Event shifts currently have no concept of role: `event_volunteers.role` is
-- free text typed per signup, even when the signup is tied to a shift. This
-- adds an optional FK to the existing volunteer_role_types catalog so a
-- shift's role can drive the signup's displayed role instead (issue #345).
alter table public.event_shifts
  add column volunteer_role_type_id uuid references public.volunteer_role_types(id) on delete set null;
