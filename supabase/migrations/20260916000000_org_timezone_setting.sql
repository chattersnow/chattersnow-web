-- #1065: the organization's own time zone, so a report can count days the way
-- its treasurer does.
--
-- The platform has never stored one. Every instant column is `timestamptz` and
-- every report bucketed those instants with a plain `::date` cast, which
-- Postgres evaluates in the session zone -- UTC on Supabase. A sale rung at
-- 7pm on 28 February in Denver is stored as 2026-03-01T02:00Z and counted in
-- March, so February is quietly missing its last evening. On a multi-tenant
-- platform that is wrong by a different amount for every tenant.
-- 20260916010000 fixes the reports; this migration gives them the zone to do
-- it with, and 20260915000000:40-45 is where the need was written down.
--
-- Where it lives: `app_settings` under `org.timezone`, exactly like
-- `org.fiscal_year_start_month` (20260905030000) and `finance.sales_tax_rate`
-- (20260913010000). That inherits the table's RLS, its admin UI at
-- Administration > Organization Settings, its `audit_log_row` trigger -- a
-- change to how a fiscal period is cut should be as defensible as a change to
-- the fiscal year itself -- and `provision_tenant()`'s existing copy of every
-- `org.%` key into a new tenant (20260906110000:184-189).
--
-- What it is NOT: it does not say how a typed time is read (that is the
-- browser's zone) and it does not govern display (the portal shows the
-- viewer's zone, the public site shows an event's own). It answers one
-- question -- where does a reporting day begin and end. See
-- docs/technical-spec.md 6.1.

-- The seed ---------------------------------------------------------------------

-- Not 'UTC' silently for everyone: that is the current wrong answer, and
-- writing it down as a setting would make it look chosen. A tenant's zone is
-- inferred from where its events happen -- the same expression the #1053
-- backfill used and the only statement about a tenant's local time this
-- database holds (20260915000000:47-54). A tenant with no events at all has
-- nothing to infer from and gets 'UTC'; an administrator corrects either at
-- Administration > Organization Settings > General.
insert into public.app_settings (tenant_id, key, value)
select t.id,
       'org.timezone',
       to_jsonb(coalesce(
         (select mode() within group (order by e.timezone)
          from public.events e
          where e.tenant_id = t.id),
         'UTC'
       ))
from public.tenants t
on conflict (tenant_id, key) do nothing;

-- The view ---------------------------------------------------------------------

-- Modelled on public.org_sales_tax and needed for the same reason:
-- app_settings' select policy admits only six `manage` permissions
-- (20260906040000:30), and the reporting zone is needed by anyone who can open
-- a report or a dashboard tile. This hands out that one key without the
-- approval thresholds beside it, and without widening that OR-chain again.
--
-- Family B of the definer-view pattern (#887, 20260911010000): isolation is
-- tenant_id = current_tenant_id() in the body, which is what
-- tenant_isolation_gaps() looks for.
create view public.org_timezone
with (security_barrier = true) as
select (value #>> '{}') as zone
from public.app_settings
where key = 'org.timezone'
  and tenant_id = (select public.current_tenant_id());

comment on view public.org_timezone is
  'The current tenant''s IANA time zone: where its reporting days begin and end (#1065). Not a display zone -- the portal renders instants in the viewer''s zone and the public site in an event''s own. Security definer by design (#887): the audience is any signed-in member who can open a report, not only the `manage` holders app_settings'' select policy admits -- same reasoning as org_fiscal_year and org_sales_tax. Isolation is tenant_id = current_tenant_id().';

-- Authenticated only: nothing on the public site is cut into reporting
-- periods. Stated explicitly rather than left to the defaults so the view can
-- never gain a write path -- tenant_isolation_gaps() refuses one
-- (`view_grant`).
grant select on public.org_timezone to authenticated;
revoke insert, update, delete on public.org_timezone from anon, authenticated, public;
