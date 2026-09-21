-- Issue #1310: make a skipped send visible in the delivery ledger, and say why.
--
-- The premise of the delivery log is that `notification_deliveries` answers
-- "did it go?". For three of the four outcomes it does. For the fourth it did
-- not answer at all: `deliverEmail()` returned 'skipped' *without writing a
-- row*, so a receipt suppressed by somebody's opt-out left no trace anywhere
-- -- the status value has existed since 20260906140000 and nothing has ever
-- written it. An administrator asking why an artwork confirmation never
-- arrived found the same silence in the ledger as in the provider's dashboard,
-- which is the dead end #1310 exists to close.
--
-- 20260906140000 said the ledger "doubles as the evidence that an opt-out was
-- honored". This is the column and the row that make that true.
--
-- Only the skip deliverEmail() makes for itself is recorded here -- the
-- person's own opt-out. The other three are decided by the caller before a row
-- is ever claimed: the org-wide kill switch, an automatic reply switched off
-- for its kind, and a recipient with no address at all. Those write nothing
-- and are named on the screen instead, which is the honest thing for a ledger
-- that was never reached to say. The check constraint carries all four
-- spellings anyway, so moving one of those checks inward later is a code
-- change and not another migration.

alter table public.notification_deliveries
  add column skip_reason text
    check (skip_reason in (
      'opted_out',
      'no_address',
      'org_email_off',
      'auto_reply_off'
    ));

-- A reason only means something next to a skip. Without this, a 'sent' row
-- could carry "we didn't send it", and the screen would have to decide which
-- of the two columns to believe.
alter table public.notification_deliveries
  add constraint notification_deliveries_skip_reason_needs_skip
    check (skip_reason is null or status = 'skipped');

comment on column public.notification_deliveries.skip_reason is
  'Why nothing was sent, for a status of skipped (#1310). Null for every other status. Not every skip reaches this table: the org-wide kill switch and a disabled automatic reply stop the send before a row is claimed.';

-- The delivery log's own query: this tenant's rows, newest first. The existing
-- notification_deliveries_tenant_id_idx cannot serve the sort, so without this
-- every page of the log is a sort of the whole tenant's mail history.
create index notification_deliveries_tenant_created_idx
  on public.notification_deliveries (tenant_id, created_at desc);
