-- Private document storage, and governance records that can hold a file
-- (#1489, part of #1485).
--
-- Every governance record took its document only as `external_link`, a URL
-- with no preview. This adds the private `documents` bucket that governance
-- uses now and finance receipts (#1490) will reuse, and an object-path column
-- beside each existing link column.
--
-- The shape is artwork-submissions' (20260909040000): a *private* bucket with
-- no `anon` policy, every object under `{tenant_id}/`, and every read through a
-- short-lived signed URL minted server-side behind the page's own permission
-- check. A public URL is never stored.
--
-- Paths are `{tenant_id}/{module}/{uuid}/{file name}`. The second folder names
-- the module whose permission governs the object, so each module brings its
-- own four policies below rather than one policy growing a CASE per module;
-- #1490 adds `finance/`. The uuid folder keeps the original file name readable
-- (it is what the portal shows) without letting two uploads collide.

-- Storage ---------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'documents',
  'documents',
  false,
  -- 10 MiB. Supabase Free shares 1 GB of Storage across every bucket, and a
  -- PDF is stored as uploaded; photos of paper are re-encoded in the browser
  -- first and land well under this. A scanned bylaws PDF past 10 MB can still
  -- be linked from Drive.
  10485760,
  -- PDF plus the three image types every other bucket takes. No DOCX/XLSX:
  -- the portal cannot preview them, and a signed-URL download of an editable
  -- office file invites the copy to drift from the record.
  array['application/pdf', 'image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
  set public             = excluded.public,
      file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Read. The same grant that reads the governance tables reads their files, so
-- a board member with governance:view opens the document the page shows them
-- and nobody else can resolve a path they were handed.
drop policy if exists "documents governance select" on storage.objects;
create policy "documents governance select" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'documents'
    and (storage.foldername(name))[1] = (select public.current_tenant_id())::text
    and (storage.foldername(name))[2] = 'governance'
    and public.has_permission('governance', 'view')
  );

-- Write. Exactly three folder levels, tenant / module / upload. Not on the
-- demo tenant, for publication-files' reason: the demo hands anonymous
-- visitors admin, and this bucket takes 10 MiB PDFs.
drop policy if exists "documents governance insert" on storage.objects;
create policy "documents governance insert" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'documents'
    and (storage.foldername(name))[1] = (select public.current_tenant_id())::text
    and (storage.foldername(name))[2] = 'governance'
    and array_length(storage.foldername(name), 1) = 3
    and not public.current_tenant_is_demo()
    and public.has_permission('governance', 'manage')
  );

drop policy if exists "documents governance update" on storage.objects;
create policy "documents governance update" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'documents'
    and (storage.foldername(name))[1] = (select public.current_tenant_id())::text
    and (storage.foldername(name))[2] = 'governance'
    and not public.current_tenant_is_demo()
    and public.has_permission('governance', 'manage')
  )
  with check (
    bucket_id = 'documents'
    and (storage.foldername(name))[1] = (select public.current_tenant_id())::text
    and (storage.foldername(name))[2] = 'governance'
    and array_length(storage.foldername(name), 1) = 3
  );

drop policy if exists "documents governance delete" on storage.objects;
create policy "documents governance delete" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'documents'
    and (storage.foldername(name))[1] = (select public.current_tenant_id())::text
    and (storage.foldername(name))[2] = 'governance'
    and public.has_permission('governance', 'manage')
  );

-- Columns ---------------------------------------------------------------------
--
-- A second column rather than a second meaning for `external_link`: a reader
-- that had to tell a URL from an object path by looking at it would get it
-- wrong the day someone pastes a relative link. At most one of the two is set.
-- The path must sit under the row's own tenant and the governance folder, so a
-- row cannot be pointed at another organization's file or at a finance one.

do $columns$
declare
  t text;
begin
  foreach t in array array[
    'bylaws',
    'policies',
    'resolutions',
    'conflict_of_interest_disclosures',
    'annual_requirements',
    'agendas'
  ] loop
    execute format('alter table public.%I add column if not exists document_path text', t);
    execute format(
      'alter table public.%I drop constraint if exists %I',
      t, t || '_one_document'
    );
    execute format(
      'alter table public.%I add constraint %I check (num_nonnulls(external_link, document_path) <= 1)',
      t, t || '_one_document'
    );
    execute format(
      'alter table public.%I drop constraint if exists %I',
      t, t || '_document_path_in_tenant'
    );
    execute format(
      $sql$alter table public.%I add constraint %I check (
        document_path is null
        or document_path like tenant_id::text || '/governance/%%'
      )$sql$,
      t, t || '_document_path_in_tenant'
    );
    execute format(
      $sql$comment on column public.%I.document_path is
        'Object path in the private documents bucket ({tenant_id}/governance/{uuid}/{file name}), read through a signed URL. Mutually exclusive with external_link (#1489).'$sql$,
      t
    );
  end loop;
end;
$columns$;
