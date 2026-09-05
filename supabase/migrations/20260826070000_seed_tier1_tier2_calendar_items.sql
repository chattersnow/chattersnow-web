-- Seeds the curated Tier 1/Tier 2 annual observance calendar (issue #112),
-- using the exact Tier 1 list and the Tier 2 examples from
-- planning/ideas/content_community_calendar.md §9 as the approved annual
-- list (sign-off recorded in the issue, not a separate workflow -- see
-- issue #112). Heritage months and "program-specific moments" are named
-- generically in §9; this seed makes them concrete using the most
-- commonly-cited U.S. federal heritage months. "Program-specific moments"
-- has no fixed date to cite and is intentionally left unseeded for a future
-- editorial pass once specific programs are identified.
--
-- Each item is dated to its next real-world occurrence after today
-- (2026-08-26): if this year's date already passed, it's seeded for 2027;
-- otherwise it's seeded for the remainder of 2026. This gives ops a rolling
-- ~12-month planning window on import rather than a mix of past and future
-- dates. All times are date-only observances anchored to America/Denver
-- (the org's canonical zone), midnight to 23:59:59 on the last day of the
-- range.
--
-- All rows are seeded calendar_status = 'idea' and visibility = 'internal':
-- these are curated *candidates* for the year, not yet planned or reviewed
-- for public copy (spec §8 requires human review of tone/accuracy before
-- activating a date, and §6 requires Chatter-authored public copy, neither
-- of which this migration does). Ops flips status/visibility per item via
-- the portal once each is planned. owner_id is left null for the same
-- reason -- ops assigns a real owner later.
--
-- created_by is NOT NULL on calendar_items with no migration-safe default
-- (auth.uid() is null outside a request context), so this looks up the
-- founding admin account by email, mirroring the bootstrap-admin lookup in
-- 20260821080000_create_roles_and_user_roles.sql. If that account doesn't
-- exist yet in this environment, the whole seed is skipped with a notice
-- rather than failing the migration.
--
-- World AIDS Day and Transgender Day of Remembrance are seeded now with no
-- sensitive-topic flag -- #113 (editorial guardrails) is separately tracked
-- and will retrofit a flag onto these (and other) rows later. Their
-- priority_rationale notes the sensitivity in the meantime using the
-- existing free-text field, not a new column.

do $$
declare
  v_owner_id uuid;
begin
  -- These rows need a created_by, not a privileged account. Prefer the
  -- configured bootstrap address if there is one, otherwise fall back to any
  -- existing admin, so a fresh environment still gets the seed (#708).
  select id into v_owner_id
  from auth.users
  where lower(email) = lower(
    nullif(trim(coalesce(current_setting('app.bootstrap_admin_email', true), '')), '')
  )
  limit 1;

  if v_owner_id is null then
    select ur.user_id into v_owner_id
    from public.user_roles ur
    join public.roles r on r.id = ur.role_id
    where r.name = 'admin'
    order by ur.created_at
    limit 1;
  end if;

  if v_owner_id is null then
    raise notice 'Skipping calendar seed: no admin account exists in this environment to own the rows.';
    return;
  end if;

  with new_items as (
    insert into public.calendar_items (
      title, item_type, starts_at, ends_at, time_zone, recurrence_rule,
      summary, priority_tier, priority_rationale, calendar_status,
      visibility, source, region, exceptions, created_by
    )
    values
      -- Tier 1 -------------------------------------------------------
      ('Transgender Day of Visibility', 'community_observance',
       '2027-03-31 00:00:00 America/Denver'::timestamptz, '2027-03-31 23:59:59 America/Denver'::timestamptz,
       'America/Denver', 'Annually on March 31',
       'International day recognizing transgender people and celebrating their contributions, alongside raising awareness of discrimination.',
       1, null, 'idea', 'internal',
       'GLAAD -- International Transgender Day of Visibility, observed annually March 31 since 2009 (founded by Rachel Crandall-Crocker).',
       'international', '[]'::jsonb, v_owner_id),

      ('International Day Against Homophobia, Biphobia and Transphobia', 'community_observance',
       '2027-05-17 00:00:00 America/Denver'::timestamptz, '2027-05-17 23:59:59 America/Denver'::timestamptz,
       'America/Denver', 'Annually on May 17',
       'International observance marking the WHO''s 1990 declassification of homosexuality as a mental disorder.',
       1, null, 'idea', 'internal',
       'IDAHOBIT Committee -- international observance since 2004.',
       'international', '[]'::jsonb, v_owner_id),

      ('Pride Month', 'community_observance',
       '2027-06-01 00:00:00 America/Denver'::timestamptz, '2027-06-30 23:59:59 America/Denver'::timestamptz,
       'America/Denver', 'Annually, all of June',
       'Month-long recognition of LGBTQ+ history, culture, and community, commemorating the June 1969 Stonewall uprising.',
       1, null, 'idea', 'internal',
       'U.S. federal designation (annual presidential Pride Month proclamation).',
       'us',
       '[{"region": "international", "note": "Many countries/cities hold Pride observances outside June -- confirm before reusing copy for a non-U.S. audience."}]'::jsonb,
       v_owner_id),

      ('Nonbinary People''s Day', 'community_observance',
       '2027-07-14 00:00:00 America/Denver'::timestamptz, '2027-07-14 23:59:59 America/Denver'::timestamptz,
       'America/Denver', 'Annually on July 14',
       'International day recognizing nonbinary people, marked midway between International Women''s Day (Mar 8) and International Men''s Day (Nov 19).',
       1, null, 'idea', 'internal',
       'Observed annually since 2012.', 'international', '[]'::jsonb, v_owner_id),

      ('Bisexual Visibility Day', 'community_observance',
       '2026-09-23 00:00:00 America/Denver'::timestamptz, '2026-09-23 23:59:59 America/Denver'::timestamptz,
       'America/Denver', 'Annually on September 23',
       'Also known as Celebrate Bisexuality Day; raises visibility of bisexual people and community.',
       1, null, 'idea', 'internal',
       'Observed annually since 1999.', 'international', '[]'::jsonb, v_owner_id),

      ('LGBTQ+ History Month', 'community_observance',
       '2026-10-01 00:00:00 America/Denver'::timestamptz, '2026-10-31 23:59:59 America/Denver'::timestamptz,
       'America/Denver', 'Annually, all of October (in the U.S.)',
       'Month-long recognition of LGBTQ+ history and figures.',
       1, null, 'idea', 'internal',
       'Equality Forum / U.S. observance since 1994.', 'us',
       '[{"region": "uk", "note": "UK observes LGBT+ History Month in February, not October."}]'::jsonb,
       v_owner_id),

      ('National Coming Out Day', 'community_observance',
       '2026-10-11 00:00:00 America/Denver'::timestamptz, '2026-10-11 23:59:59 America/Denver'::timestamptz,
       'America/Denver', 'Annually on October 11',
       'Marks the anniversary of the 1987 March on Washington for Lesbian and Gay Rights.',
       1, null, 'idea', 'internal',
       'Human Rights Campaign -- established 1988.', 'us_and_international', '[]'::jsonb, v_owner_id),

      ('Trans Awareness Week', 'community_observance',
       '2026-11-13 00:00:00 America/Denver'::timestamptz, '2026-11-19 23:59:59 America/Denver'::timestamptz,
       'America/Denver', 'Annually, November 13-19',
       'Week of visibility and education leading up to Transgender Day of Remembrance.',
       1, null, 'idea', 'internal',
       'GLAAD / HRC -- the week leading up to Transgender Day of Remembrance (Nov 20).',
       'international',
       '[{"note": "Some sources define this as the 7 days immediately preceding Nov 20 rather than a fixed Nov 13-19 range; the fixed range is used here for planning consistency."}]'::jsonb,
       v_owner_id),

      ('Transgender Day of Remembrance', 'community_observance',
       '2026-11-20 00:00:00 America/Denver'::timestamptz, '2026-11-20 23:59:59 America/Denver'::timestamptz,
       'America/Denver', 'Annually on November 20',
       'Memorializes transgender people who lost their lives to anti-transgender violence.',
       1,
       'Sensitive remembrance day -- requires careful, non-sensationalized tone and human review before any public post (sensitive-topic flag tracked separately in #113).',
       'idea', 'internal',
       'Founded by Gwendolyn Ann Smith in 1999; observed internationally since.',
       'international', '[]'::jsonb, v_owner_id),

      ('World AIDS Day', 'community_observance',
       '2026-12-01 00:00:00 America/Denver'::timestamptz, '2026-12-01 23:59:59 America/Denver'::timestamptz,
       'America/Denver', 'Annually on December 1',
       'International day to raise awareness of HIV/AIDS and remember those lost to it.',
       1,
       'Sensitive topic -- requires careful, respectful tone and human review before any public post (sensitive-topic flag tracked separately in #113).',
       'idea', 'internal',
       'World Health Organization / UNAIDS -- observed annually since 1988.',
       'international', '[]'::jsonb, v_owner_id),

      ('Winter Season Kickoff', 'winter_outdoor_sports_moment',
       '2026-12-05 00:00:00 America/Denver'::timestamptz, '2026-12-05 23:59:59 America/Denver'::timestamptz,
       'America/Denver', 'Annually, timed to the start of ski season (date confirmed by ops each year)',
       'Chatter-specific season-opening moment to kick off winter programming and content.',
       1, null, 'idea', 'internal',
       'Chatter Snow operations -- internal season marker, not an external observance; date should be confirmed against partner resort opening dates each year.',
       null, '[]'::jsonb, v_owner_id),

      ('End-of-Season Community Recap', 'winter_outdoor_sports_moment',
       '2027-04-15 00:00:00 America/Denver'::timestamptz, '2027-04-15 23:59:59 America/Denver'::timestamptz,
       'America/Denver', 'Annually, timed to the end of ski season (date confirmed by ops each year)',
       'Chatter-specific season-closing recap of community highlights and impact.',
       1, null, 'idea', 'internal',
       'Chatter Snow operations -- internal season marker, not an external observance; date should be confirmed against partner resort closing dates each year.',
       null, '[]'::jsonb, v_owner_id),

      -- Tier 2 -------------------------------------------------------
      ('Lesbian Visibility Day', 'community_observance',
       '2027-04-26 00:00:00 America/Denver'::timestamptz, '2027-04-26 23:59:59 America/Denver'::timestamptz,
       'America/Denver', 'Annually on April 26', 'Raises visibility of lesbian people and community.',
       2, null, 'idea', 'internal',
       'Founded by DIVA magazine (UK), observed annually since 2008.', 'international', '[]'::jsonb, v_owner_id),

      ('International Asexuality Day', 'community_observance',
       '2027-04-06 00:00:00 America/Denver'::timestamptz, '2027-04-06 23:59:59 America/Denver'::timestamptz,
       'America/Denver', 'Annually on April 6', 'Raises visibility of asexual people and community.',
       2, null, 'idea', 'internal',
       'International Asexuality Day founding coalition, observed annually since 2021.', 'international', '[]'::jsonb, v_owner_id),

      ('Black History Month', 'heritage_social_justice_moment',
       '2027-02-01 00:00:00 America/Denver'::timestamptz, '2027-02-28 23:59:59 America/Denver'::timestamptz,
       'America/Denver', 'Annually, all of February (in the U.S.)',
       'Month-long recognition of Black history and contributions.',
       2, null, 'idea', 'internal',
       'U.S. federal observance since 1976 (originated as Negro History Week, 1926).', 'us', '[]'::jsonb, v_owner_id),

      ('Hispanic & Latino Heritage Month', 'heritage_social_justice_moment',
       '2026-09-15 00:00:00 America/Denver'::timestamptz, '2026-10-15 23:59:59 America/Denver'::timestamptz,
       'America/Denver', 'Annually, September 15 - October 15 (in the U.S.)',
       'Recognition of Hispanic and Latino history and culture.',
       2, null, 'idea', 'internal',
       'U.S. federal observance since 1988 (expanded from Hispanic Heritage Week, 1968).', 'us', '[]'::jsonb, v_owner_id),

      ('Asian American, Native Hawaiian, and Pacific Islander Heritage Month', 'heritage_social_justice_moment',
       '2027-05-01 00:00:00 America/Denver'::timestamptz, '2027-05-31 23:59:59 America/Denver'::timestamptz,
       'America/Denver', 'Annually, all of May (in the U.S.)',
       'Recognition of AANHPI history and culture.',
       2, null, 'idea', 'internal',
       'U.S. federal observance since 1992 (originated as Asian/Pacific American Heritage Week, 1978).', 'us', '[]'::jsonb, v_owner_id),

      ('Native American Heritage Month', 'heritage_social_justice_moment',
       '2026-11-01 00:00:00 America/Denver'::timestamptz, '2026-11-30 23:59:59 America/Denver'::timestamptz,
       'America/Denver', 'Annually, all of November (in the U.S.)',
       'Recognition of Native American history, culture, and contemporary issues.',
       2, null, 'idea', 'internal',
       'U.S. federal observance since 1990.', 'us', '[]'::jsonb, v_owner_id),

      ('Disability Pride Month', 'heritage_social_justice_moment',
       '2027-07-01 00:00:00 America/Denver'::timestamptz, '2027-07-31 23:59:59 America/Denver'::timestamptz,
       'America/Denver', 'Annually, all of July',
       'Recognition of disability history, culture, and pride; overlaps meaningfully with Chatter''s accessibility-in-outdoor-sports mission.',
       2, null, 'idea', 'internal',
       'Originated in Boston, 1990, marking the signing of the ADA (July 26, 1990).', 'us', '[]'::jsonb, v_owner_id),

      ('Mental Health Awareness Month', 'heritage_social_justice_moment',
       '2027-05-01 00:00:00 America/Denver'::timestamptz, '2027-05-31 23:59:59 America/Denver'::timestamptz,
       'America/Denver', 'Annually, all of May',
       'Recognition of mental health, awareness, and destigmatization.',
       2, null, 'idea', 'internal',
       'Mental Health America -- observed annually since 1949.', 'us', '[]'::jsonb, v_owner_id),

      ('Indigenous Peoples'' Day', 'heritage_social_justice_moment',
       '2026-10-12 00:00:00 America/Denver'::timestamptz, '2026-10-12 23:59:59 America/Denver'::timestamptz,
       'America/Denver', 'Annually, the second Monday of October',
       'Recognition of Indigenous peoples'' history and contemporary communities.',
       2, null, 'idea', 'internal',
       'Observed by many U.S. states/cities on the second Monday of October, in lieu of or alongside Columbus Day.',
       'us',
       '[{"note": "Not all U.S. states or municipalities observe this in place of Columbus Day; regional practice varies and should be confirmed before a location-specific public post."}]'::jsonb,
       v_owner_id)

    returning id, title
  )
  insert into public.calendar_item_categories (item_id, category)
  select ni.id, cats.category
  from new_items ni
  join (values
    ('Transgender Day of Visibility', 'lgbtq_community'),
    ('International Day Against Homophobia, Biphobia and Transphobia', 'lgbtq_community'),
    ('Pride Month', 'lgbtq_community'),
    ('Nonbinary People''s Day', 'lgbtq_community'),
    ('Bisexual Visibility Day', 'lgbtq_community'),
    ('LGBTQ+ History Month', 'lgbtq_community'),
    ('National Coming Out Day', 'lgbtq_community'),
    ('Trans Awareness Week', 'lgbtq_community'),
    ('Transgender Day of Remembrance', 'lgbtq_community'),
    ('Transgender Day of Remembrance', 'community_social_justice'),
    ('World AIDS Day', 'lgbtq_community'),
    ('World AIDS Day', 'community_social_justice'),
    ('Winter Season Kickoff', 'winter_outdoor_sports'),
    ('Winter Season Kickoff', 'chatter_events'),
    ('End-of-Season Community Recap', 'winter_outdoor_sports'),
    ('End-of-Season Community Recap', 'chatter_events'),
    ('Lesbian Visibility Day', 'lgbtq_community'),
    ('International Asexuality Day', 'lgbtq_community'),
    ('Black History Month', 'community_social_justice'),
    ('Hispanic & Latino Heritage Month', 'community_social_justice'),
    ('Asian American, Native Hawaiian, and Pacific Islander Heritage Month', 'community_social_justice'),
    ('Native American Heritage Month', 'community_social_justice'),
    ('Disability Pride Month', 'community_social_justice'),
    ('Disability Pride Month', 'lgbtq_community'),
    ('Mental Health Awareness Month', 'community_social_justice'),
    ('Indigenous Peoples'' Day', 'community_social_justice')
  ) as cats(title, category) on cats.title = ni.title;
end $$;
