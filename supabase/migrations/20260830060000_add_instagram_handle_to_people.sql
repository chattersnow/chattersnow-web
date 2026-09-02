-- Add an optional Instagram handle to people, so donors/sponsors/volunteers
-- can be tagged on social. Stored without a leading "@" (stripped client/
-- server-side before it reaches here, same treatment as logo_url/website).

alter table public.people
  add column instagram_handle text check (instagram_handle ~ '^[A-Za-z0-9._]{1,30}$');
