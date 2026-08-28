-- Public gear catalog: a curated, safe-to-expose view over inventory_items for
-- the anonymous /gears page. Only available items and non-sensitive columns are
-- surfaced — donor/donation linkage, face_value, notes, status, and audit
-- columns stay behind the authenticated-only RLS policy on the base table.
-- auto_expose_new_tables is off in this project's config, so the grant below
-- is required alongside the view definition.

create view public.public_gear_catalog as
select
  id,
  description,
  size,
  type,
  gender,
  condition,
  photo_url,
  created_at
from public.inventory_items
where status = 'available';

grant select on public.public_gear_catalog to anon, authenticated;
