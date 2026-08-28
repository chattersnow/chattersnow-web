-- Structured recurrence for auto-generating next year's instance of a
-- recurring Tier 1/2 observance (issue #191). Two shapes only, both
-- anchored to month/day with no year component:
--   - fixed single day (recurrence_start_* == recurrence_end_*)
--   - fixed month-day range (e.g. Pride Month 06-01..06-30)
-- Nth-weekday-of-month rules (e.g. "second Monday of October") are
-- explicitly NOT modeled here -- those items keep only the existing
-- free-text recurrence_rule and are never assigned a series_key, so they
-- fall out of every structured-recurrence query this feature adds
-- (coverage reminder, "generate next year") automatically.
--
-- series_key identifies "the same recurring observance" across yearly
-- instances -- each year's calendar_items row stays a separate record;
-- nothing here merges them. series_key is intentionally NOT unique per row:
-- every instance of a series shares the same value.
--
-- recurrence_end_is_month_end covers observances whose end date is "the
-- last day of the month" rather than a fixed day number (Black History
-- Month: Feb 28 in a non-leap year, Feb 29 in a leap year). When true,
-- recurrence_end_day is not stored -- the actual last day is computed at
-- generation time from the target year, so a hardcoded "28" never silently
-- drops Feb 29.
alter table public.calendar_items
  add column series_key uuid,
  add column recurrence_start_month smallint check (recurrence_start_month between 1 and 12),
  add column recurrence_start_day smallint check (recurrence_start_day between 1 and 31),
  add column recurrence_end_month smallint check (recurrence_end_month between 1 and 12),
  add column recurrence_end_day smallint check (recurrence_end_day between 1 and 31),
  add column recurrence_end_is_month_end boolean not null default false;

alter table public.calendar_items
  add constraint calendar_items_recurrence_anchor_pair_check check (
    (series_key is null) = (recurrence_start_month is null)
    and (series_key is null) = (recurrence_start_day is null)
    and (series_key is null) = (recurrence_end_month is null)
  ),
  add constraint calendar_items_recurrence_end_day_pair_check check (
    series_key is null or recurrence_end_is_month_end = (recurrence_end_day is null)
  ),
  add constraint calendar_items_recurrence_month_end_flag_check check (
    not recurrence_end_is_month_end or recurrence_end_month is not null
  );

comment on column public.calendar_items.series_key is
  'Groups yearly instances of the same recurring observance (e.g. every "Pride Month" row shares one series_key). Null for items without structured recurrence -- those keep only the free-text recurrence_rule.';
comment on column public.calendar_items.recurrence_start_month is
  'Month (1-12) this series starts on every year. Paired with series_key -- null iff series_key is null.';
comment on column public.calendar_items.recurrence_start_day is
  'Day of month this series starts on every year.';
comment on column public.calendar_items.recurrence_end_month is
  'Month (1-12) this series ends on every year. Equal to recurrence_start_month for single-day observances.';
comment on column public.calendar_items.recurrence_end_day is
  'Day of month this series ends on every year. Null when recurrence_end_is_month_end is true (the day is computed, not stored).';
comment on column public.calendar_items.recurrence_end_is_month_end is
  'True when this series always ends on the last calendar day of recurrence_end_month, so leap years resolve to Feb 29 instead of a hardcoded Feb 28.';

-- Internal-only, same as source/region/exceptions: public_calendar_items
-- (20260824000000) already selects an explicit column list, so these stay
-- out of the public view automatically. calendar_items is already on the
-- audit_log trigger (20260824000100), so no audit migration is needed.
create index calendar_items_series_key_idx on public.calendar_items (series_key) where series_key is not null;
