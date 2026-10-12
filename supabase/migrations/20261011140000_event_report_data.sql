-- #1576 (part 1 of #1575): the event Report card is computed from data the
-- event already holds, instead of a typed `report_summary`.
--
-- Three changes:
--
-- 1. `get_finance_report_data` gains a `giveaway_ticket_sales` key. Raffle
--    ticket money reached no finance total before, so the event page and the
--    Financial Reports page could not agree on an event's income. Cash
--    sponsorships needed no change: `sync_event_sponsor_donations` already
--    mirrors them into `monetary_donations`, which the rollup reads. The body
--    is otherwise 20260916010000's.
--
-- 2. `get_event_report_data(event_id)` returns the raw rows behind each Report
--    section. Totals are computed in TypeScript
--    (src/lib/portal/event-report-metrics.ts), the same split as
--    get_event_impact_derived_data. It is security definer because the
--    readers of a report do not all hold the source tables' RLS grants: the
--    board role holds finance_reports:view and events:none. Each section is
--    null for a caller without its permission, so a section is hidden rather
--    than shown as zeros. Since has_permission() is false for a resource whose
--    module is off, this also hides a section on a tenant without the module.
--
--      money      finance_reports:view
--      goods      finance:view, finance_reports:view, inventory:manage
--                 or inventory_reports:view (the Donations and
--                 Distributions cards' checks)
--      sponsors   events:view
--      team       events:view
--      operations events:view
--
--    Guests are not here: the Report reuses get_event_impact_derived_data, so
--    a participant figure is never defined twice.
--
--    Sponsor-linked rows carry `sponsor_id`, so the TypeScript counts a
--    sponsorship's mirrored monetary donation or in-kind items once, under
--    sponsorship, and never again under donations.
--
-- 3. `events.report_summary` is retired as a typed field. The column stays and
--    is shown read-only on events that have text in it.

create or replace function public.get_event_report_data(p_event_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_can_events boolean := public.has_permission('events', 'view');
  v_can_money boolean := public.has_permission('finance_reports', 'view');
  v_can_goods boolean;
  v_event_id uuid;
  v_result jsonb;
begin
  v_can_goods := public.has_permission('finance', 'view')
    or v_can_money
    or public.has_permission('inventory', 'manage')
    or public.has_permission('inventory_reports', 'view');

  if not (v_can_events or v_can_money
          or public.has_permission('event_impact', 'view')) then
    raise exception 'Not authorized to view event report figures';
  end if;

  select id into v_event_id
    from public.events
   where id = p_event_id
     and tenant_id = (select public.current_tenant_id());

  select jsonb_build_object(
    'event_id', p_event_id,
    'money', case when v_can_money then jsonb_build_object(
      'budget_amount', (select budget_amount from public.events where id = v_event_id),
      -- Completed sales only, net of tax: the finance rollup's definition.
      'sales', coalesce((
        select jsonb_agg(jsonb_build_object(
          'amount', sls.total - sls.tax_amount,
          'tax', sls.tax_amount
        ) order by sls.sold_at, sls.id)
        from public.sales sls
        where sls.event_id = v_event_id and sls.status = 'completed'
      ), '[]'::jsonb),
      'revenue', coalesce((
        select jsonb_agg(jsonb_build_object(
          'source', revs.source,
          'amount', revs.amount
        ) order by revs.received_date, revs.id)
        from public.event_revenue revs
        where revs.event_id = v_event_id
      ), '[]'::jsonb),
      'giveaway_ticket_sales', coalesce((
        select jsonb_agg(jsonb_build_object(
          'amount', gts.amount,
          'quantity', gts.quantity
        ) order by gts.sold_at, gts.id)
        from public.giveaway_ticket_sales gts
        join public.giveaways gvw on gvw.id = gts.giveaway_id
        where gvw.event_id = v_event_id
      ), '[]'::jsonb),
      'monetary_donations', coalesce((
        select jsonb_agg(jsonb_build_object(
          'amount', mds.amount,
          'sponsor_id', (
            select spn.id from public.event_sponsors spn
            where spn.monetary_donation_id = mds.id
            limit 1
          )
        ) order by mds.received_date, mds.id)
        from public.monetary_donations mds
        where mds.event_id = v_event_id
      ), '[]'::jsonb),
      'expenses', coalesce((
        select jsonb_agg(jsonb_build_object(
          'status', exps.status,
          'amount', exps.amount
        ) order by exps.expense_date, exps.id)
        from public.event_expenses exps
        where exps.event_id = v_event_id
      ), '[]'::jsonb),
      'reimbursements', coalesce((
        select jsonb_agg(jsonb_build_object(
          'status', reims.status,
          'amount', reims.amount
        ) order by reims.created_at, reims.id)
        from public.reimbursements reims
        where reims.event_id = v_event_id
      ), '[]'::jsonb)
    ) else null::jsonb end,
    'goods', case when v_can_goods then jsonb_build_object(
      -- Items on the event's donations, sponsor mirrors included and flagged.
      'in_kind_items', coalesce((
        select jsonb_agg(jsonb_build_object(
          'face_value', items.face_value,
          'sponsor_id', (
            select spn.id from public.event_sponsors spn
            where spn.donation_id = dons.id
            limit 1
          )
        ) order by dons.donated_at, items.id)
        from public.inventory_items items
        join public.donations dons on dons.id = items.donation_id
        where dons.event_id = v_event_id
      ), '[]'::jsonb),
      'distributions', coalesce((
        select jsonb_agg(jsonb_build_object(
          'quantity', mov.quantity,
          'recipient_person_id', mov.recipient_person_id,
          'inventory_item_id', mov.inventory_item_id,
          'face_value', items.face_value
        ) order by mov.occurred_at, mov.id)
        from public.inventory_movements mov
        join public.inventory_items items on items.id = mov.inventory_item_id
        where mov.event_id = v_event_id
          and mov.movement_type = 'distributed'
      ), '[]'::jsonb),
      'prizes', coalesce((
        select jsonb_agg(jsonb_build_object(
          'estimated_value', prz.estimated_value,
          'awarded', exists (
            select 1 from public.giveaway_winners win
            where win.giveaway_prize_id = prz.id
          )
        ) order by prz.created_at, prz.id)
        from public.giveaway_prizes prz
        join public.giveaways gvw on gvw.id = prz.giveaway_id
        where gvw.event_id = v_event_id
      ), '[]'::jsonb)
    ) else null::jsonb end,
    'sponsors', case when v_can_events then coalesce((
      select jsonb_agg(jsonb_build_object(
        'support_type', spn.support_type,
        'contribution_value', spn.contribution_value,
        'follow_up_status', spn.follow_up_status
      ) order by spn.created_at, spn.id)
      from public.event_sponsors spn
      where spn.event_id = v_event_id
    ), '[]'::jsonb) else null::jsonb end,
    'team', case when v_can_events then jsonb_build_object(
      'volunteers', coalesce((
        select jsonb_agg(jsonb_build_object(
          'person_id', vol.person_id,
          'shift_id', vol.shift_id
        ) order by vol.created_at, vol.id)
        from public.event_volunteers vol
        where vol.event_id = v_event_id
      ), '[]'::jsonb),
      'shifts', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', sft.id,
          'target_headcount', sft.target_headcount
        ) order by sft.starts_at, sft.id)
        from public.event_shifts sft
        where sft.event_id = v_event_id
      ), '[]'::jsonb),
      'volunteer_hours', coalesce((
        select jsonb_agg(jsonb_build_object(
          'person_id', vh.person_id,
          'hours', vh.hours
        ) order by vh.logged_date, vh.id)
        from public.volunteer_hours vh
        where vh.event_id = v_event_id
      ), '[]'::jsonb),
      'staff', coalesce((
        select jsonb_agg(jsonb_build_object('person_id', stf.person_id)
          order by stf.created_at, stf.id)
        from public.event_staff stf
        where stf.event_id = v_event_id
      ), '[]'::jsonb)
    ) else null::jsonb end,
    'operations', case when v_can_events then jsonb_build_object(
      'incidents', coalesce((
        select jsonb_agg(jsonb_build_object('severity', inc.severity)
          order by inc.occurred_at, inc.id)
        from public.event_incidents inc
        where inc.event_id = v_event_id
      ), '[]'::jsonb)
    ) else null::jsonb end
  ) into v_result;

  return v_result;
end;
$$;

revoke all on function public.get_event_report_data(uuid) from public;
grant execute on function public.get_event_report_data(uuid) to authenticated;

comment on column public.events.report_summary is
  'Retired as a typed field by #1576: the Report card computes its summary from the event''s own data. Kept so text written before then is still shown read-only.';

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
    ), '[]'::jsonb),
    -- #1576: giveaway ticket sales are money taken for raffle tickets and
    -- reached no finance total before. `sold_at` is an instant, so it is
    -- bucketed by the tenant's day like `sales`.
    'giveaway_ticket_sales', coalesce((
      select jsonb_agg(jsonb_build_object(
        'amount', gts.amount,
        'sold_at', gts.sold_at,
        'event_id', gvw.event_id,
        'event_name', evt.name
      ) order by gts.sold_at, gts.id)
      from public.giveaway_ticket_sales gts
      join public.giveaways gvw on gvw.id = gts.giveaway_id
      left join public.events evt on evt.id = gvw.event_id
      where gts.tenant_id = v_tenant_id
        and gts.sold_at >= (p_from::timestamp at time zone v_zone)
        and gts.sold_at < ((p_to + 1)::timestamp at time zone v_zone)
    ), '[]'::jsonb)
  ) into v_result;

  return v_result;
end;
$$;
