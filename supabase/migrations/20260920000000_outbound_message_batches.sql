-- Announcing something to everybody registered for an event (#1317).
--
-- #1203 built `outbound_messages` for one staffer writing to one person, and
-- four queues have adopted it since without a migration apiece -- the table is
-- polymorphic over `module`/`record_type`/`record_id` and its read policy is
-- evaluated against each row's own module. Events are the fifth adopter, and
-- the first where the message is as often to *everyone* as to one person: the
-- start time moved, the road is closed, bring your own helmet.
--
-- One column is all that costs. An announcement is not a new kind of record;
-- it is n ordinary rows that happen to have been written in one go, each one
-- still `record_type = 'event_registration'` against the *registration's* id.
-- That is deliberate and is the whole design:
--
--   * A registrant's own history then shows the announcements they received
--     alongside anything written to them personally, with no union.
--   * The event-level view -- "the road-closure notice went to 37 people, 2
--     failed" -- is the same rows grouped by this column.
--   * Every existing rule covers the new rows unaltered: the select policy,
--     the two-year retention sweep, the `audit_log` redaction of subject, body
--     and recipient address, and the person-is-retained walk.
--
-- Nullable, with no backfill: every row written before this migration was a
-- message to one person, and that is exactly what a null means here. There is
-- no foreign key because a batch is not a table -- the id is minted by the
-- composer and is the same value in each copy's delivery dedupe key, which is
-- what lets a retried send collide per registration rather than mail somebody
-- twice.

alter table public.outbound_messages
  add column batch_id uuid;

comment on column public.outbound_messages.batch_id is
  'The announcement this row was one copy of (#1317), shared by every recipient of one send; null for a message written to one person. Not a foreign key: the id is minted by the composer and appears in each copy''s notification_deliveries dedupe key.';

-- The registrants tab's announcements card: every copy of every announcement
-- this tenant has sent, grouped. Tenant-first like every other index on this
-- table, so the partition the policy has already narrowed to is the one
-- scanned. Partial, because the column is null on the great majority of rows
-- and none of those are ever read this way.
create index outbound_messages_batch_idx
  on public.outbound_messages (tenant_id, batch_id)
  where batch_id is not null;
