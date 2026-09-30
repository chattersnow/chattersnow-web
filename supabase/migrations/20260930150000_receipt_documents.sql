-- Expense and reimbursement receipts as an uploaded file, not only a link
-- (#1490, part of #1485).
--
-- Reuses the private `documents` bucket from 20260930120000 (#1489). Receipts
-- live under `{tenant_id}/receipts/{uuid}/{file name}` and each table gets a
-- `receipt_path` beside its existing `receipt_url`, at most one of the two set.
--
-- Reads follow the row, not a module grant. Governance can say "governance:view
-- reads the folder" because one grant reads every governance table; receipts
-- sit on two tables with different audiences -- event_expenses:view for
-- expenses, reimbursements:view *or* reimbursement_approvals:manage for
-- reimbursements (board approves without holding finance access) -- and
-- finance:view is documented as "not enough to read a ledger". So a receipt
-- resolves for whoever can see a row that points at it: the subqueries below
-- run under those tables' own RLS, tenant check included. The uploader can
-- also read their own object, which covers the minutes between upload and
-- Save and a submitter reading back the receipt they attached.

-- Columns ---------------------------------------------------------------------

do $columns$
declare
  t text;
begin
  foreach t in array array['event_expenses', 'reimbursements'] loop
    execute format('alter table public.%I add column if not exists receipt_path text', t);
    execute format(
      'alter table public.%I drop constraint if exists %I',
      t, t || '_one_receipt'
    );
    execute format(
      'alter table public.%I add constraint %I check (num_nonnulls(receipt_url, receipt_path) <= 1)',
      t, t || '_one_receipt'
    );
    execute format(
      'alter table public.%I drop constraint if exists %I',
      t, t || '_receipt_path_in_tenant'
    );
    execute format(
      $sql$alter table public.%I add constraint %I check (
        receipt_path is null
        or receipt_path like tenant_id::text || '/receipts/%%'
      )$sql$,
      t, t || '_receipt_path_in_tenant'
    );
    -- The read policy below looks rows up by path on every signed URL.
    execute format(
      'create index if not exists %I on public.%I (receipt_path) where receipt_path is not null',
      t || '_receipt_path_idx', t
    );
    execute format(
      $sql$comment on column public.%I.receipt_path is
        'Object path in the private documents bucket ({tenant_id}/receipts/{uuid}/{file name}), read through a signed URL. Mutually exclusive with receipt_url (#1490).'$sql$,
      t
    );
  end loop;
end;
$columns$;

-- Storage ---------------------------------------------------------------------

drop policy if exists "documents receipts select" on storage.objects;
create policy "documents receipts select" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'documents'
    and (storage.foldername(name))[1] = (select public.current_tenant_id())::text
    and (storage.foldername(name))[2] = 'receipts'
    and (
      owner_id = (select auth.uid())::text
      or exists (
        select 1 from public.event_expenses e where e.receipt_path = objects.name
      )
      or exists (
        select 1 from public.reimbursements r where r.receipt_path = objects.name
      )
    )
  );

-- Write. Whoever records either kind of spend may upload a receipt for it.
-- Not on the demo tenant, for the governance folder's reason.
drop policy if exists "documents receipts insert" on storage.objects;
create policy "documents receipts insert" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'documents'
    and (storage.foldername(name))[1] = (select public.current_tenant_id())::text
    and (storage.foldername(name))[2] = 'receipts'
    and array_length(storage.foldername(name), 1) = 3
    and not public.current_tenant_is_demo()
    and (
      public.has_permission('event_expenses', 'manage')
      or public.has_permission('reimbursements', 'manage')
    )
  );

drop policy if exists "documents receipts update" on storage.objects;
create policy "documents receipts update" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'documents'
    and (storage.foldername(name))[1] = (select public.current_tenant_id())::text
    and (storage.foldername(name))[2] = 'receipts'
    and owner_id = (select auth.uid())::text
    and not public.current_tenant_is_demo()
  )
  with check (
    bucket_id = 'documents'
    and (storage.foldername(name))[1] = (select public.current_tenant_id())::text
    and (storage.foldername(name))[2] = 'receipts'
    and array_length(storage.foldername(name), 1) = 3
  );

-- Delete only your own upload. A saved receipt is the evidence behind an
-- approval, and `DocumentField` only ever deletes what its own session
-- uploaded; anything no row points at any more is the daily sweep's to remove.
drop policy if exists "documents receipts delete" on storage.objects;
create policy "documents receipts delete" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'documents'
    and (storage.foldername(name))[1] = (select public.current_tenant_id())::text
    and (storage.foldername(name))[2] = 'receipts'
    and owner_id = (select auth.uid())::text
  );
