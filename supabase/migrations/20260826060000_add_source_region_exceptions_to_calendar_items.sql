-- Seeding the Tier 1/Tier 2 observance calendar (issue #112) needs somewhere
-- to record *why* a date is what it is, since these rows aren't Chatter's
-- own events:
--   - source: citation for where the date comes from (e.g. the org that
--     defines it, or "Chatter Snow operations" for internal-only moments
--     like winter season kickoff that have no external authority).
--   - region: where the date applies as given. Most Tier 1/2 observances are
--     US-federal or internationally recognized, but some have real regional
--     variance (e.g. LGBTQ+ History Month is October in the US, February in
--     the UK) -- free text, not a fixed enum, since the set of regions isn't
--     closed.
--   - exceptions: year-specific or regional overrides to the default
--     starts_at/ends_at/region captured above, e.g. a note that a date shifts
--     in a leap year or that a region observes it differently. Structured as
--     a jsonb array of freeform objects (e.g. {"year":2028,"note":"..."} or
--     {"region":"uk","note":"..."}) rather than dedicated columns, because
--     the shape of an exception varies per item and this is reference
--     context for editors, not a machine-evaluated rule engine.
-- None of these three are public-facing -- they stay out of
-- public_calendar_items, same as owner_id and priority_rationale.
alter table public.calendar_items
  add column source text,
  add column region text,
  add column exceptions jsonb not null default '[]'::jsonb
    check (jsonb_typeof(exceptions) = 'array');

comment on column public.calendar_items.source is
  'Citation for where this date/definition comes from (e.g. "GLAAD", "U.S. federal observance"), or "Chatter Snow operations" for internal-only moments with no external authority. Internal-only; never exposed via public_calendar_items.';
comment on column public.calendar_items.region is
  'Region this item''s date/definition applies to as recorded (e.g. "us", "international"). Free text, not enum-constrained, since observed regions vary and this set isn''t closed. Internal-only.';
comment on column public.calendar_items.exceptions is
  'Array of freeform year- or region-specific override notes for this item''s date (e.g. a regional variant or a one-off shift), for editors to consult -- not evaluated programmatically. Internal-only.';
