-- #1650: the carpool cost-split notice.
--
-- Carpool costs are split among the people in a car and settled with the
-- driver; the organization never collects them (#1649 stores no amount). The
-- notice says so wherever carpooling comes up on an event with carpools on:
-- registration step 2 and its review step, the confirmation email, and the
-- assignment card and email (#1651). It is a `site_content` slot,
-- `events.carpool_cost_notice`, with the platform default in
-- `src/lib/site-content.ts`.
--
-- Notice, not acceptance (#1318, `docs/legal-basis.md`): there is no box, and
-- nothing is stored about having seen it, so this migration adds no column to
-- a registration.
--
-- 1. `public_events` exposes `carpools_enabled`, so the public form knows to
--    show the notice. Whether an event organizes carpools says nothing about
--    anyone; the cars themselves stay staff-only.
-- 2. Chatter Snow's own copy, seeded with the slot as the standing rule asks.
--    The platform default with "we" naming Chatter Snow. Every other tenant
--    renders the default until it edits the slot.

-- ---------------------------------------------------------------------------
-- 1. The public view
-- ---------------------------------------------------------------------------

-- Appended at the end, as `create or replace view` requires, with
-- 20260911010000's security_barrier restated; the owner, grants and comment
-- carry over.
create or replace view public.public_events with (security_barrier = true) as
select
  id, name, location, starts_at, ends_at, timezone, description, capacity,
  registration_enabled, registration_deadline, flier_url, adults_only,
  carpools_enabled
from public.events
where visibility = 'public'
  and status = 'published'
  and tenant_id = public.public_tenant_id();

-- ---------------------------------------------------------------------------
-- 2. Chatter Snow's copy
-- ---------------------------------------------------------------------------

-- 20260922090000's idiom: scoped by slug, `on conflict do nothing` so a board
-- edit made before this runs wins, and the two triggers off around the write
-- so no person is stamped on a change nobody made. On a database without the
-- tenant -- local and CI bootstrap as `example-nonprofit` -- a clean no-op,
-- which keeps CI on the platform default.
alter table public.site_content
  disable trigger set_updated_at,
  disable trigger audit_log_row;

with tenant as (
  select id from public.tenants where slug = 'chatter-snow'
)
insert into public.site_content (tenant_id, key, value, published_at)
select tenant.id, v.key, v.value::jsonb, now()
from tenant, (values
  ('events.carpool_cost_notice', '["Carpool costs like gas, tolls and parking are split among everyone in the car. Please talk with your driver about your share — Chatter Snow doesn''t collect or set carpool payments. The people in your car will see your first name and Instagram handle so you can coordinate."]')
) as v(key, value)
on conflict (tenant_id, key) do nothing;

alter table public.site_content
  enable trigger set_updated_at,
  enable trigger audit_log_row;
