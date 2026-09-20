-- #1327: the home hero's three fixed buttons become one content-authored list.
--
-- `home.cta_events`, `home.cta_get_involved` and `home.cta_donate` named the
-- *words* on three buttons whose destinations were literals in
-- `src/app/(public)/home/page.tsx` -- `/events`, `/get-involved`, `/support`.
-- A tenant whose single ask lives somewhere else, on a booking host or a
-- donation platform, had no way to say so. `home.ctas` is a list of rows with
-- a label, a destination and a switch, and its registry default reproduces
-- exactly those three buttons, so a tenant that has never touched the slot
-- renders the home page it rendered yesterday.
--
-- This migration is for the tenants that *did* touch it: their words move into
-- the new slot rather than being replaced by the default ones. A tenant that
-- had set only one of the three keeps that one and gets the platform's old
-- wording for the other two, which is what its page was already showing.
--
-- The retired rows are deleted rather than left behind. They are not merely
-- dead -- `src/lib/public-namespaces.ts` and
-- `test/public-namespaces.integration.test.ts` fail on any `site_content` key
-- no registry claims, which is the check that keeps a public namespace from
-- quietly accumulating rows anon can read.
--
-- Not scoped to one tenant, unlike the seeding migrations: this is a platform
-- slot moving, and every tenant that wrote to it needs the same carry-over. On
-- a database where nobody did, the CTE matches nothing and this is a no-op.
--
-- Drafts move with published copy, and the mapping is the one the drafts model
-- already uses: `has_draft` with a null `draft_value` means "back to the
-- registry default", so a key drafted that way contributes the old default
-- label to the draft list rather than dropping out of it. A tenant with a
-- pending edit to one button keeps a pending edit to the list.
--
-- The triggers come off for the reason 20260908000000 and 20260912050000 took
-- them off: there is no session in a migration, so `set_updated_at` would
-- stamp the new row with now() and a null actor -- erasing the authorship this
-- is carrying over -- and `audit_log_row` would write an actorless entry into
-- each tenant's audit log for a change no person made.

alter table public.site_content
  disable trigger set_updated_at,
  disable trigger audit_log_row;

with retired as (
  select
    tenant_id,
    key,
    value,
    -- What the tenant would see after pressing Publish: the draft when there
    -- is one, otherwise what is already published.
    case when has_draft then draft_value else value end as pending,
    has_draft,
    updated_at,
    updated_by,
    published_at,
    published_by
  from public.site_content
  where key in ('home.cta_events', 'home.cta_get_involved', 'home.cta_donate')
),
-- One row per tenant. `max()` is a formality: `site_content` is unique on
-- (tenant_id, key), so each `case` has at most one non-null input.
folded as (
  select
    tenant_id,
    max(case when key = 'home.cta_events' then value #>> '{}' end) as events,
    max(case when key = 'home.cta_get_involved' then value #>> '{}' end)
      as get_involved,
    max(case when key = 'home.cta_donate' then value #>> '{}' end) as donate,
    max(case when key = 'home.cta_events' then pending #>> '{}' end)
      as events_pending,
    max(case when key = 'home.cta_get_involved' then pending #>> '{}' end)
      as get_involved_pending,
    max(case when key = 'home.cta_donate' then pending #>> '{}' end)
      as donate_pending,
    bool_or(value is not null) as has_published,
    bool_or(has_draft) as has_draft,
    max(updated_at) as updated_at,
    max(published_at) as published_at,
    -- The most recent editor of the three, so the new row credits a person
    -- rather than nobody. Arbitrary between rows saved in the same instant,
    -- which is a better answer than null.
    (array_agg(updated_by order by updated_at desc nulls last))[1] as updated_by,
    (array_agg(published_by order by published_at desc nulls last))[1]
      as published_by
  from retired
  group by tenant_id
)
insert into public.site_content (
  tenant_id, key, value, has_draft, draft_value,
  updated_at, updated_by, published_at, published_by
)
select
  tenant_id,
  'home.ctas',
  case when has_published then jsonb_build_array(
    jsonb_build_object(
      'label', coalesce(events, 'Join an event'),
      'href', '/events',
      'shown', true
    ),
    jsonb_build_object(
      'label', coalesce(get_involved, 'Get involved'),
      'href', '/get-involved',
      'shown', true
    ),
    -- No `shown: false` for a tenant whose Support section is hidden. That
    -- button was never stored as hidden either -- the page asked page
    -- visibility on every render, and it still does, through
    -- `isHrefVisible()` in `liveCtas()`. Storing the answer here would freeze
    -- today's setting into the tenant's own copy and leave the button off
    -- after the board turned Support back on.
    jsonb_build_object(
      'label', coalesce(donate, 'Donate'),
      'href', '/support',
      'shown', true
    )
  ) end,
  has_draft,
  case when has_draft then jsonb_build_array(
    jsonb_build_object(
      'label', coalesce(events_pending, 'Join an event'),
      'href', '/events',
      'shown', true
    ),
    jsonb_build_object(
      'label', coalesce(get_involved_pending, 'Get involved'),
      'href', '/get-involved',
      'shown', true
    ),
    jsonb_build_object(
      'label', coalesce(donate_pending, 'Donate'),
      'href', '/support',
      'shown', true
    )
  ) end,
  updated_at,
  updated_by,
  published_at,
  published_by
from folded
-- A `home.ctas` a tenant has already written is newer than anything this can
-- reconstruct, and must win.
on conflict (tenant_id, key) do nothing;

delete from public.site_content
where key in ('home.cta_events', 'home.cta_get_involved', 'home.cta_donate');

alter table public.site_content
  enable trigger set_updated_at,
  enable trigger audit_log_row;
