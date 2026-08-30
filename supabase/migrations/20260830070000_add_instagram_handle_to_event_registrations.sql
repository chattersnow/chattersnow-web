-- Capture an Instagram handle at event-registration time, same treatment as
-- phone: stored per-registration rather than only on the linked people row.

alter table public.event_registrations
  add column instagram_handle text check (instagram_handle ~ '^[A-Za-z0-9._]{1,30}$');
