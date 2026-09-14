-- #1065: a reporting day is a day in the organization's own time zone.
--
-- The decision, so the next reader can tell it from an accident -- which was
-- #1057 3's complaint about the file this replaces:
--
--   A reporting period runs from the first moment of `p_from` to the last
--   moment of `p_to` **in the tenant's zone** (`app_settings.org.timezone`,
--   added in 20260916000000), not in UTC. February means what the treasurer
--   counting by hand means by February.
--
-- Why not UTC, which is what these two functions did: casting a `timestamptz`
-- to `date` uses the session zone, and the portal's server client runs in UTC.
-- A sale rung at 7pm on 28 February in Denver is stored as 2026-03-01T02:00Z
-- and was counted in March, so February lost its last evening -- and on a
-- multi-tenant platform it lost a different slice for every tenant. UTC days
-- are defensible only for an organization that keeps its books in UTC, and
-- none does.
--
-- The predicates are half-open instant comparisons
-- (`>= from-midnight-in-zone`, `< the-day-after-to-midnight-in-zone`) rather
-- than a per-row `(col at time zone z)::date`. Same answer, but the index on
-- the column is still usable and the DST-affected days need no special case:
-- US zones change at 2am, so midnight is never the ambiguous hour.
--
-- Only genuine instants are converted. A `date` column carries no zone and
-- means the same day to every reader, so `event_revenue.received_date`,
-- `event_expenses.expense_date`, `monetary_donations.received_date` and --
-- since #1053 turned it into a `date` column -- `donations.donated_at` are
-- compared as they are. That last one loses a now-inert `::date` cast here;
-- keeping it would suggest a truncation that no longer happens.
--
-- What this does NOT change: how a typed time is read (the browser's zone) or
-- how any time is displayed (the viewer's zone in the portal, the event's own
-- on the public site). See docs/technical-spec.md 6.1.
--
-- Both bodies are otherwise byte-for-byte their current versions --
-- 20260913030000 for the finance rollup, 20260909000000 for the calendar
-- review -- gates, ordering and shape included. Neither signature moves, so
-- the existing `grant execute` on each still applies.

-- Finance > Financial Reports (5.16) -----------------------------------------

create or replace function public.get_finance_report_data(p_from date, p_to date)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_result jsonb;
  v_tenant_id uuid := public.current_tenant_id();
  v_zone text;
begin
  if not public.has_permission('finance_reports', 'view') then
    raise exception 'Not authorized to view financial reports';
  end if;

  if p_from is null or p_to is null then
    raise exception 'Both a from date and a to date are required';
  end if;

  if p_from > p_to then
    raise exception 'The from date must not be after the to date';
  end if;

  -- The reporting zone. Read straight from app_settings rather than through
  -- public.org_timezone: this function is already security definer, and the
  -- view exists for the application's sake, not this one's.
  --
  -- Two fallbacks to UTC, both deliberate. A tenant with no row has never had
  -- a zone and UTC is what every report before #1065 assumed, so nothing
  -- changes for it. A row holding something Postgres does not recognise would
  -- make `at time zone` raise, and a report that will not open is worse than
  -- one that opens on the old boundary -- the settings form rejects such a
  -- value, so this only catches a hand-edited row.
  select coalesce(value #>> '{}', 'UTC') into v_zone
  from public.app_settings
  where tenant_id = v_tenant_id and key = 'org.timezone';

  if v_zone is null or not exists (
    select 1 from pg_timezone_names where name = v_zone
  ) then
    v_zone := 'UTC';
  end if;

  select jsonb_build_object(
    'revenue', coalesce((
      select jsonb_agg(jsonb_build_object(
        'source', revs.source,
        'amount', revs.amount,
        'event_id', revs.event_id,
        'event_name', evt.name
      ) order by revs.received_date, revs.id)
      from public.event_revenue revs
      left join public.events evt on evt.id = revs.event_id
      where revs.tenant_id = v_tenant_id
        and revs.received_date between p_from and p_to
    ), '[]'::jsonb),
    'expenses', coalesce((
      select jsonb_agg(jsonb_build_object(
        'status', exps.status,
        'amount', exps.amount,
        'event_id', exps.event_id,
        'event_name', evt.name
      ) order by exps.expense_date, exps.id)
      from public.event_expenses exps
      left join public.events evt on evt.id = exps.event_id
      where exps.tenant_id = v_tenant_id
        and exps.expense_date between p_from and p_to
    ), '[]'::jsonb),
    'reimbursements', coalesce((
      select jsonb_agg(jsonb_build_object(
        'status', reims.status,
        'amount', reims.amount,
        'event_id', reims.event_id,
        'event_name', evt.name
      ) order by reims.created_at, reims.id)
      from public.reimbursements reims
      left join public.events evt on evt.id = reims.event_id
      where reims.tenant_id = v_tenant_id
        and reims.created_at >= (p_from::timestamp at time zone v_zone)
        and reims.created_at < ((p_to + 1)::timestamp at time zone v_zone)
    ), '[]'::jsonb),
    'in_kind_items', coalesce((
      select jsonb_agg(jsonb_build_object('face_value', items.face_value)
        order by dons.donated_at, items.id)
      from public.inventory_items items
      join public.donations dons on dons.id = items.donation_id
      where items.tenant_id = v_tenant_id
        and dons.donated_at between p_from and p_to
    ), '[]'::jsonb),
    'monetary_donations', coalesce((
      select jsonb_agg(jsonb_build_object(
        'amount', mds.amount,
        'event_id', mds.event_id,
        'event_name', evt.name,
        'donor_name', ppl.name
      ) order by mds.received_date, mds.id)
      from public.monetary_donations mds
      left join public.events evt on evt.id = mds.event_id
      left join public.people ppl on ppl.id = mds.donor_id
      where mds.tenant_id = v_tenant_id
        and mds.received_date between p_from and p_to
    ), '[]'::jsonb),
    -- Completed sales only: a voided sale's row stays for the audit trail
    -- with its stock returned, and must not reach any total.
    --
    -- `amount` is net of tax (#997): collected tax is money held for the
    -- state, not income, so the Merchandise line and every income figure
    -- built on it stay net. The tax rides alongside as its own key so the
    -- report can show what is owed.
    'sales', coalesce((
      select jsonb_agg(jsonb_build_object(
        'amount', sls.total - sls.tax_amount,
        'tax', sls.tax_amount,
        'sold_at', sls.sold_at,
        'event_id', sls.event_id,
        'event_name', evt.name
      ) order by sls.sold_at, sls.id)
      from public.sales sls
      left join public.events evt on evt.id = sls.event_id
      where sls.tenant_id = v_tenant_id
        and sls.status = 'completed'
        and sls.sold_at >= (p_from::timestamp at time zone v_zone)
        and sls.sold_at < ((p_to + 1)::timestamp at time zone v_zone)
    ), '[]'::jsonb)
  ) into v_result;

  return v_result;
end;
$$;

-- Calendar > Annual Planning Review (5.21) -----------------------------------

create or replace function public.get_calendar_annual_review_data(p_from date, p_to date)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item_ids uuid[];
  v_result jsonb;
  v_tenant_id uuid := public.current_tenant_id();
  v_zone text;
begin
  if not public.has_permission('content_calendar_reports', 'view') then
    raise exception 'Not authorized to view the annual calendar review report';
  end if;

  if p_from > p_to then
    raise exception 'The start of the range must not be after its end';
  end if;

  -- The reporting zone. Read straight from app_settings rather than through
  -- public.org_timezone: this function is already security definer, and the
  -- view exists for the application's sake, not this one's.
  --
  -- Two fallbacks to UTC, both deliberate. A tenant with no row has never had
  -- a zone and UTC is what every report before #1065 assumed, so nothing
  -- changes for it. A row holding something Postgres does not recognise would
  -- make `at time zone` raise, and a report that will not open is worse than
  -- one that opens on the old boundary -- the settings form rejects such a
  -- value, so this only catches a hand-edited row.
  select coalesce(value #>> '{}', 'UTC') into v_zone
  from public.app_settings
  where tenant_id = v_tenant_id and key = 'org.timezone';

  if v_zone is null or not exists (
    select 1 from pg_timezone_names where name = v_zone
  ) then
    v_zone := 'UTC';
  end if;

  select coalesce(array_agg(id), '{}') into v_item_ids
  from public.calendar_items
  where tenant_id = v_tenant_id
    and starts_at >= (p_from::timestamp at time zone v_zone)
    and starts_at < ((p_to + 1)::timestamp at time zone v_zone);

  select jsonb_build_object(
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', id,
        'priority_tier', priority_tier,
        'decision', decision,
        'visibility', visibility,
        'calendar_status', calendar_status
      ))
      from public.calendar_items
      where id = any(v_item_ids)
    ), '[]'::jsonb),
    'opportunities', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', id,
        'calendar_item_id', calendar_item_id,
        'content_status', content_status,
        'org_connection', org_connection,
        'template_id', template_id,
        'draft_due_at', draft_due_at,
        'review_due_at', review_due_at,
        'publish_due_at', publish_due_at,
        'created_at', created_at,
        'status_changed_at', status_changed_at
      ))
      from public.content_opportunities
      where calendar_item_id = any(v_item_ids)
    ), '[]'::jsonb),
    'permissions', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', p.id,
        'content_opportunity_id', p.content_opportunity_id
      ))
      from public.content_permissions p
      join public.content_opportunities co on co.id = p.content_opportunity_id
      where co.calendar_item_id = any(v_item_ids)
    ), '[]'::jsonb)
  ) into v_result;

  return v_result;
end;
$$;
