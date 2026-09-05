-- Chatter's fiscal year has never been defined: planning/governance/bylaws.md
-- Article VIII S1 says only "The fiscal year of the Corporation shall be
-- established by resolution of the Board", and the portal tracks "Define
-- fiscal year" as a not-started Phase 1 milestone (see
-- 20260824210000_create_nonprofit_status_milestones.sql). Meanwhile every
-- "year" in the app is hardcoded to the calendar year, which splits a winter
-- season across two annual reports -- the dashboard's "this year" figures,
-- the Financial Reports default range, and the Annual Planning Review are all
-- misleading for the org's actual operating cycle.
--
-- This makes the year boundary a setting instead of a constant. It reuses the
-- generic app_settings key/value store (20260823040000_create_app_settings.sql)
-- rather than adding a table, so it inherits that table's RLS, its admin UI at
-- Administration > System Settings, and its audit_log_row trigger -- that audit
-- trail is what makes a change to the fiscal year defensible as a board
-- decision.

-- Placeholder value only, exactly like finance.expense_approval_threshold
-- above it. July is the strong expectation (it keeps a winter season whole),
-- but the bylaws require a Board resolution and that resolution has not
-- happened yet -- see planning/decisions/2026-09-04-fiscal-year-definition.md,
-- which is still Proposed. This seed just gives the mechanism something to
-- read until the board resolves and an admin/board user confirms it via
-- Administration > System Settings > Organization.
--
-- Stored as the starting month (1-12); the fiscal year always starts on the
-- 1st. Month-aligned is all IRS Form 990 needs, and a month+day variant would
-- complicate every range and label for no benefit. A fiscal year is named for
-- the calendar year it ENDS in (US federal/GAAP convention), so a July start
-- means Jul 1 2026 - Jun 30 2027 is "FY2027".
insert into public.app_settings (key, value) values
  ('org.fiscal_year_start_month', to_jsonb(7))
on conflict (key) do nothing;

-- app_settings' select policy only admits system_settings:manage or
-- event_expenses:manage (widened once more for content_calendar managers in
-- 20260824070000). The fiscal year is needed by anyone who can see the
-- dashboard, finance reports, calendar reports, or governance, and widening
-- that OR-chain again for every future reader is brittle. Same
-- slice-through-a-view pattern as public_page_visibility: readers get the
-- fiscal year without gaining access to the approval thresholds alongside it.
create view public.org_fiscal_year as
select (value #>> '{}')::int as start_month
from public.app_settings
where key = 'org.fiscal_year_start_month';

-- Authenticated only -- unlike public_page_visibility, the public site has no
-- fiscal-year-dependent copy (its footer copyright is a calendar year).
grant select on public.org_fiscal_year to authenticated;

-- The column keeps its type and its unique (person_id, disclosure_year), but
-- its meaning is now the fiscal year rather than the calendar year, named by
-- the year the fiscal year ends in. Recorded here because that reinterpretation
-- is invisible in the schema: a row storing 2026 used to mean calendar 2026 and
-- now means FY2026. Deliberately not backfilled -- there are no disclosure rows
-- in seed.sql and the org is pre-formation, so there is nothing to convert. If
-- production turns out to hold real disclosures, they need a conversion
-- decision rather than this comment.
comment on column public.conflict_of_interest_disclosures.disclosure_year is
  'Fiscal year the disclosure covers, named by the calendar year the fiscal year ends in (FY2027 = Jul 2026 - Jun 2027 under a July start). The fiscal year start month is app_settings.org.fiscal_year_start_month.';
