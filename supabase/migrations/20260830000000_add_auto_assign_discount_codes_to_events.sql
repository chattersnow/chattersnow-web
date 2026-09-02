-- Issue #74: per-event opt-in for automatically reserving a discount code
-- (from the event's uploaded batch, see 20260824200000) for each new
-- registrant. Off by default so every existing event keeps #73's
-- manual-only assignment workflow unchanged.
alter table public.events
  add column auto_assign_discount_codes boolean not null default false;
