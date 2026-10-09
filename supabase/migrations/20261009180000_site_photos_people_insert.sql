-- Let a People manager upload a team member's photo to `site-photos` (#1486).
--
-- The public team card on a person's record is saved under people:manage
-- (`public_team_members` RLS, 20260913120000), but the bucket's insert policy
-- (20260921050000) asked for site_content:manage alone, so somebody who can
-- list a person on the Meet the Team page could paste a link for their photo
-- and not upload one.
--
-- Insert only. Delete stays site_content:manage: the bucket is shared with
-- every Website image slot, and a People manager has no business removing
-- those. Their own discarded uploads are left for the site-photos sweep
-- (#1492) -- deleteSitePhoto() is best-effort and swallows the refusal.
--
-- Everything else in the policy is unchanged, including the demo-tenant
-- refusal that keeps this bucket from being an anonymous image host.
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
    )
  );
