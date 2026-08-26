-- Add an optional flier/promo image link to events, so staff can attach one
-- from the portal for display on the public site (issue #168). Follows the
-- external-link convention already used for inventory_items.photo_url and
-- people.logo_url — no in-app upload (see #34, deferred).

alter table public.events
  add column flier_url text check (flier_url ~* '^https?://');
