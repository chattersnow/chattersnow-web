-- Issue #268: public pages need to read admin-configured Google Drive image
-- URLs (stored as `site_images.<slot>` keys in the existing app_settings
-- table) without gaining access to unrelated settings like the finance
-- approval thresholds, so expose only that slice through a public view —
-- same pattern as public_gear_catalog/public_events/etc. New slots are just
-- new rows under this key prefix, so this view never needs to change.
create view public.public_site_images as
select
  substring(key from length('site_images.') + 1) as slot,
  value
from public.app_settings
where key like 'site_images.%';

grant select on public.public_site_images to anon, authenticated;
