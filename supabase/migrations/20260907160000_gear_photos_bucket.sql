-- #781: the first Supabase Storage bucket in this project.
--
-- Gear photos taken on a volunteer's phone at donation intake, and swapped in
-- later from the inventory item editor. The full public URL is written to the
-- existing `inventory_items.photo_url` column, so every read site
-- (public_gear_catalog, inventory-card, gear-detail-sheet, gear-cart-sheet,
-- both edit modals) is unchanged and legacy Google Drive links keep working.
--
-- Public, deliberately, and recorded as such in technical-spec.md §7.5. Gear
-- photos are already effectively public: Drive anyone-with-link today, and
-- rendered for `anon` on /gears. A public bucket gives stable URLs and clean
-- next/image caching with no signing step. Writes stay RLS-gated below and the
-- object name is an unguessable UUID under the tenant's own prefix. Nothing
-- private is ever intended to enter this bucket; a bucket for anything that is
-- stays private per §7.5.
--
-- Note that the tenant id is visible in every public URL. It is an opaque UUID
-- that grants nothing on its own, but it is a new fact about the system and is
-- written down in §7.5 alongside the carve-out.

-- `do update`, not `do nothing`: on a project where somebody created the bucket
-- by hand in the dashboard first, `do nothing` would silently leave it private
-- and the feature would half-work with no error anywhere. This makes the
-- migration the source of truth while staying idempotent.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'gear-photos',
  'gear-photos',
  true,
  5242880, -- 5 MiB. A 1600px q0.8 JPEG is ~250 KB; this is headroom, not a target.
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
  set public             = excluded.public,
      file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- `storage.objects` is one table shared by every bucket this project will ever
-- have, so the policies are named for the bucket rather than for the table.
-- `drop policy if exists` first because there is no `create policy if not
-- exists`, and this file has to survive being re-run against a project where
-- the policies were made in the dashboard.
--
-- `(select public.current_tenant_id())` is wrapped so the planner evaluates it
-- once as an InitPlan rather than once per row -- the rule stated at
-- 20260905180000:119-121 and followed by every policy since.
-- `public.has_permission(...)` is left bare, matching all of its other call
-- sites; it takes arguments, so it is not a parameterless InitPlan candidate.
--
-- current_tenant_id() resolves from user_tenant_selection / sole membership and
-- depends only on auth.uid(), never on a request header, so it evaluates
-- correctly inside storage-api's RLS check just as it does under PostgREST.

-- Read. The bucket is public, so an anonymous GET of a known URL never reaches
-- RLS at all -- this policy is for the *authenticated* API surface. `.remove()`
-- and `.list()` resolve objects through `select` in storage-api, and without a
-- select policy a Remove click returns an empty array with no error rather than
-- deleting anything.
drop policy if exists "gear-photos tenant select" on storage.objects;
create policy "gear-photos tenant select" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'gear-photos'
    and (storage.foldername(name))[1] = (select public.current_tenant_id())::text
    and (
      public.has_permission('inventory', 'manage')
      or public.has_permission('inventory_intake', 'manage')
    )
  );

-- Write. `array_length(storage.foldername(name), 1) = 1` pins an object to
-- exactly one folder level, so a caller cannot build a tree or a `../`-shaped
-- path in a bucket that is meant to be flat. The filename itself is not
-- regex-checked: that would couple this migration to the client's `{uuid}.jpg`
-- convention for no security gain, since allowed_mime_types above is what
-- actually decides what may be stored.
--
-- `not current_tenant_is_demo()` is the load-bearing line. The demo tenant
-- (20260907000000) hands anonymous visitors admin, so without it this bucket is
-- an anonymous, unauthenticated public image host on the same Supabase project
-- as production. That is the exact class of control that migration already
-- closes for pending_role_grants, support access and deactivation. The demo can
-- still show gear photos -- seed_demo_tenant() writes photo_url values directly,
-- and the "use a link instead" affordance still works.
drop policy if exists "gear-photos tenant insert" on storage.objects;
create policy "gear-photos tenant insert" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'gear-photos'
    and (storage.foldername(name))[1] = (select public.current_tenant_id())::text
    and array_length(storage.foldername(name), 1) = 1
    and not public.current_tenant_is_demo()
    and (
      public.has_permission('inventory', 'manage')
      or public.has_permission('inventory_intake', 'manage')
    )
  );

-- Update exists for upsert and for storage-api's move/copy. The client always
-- generates a fresh UUID so it should never fire, but an update with no policy
-- on an RLS table is a silent no-op rather than a refusal. Both halves are
-- present so a row cannot be updated *out of* the tenant's own prefix.
drop policy if exists "gear-photos tenant update" on storage.objects;
create policy "gear-photos tenant update" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'gear-photos'
    and (storage.foldername(name))[1] = (select public.current_tenant_id())::text
    and not public.current_tenant_is_demo()
    and (
      public.has_permission('inventory', 'manage')
      or public.has_permission('inventory_intake', 'manage')
    )
  )
  with check (
    bucket_id = 'gear-photos'
    and (storage.foldername(name))[1] = (select public.current_tenant_id())::text
    and array_length(storage.foldername(name), 1) = 1
  );

drop policy if exists "gear-photos tenant delete" on storage.objects;
create policy "gear-photos tenant delete" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'gear-photos'
    and (storage.foldername(name))[1] = (select public.current_tenant_id())::text
    and (
      public.has_permission('inventory', 'manage')
      or public.has_permission('inventory_intake', 'manage')
    )
  );
