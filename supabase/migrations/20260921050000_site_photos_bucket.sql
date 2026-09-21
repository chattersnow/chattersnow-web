-- #921: a bucket for the photos on the public site.
--
-- Setting one photo at Administration > Site Content meant leaving the app for
-- Google Drive: find the file, Share, change access to "Anyone with the link",
-- Copy link, come back, paste -- forty-six slots over, with three steps an
-- editor can get wrong in ways the app cannot see (a folder link serves HTML;
-- an unshared file 403s for everyone but the person who pasted it). This is
-- where an uploaded photo goes instead. The paste box stays: a photo already
-- on the web, or already in Drive, should not have to be re-uploaded, and
-- every link stored today keeps working untouched. Nothing is migrated.
--
-- Modelled on 20260907160000 (gear-photos), the project's first bucket, and
-- deliberately *not* that bucket. Two reasons, the second decisive:
--
--   1. Its policies gate on inventory:manage / inventory_intake:manage. The
--      permission that should apply to a site photo is site_content:manage --
--      the same one `save_site_content_drafts` and `publish_site_content`
--      require, so whoever can set the copy can set the picture beside it.
--   2. `runGearPhotoPurge` (src/lib/storage/orphan-purge.ts) deletes every
--      object in gear-photos that no `inventory_items.photo_url` points at and
--      is older than 24 hours. A site photo parked in that bucket would be
--      swept within a day.
--
-- Public, for the same reason gear-photos is and recorded in technical-spec
-- §7.5 alongside it: these photos are already public by definition -- they are
-- the pictures on the public website, rendered for `anon` with no session
-- anywhere in the request. A public bucket gives stable URLs and clean
-- next/image caching with no signing step. Writes stay RLS-gated below and the
-- object name is an unguessable UUID under the tenant's own prefix. The tenant
-- id is visible in the public URL, as it already is for gear photos: an opaque
-- UUID that grants nothing on its own.

-- `do update`, not `do nothing`: on a project where somebody created the
-- bucket by hand in the dashboard first, `do nothing` would silently leave it
-- private and the feature would half-work with no error anywhere.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'site-photos',
  'site-photos',
  true,
  -- 5 MiB, matching gear-photos. The client re-encodes to a 2400px q0.8 JPEG
  -- before it uploads (Supabase image transformations are Pro-only, so the
  -- resize has to happen in the browser), which lands around 400-700 KB. This
  -- is the backstop for a photo that compresses badly, not a target.
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
  set public             = excluded.public,
      file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- `storage.objects` is one table shared by every bucket, so the policies are
-- named for the bucket rather than for the table. `drop policy if exists`
-- first because there is no `create policy if not exists`, and this file has
-- to survive being re-run against a project where the policies were made in
-- the dashboard.
--
-- `(select public.current_tenant_id())` is wrapped so the planner evaluates it
-- once as an InitPlan rather than once per row -- the rule stated at
-- 20260905180000:119-121 and followed by every policy since.
-- `public.has_permission(...)` is left bare, matching all of its other call
-- sites; it takes arguments, so it is not a parameterless InitPlan candidate.

-- Read. The bucket is public, so an anonymous GET of a known URL never reaches
-- RLS at all -- this policy is for the *authenticated* API surface. `.remove()`
-- and `.list()` resolve objects through `select` in storage-api, and without a
-- select policy a Remove click returns an empty array with no error rather
-- than deleting anything.
drop policy if exists "site-photos tenant select" on storage.objects;
create policy "site-photos tenant select" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'site-photos'
    and (storage.foldername(name))[1] = (select public.current_tenant_id())::text
    and public.has_permission('site_content', 'manage')
  );

-- Write. `array_length(storage.foldername(name), 1) = 1` pins an object to
-- exactly one folder level, so a caller cannot build a tree or a `../`-shaped
-- path in a bucket that is meant to be flat. The filename itself is not
-- regex-checked: that would couple this migration to the client's `{uuid}.jpg`
-- convention for no security gain, since allowed_mime_types above is what
-- actually decides what may be stored.
--
-- `not current_tenant_is_demo()` is the load-bearing line. The demo tenant
-- (20260907000000) hands anonymous visitors admin, so without it this bucket
-- is an anonymous, unauthenticated public image host on the same Supabase
-- project as production. The demo can still show its site photos --
-- seed_demo_tenant() writes `site_images.*` values directly, and the paste box
-- still works.
drop policy if exists "site-photos tenant insert" on storage.objects;
create policy "site-photos tenant insert" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'site-photos'
    and (storage.foldername(name))[1] = (select public.current_tenant_id())::text
    and array_length(storage.foldername(name), 1) = 1
    and not public.current_tenant_is_demo()
    and public.has_permission('site_content', 'manage')
  );

-- Update exists for upsert and for storage-api's move/copy. The client always
-- generates a fresh UUID so it should never fire, but an update with no policy
-- on an RLS table is a silent no-op rather than a refusal. Both halves are
-- present so a row cannot be updated *out of* the tenant's own prefix.
drop policy if exists "site-photos tenant update" on storage.objects;
create policy "site-photos tenant update" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'site-photos'
    and (storage.foldername(name))[1] = (select public.current_tenant_id())::text
    and not public.current_tenant_is_demo()
    and public.has_permission('site_content', 'manage')
  )
  with check (
    bucket_id = 'site-photos'
    and (storage.foldername(name))[1] = (select public.current_tenant_id())::text
    and array_length(storage.foldername(name), 1) = 1
  );

-- Delete is for the photo an editor uploads and then replaces in the same
-- sitting, before anything has been saved. A *published* photo is never
-- deleted from here: `site_content` holds a draft value and a published one,
-- so an object the editor has replaced on screen may still be the picture the
-- live site is serving. See the client field for the rule, and #921 for the
-- sweep that collects the rest.
drop policy if exists "site-photos tenant delete" on storage.objects;
create policy "site-photos tenant delete" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'site-photos'
    and (storage.foldername(name))[1] = (select public.current_tenant_id())::text
    and public.has_permission('site_content', 'manage')
  );
