-- Add optional logo/website fields to people, so sponsor/partner records
-- can carry a public-facing logo and link for display on the public site.

alter table public.people
  add column logo_url text check (logo_url ~* '^https?://'),
  add column website text check (website ~* '^https?://');
