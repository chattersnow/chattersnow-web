-- #812: the public site's photos join the copy they sit beside.
--
-- Every `site_images.<slot>` row in app_settings was one of 28 image slots
-- edited from a flat grid under System Settings > Image settings, a page away
-- from the paragraph each photo accompanies. They are now `image` slots in the
-- site content registry (src/lib/site-content.ts), stored in `site_content`
-- under the same keys, so they are drafted, published and reverted the way
-- copy is (#793) and gated by `site_content:manage` through the same
-- functions. Nothing on the public side changes: `public_site_images` keeps
-- its columns and simply reads the published rows from the new table.
--
-- 1. Copy each tenant's configured slots across as published values ---------
--
-- Per tenant: every source row names its own tenant, which is what
-- docs/tenants.md asks of a migration that writes tenant rows. The old panel
-- had no delete grant and stored a cleared slot as "", which is "unset" and
-- is dropped rather than copied. Both tables audit their rows; a backfill
-- with no actor is noise there, so the triggers are off for the copy, as the
-- drafts migration did for its own.

alter table public.site_content disable trigger audit_log_row;
alter table public.app_settings disable trigger audit_log_row;

insert into public.site_content
  (tenant_id, key, value, updated_at, updated_by, published_at, published_by)
select s.tenant_id, s.key, s.value, s.updated_at, s.updated_by, s.updated_at, s.updated_by
from public.app_settings s
where s.key like 'site_images.%'
  and jsonb_typeof(s.value) = 'string'
  and s.value <> '""'::jsonb
on conflict (tenant_id, key) do nothing;

delete from public.app_settings where key like 'site_images.%';

alter table public.site_content enable trigger audit_log_row;
alter table public.app_settings enable trigger audit_log_row;

-- 2. The public view reads from site_content -------------------------------
--
-- Same column list as 20260906060000, so `create or replace` keeps the
-- anon/authenticated grants. `value is not null` is what excludes a slot
-- whose only state is a draft, exactly as public_site_content does.

create or replace view public.public_site_images as
select substring(key from length('site_images.') + 1) as slot, value
from public.site_content
where key like 'site_images.%'
  and value is not null
  and tenant_id = public.public_tenant_id();

grant select on public.public_site_images to anon, authenticated;

-- 3. Nothing left behind ----------------------------------------------------

do $$
declare
  v_left integer;
begin
  select count(*) into v_left
  from public.app_settings
  where key like 'site_images.%';
  if v_left > 0 then
    raise exception 'app_settings still holds % site_images rows', v_left;
  end if;
end $$;
