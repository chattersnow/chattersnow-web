-- Issue #743: let the delivery ledger record a message that is not addressed
-- to a person.
--
-- The leadership ops report goes to a shared inbox configured per tenant in
-- app_settings ('notifications.ops_report_recipients'), not to a `people` row.
-- That is deliberate -- the address is usually a distribution list with no
-- portal account behind it, and who receives the organization's daily
-- operating picture is a governance decision the audit-log trigger on
-- app_settings should record. But notification_deliveries.person_id is
-- `not null`, and the ledger is not optional: it is the idempotency mechanism
-- ("re-running the job the same day does not re-send"), not just a record.
--
-- So person_id becomes nullable, meaning "addressed to the organization". The
-- composite foreign key to people (tenant_id, id) is MATCH SIMPLE, so it is
-- simply not checked when person_id is null -- no cross-tenant hole opens, and
-- tenant_isolation_gaps() (20260906100000) still sees a two-column key.
--
-- The existing unique constraint does not carry over, though: Postgres treats
-- NULLs as distinct in a unique index, so (tenant_id, null, kind, dedupe_key)
-- would never collide with itself and every re-run would send again. The
-- partial index below is the constraint for those rows. `nulls not distinct`
-- on the original constraint would do the same job in one place, but it would
-- also make person_id part of a key it is never part of in practice, and it
-- needs a constraint rebuild on a table the sender writes to.

alter table public.notification_deliveries
  alter column person_id drop not null;

comment on column public.notification_deliveries.person_id is
  'The recipient''s people.id, or null for a message addressed to the organization rather than to a person (#743, the leadership ops report).';

-- The idempotency guarantee for organization-addressed sends. Partial, so it
-- costs nothing on the per-person rows the existing constraint already covers.
create unique index notification_deliveries_org_dedupe_idx
  on public.notification_deliveries (tenant_id, kind, dedupe_key)
  where person_id is null;
