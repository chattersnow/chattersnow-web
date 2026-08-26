-- Backfills series_key/recurrence anchors (20260826300000) onto the
-- curated Tier 1/2 seed (issue #112, 20260826070000_seed_tier1_tier2_
-- calendar_items.sql) so the coverage reminder and "generate next year"
-- (issue #191) work immediately for the already-seeded rows.
--
-- 18 of the 21 seeded rows fit one of the two structured shapes (fixed
-- single day, or fixed month-day range). The remaining 3 are deliberately
-- left untouched (series_key stays null, so they're invisible to every
-- structured-recurrence query added by this feature):
--   - Indigenous Peoples' Day: "the second Monday of October" is a
--     variable weekday rule, not a fixed month-day -- out of scope per
--     20260826300000's header.
--   - Winter Season Kickoff / End-of-Season Community Recap: both are
--     explicitly "date confirmed by ops each year" in the seed migration,
--     not a fixed calendar rule at all.
--
-- Each `where title = ... and series_key is null` guard makes this
-- migration safe to reason about even if it were ever re-applied to a
-- database where these rows were already backfilled by hand.
update public.calendar_items set
  series_key = gen_random_uuid(),
  recurrence_start_month = v.start_month, recurrence_start_day = v.start_day,
  recurrence_end_month = v.end_month, recurrence_end_day = v.end_day,
  recurrence_end_is_month_end = v.month_end
from (values
  ('Transgender Day of Visibility', 3, 31, 3, 31, false),
  ('International Day Against Homophobia, Biphobia and Transphobia', 5, 17, 5, 17, false),
  ('Pride Month', 6, 1, 6, 30, false),
  ('Nonbinary People''s Day', 7, 14, 7, 14, false),
  ('Bisexual Visibility Day', 9, 23, 9, 23, false),
  ('LGBTQ+ History Month', 10, 1, 10, 31, false),
  ('National Coming Out Day', 10, 11, 10, 11, false),
  ('Trans Awareness Week', 11, 13, 11, 19, false),
  ('Transgender Day of Remembrance', 11, 20, 11, 20, false),
  ('World AIDS Day', 12, 1, 12, 1, false),
  ('Lesbian Visibility Day', 4, 26, 4, 26, false),
  ('International Asexuality Day', 4, 6, 4, 6, false),
  ('Black History Month', 2, 1, 2, null, true),
  ('Hispanic & Latino Heritage Month', 9, 15, 10, 15, false),
  ('Asian American, Native Hawaiian, and Pacific Islander Heritage Month', 5, 1, 5, 31, false),
  ('Native American Heritage Month', 11, 1, 11, 30, false),
  ('Disability Pride Month', 7, 1, 7, 31, false),
  ('Mental Health Awareness Month', 5, 1, 5, 31, false)
) as v(title, start_month, start_day, end_month, end_day, month_end)
where calendar_items.title = v.title and calendar_items.series_key is null;
