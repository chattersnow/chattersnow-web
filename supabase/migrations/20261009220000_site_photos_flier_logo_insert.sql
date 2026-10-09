-- Let Events managers upload a flier, and Organization Settings upload the
-- branding logo and app icon, to `site-photos` (#1487, #1488).
--
-- Same shape as 20261009180000, which let People managers in for a team
-- member's photo; that grant now also covers a sponsor's logo
-- (`people.logo_url`), which saves under people:manage too. The two new
-- writers save under events:manage (`events.flier_url`) and
-- system_settings:manage (`brand.logo_url`, `brand.app_icon_url`).
--
-- One bucket rather than a separate `brand-assets` one, because every reason
-- this bucket is public applies unchanged: a flier is on the public event
-- page, a sponsor logo on the public wall, and a branding logo in the site
-- header and every outgoing email, all fetched with no session. Its
-- allowed_mime_types already include PNG and WebP, which is what a logo needs
-- to keep its transparency, and one bucket means one orphan sweep (#1492),
-- whose reference list already names all four columns.
--
-- Insert only. Delete stays site_content:manage, as it did for People: a
-- replaced upload from these writers is left for the sweep. The demo-tenant
-- refusal is unchanged.
drop policy if exists "site-photos tenant insert" on storage.objects;
create policy "site-photos tenant insert" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'site-photos'
    and (storage.foldername(name))[1] = (select public.current_tenant_id())::text
    and array_length(storage.foldername(name), 1) = 1
    and not public.current_tenant_is_demo()
    and (
      public.has_permission('site_content', 'manage')
      or public.has_permission('people', 'manage')
      or public.has_permission('events', 'manage')
      or public.has_permission('system_settings', 'manage')
    )
  );
