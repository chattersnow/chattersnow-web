-- #1579 (part 4 of #1575): a submitted event report keeps the figures it was
-- submitted with.
--
-- Live figures keep moving after an event -- a late expense is paid, a sale is
-- voided -- and a grant report built from a submitted report must not move
-- with them. Submitting now freezes the report's rows in
-- `events.report_snapshot`; the Results card shows the frozen figures and
-- flags each one that has changed since. Reopening clears the freeze.
--
-- What is frozen is the raw rows behind Money, Goods, Sponsors, Team and
-- Operations -- get_event_report_data's sections -- not totals. Totals are
-- computed in TypeScript (src/lib/portal/event-report-metrics.ts) and that
-- stays the one place they are defined, applied to the frozen rows and the
-- live rows alike. Freezing rows rather than totals is also what lets the
-- snapshot be complete: it is written here, by a security-definer function
-- that reads every section, rather than by the submitter's session, which only
-- sees the sections it holds permission for (an events:manage coordinator
-- without finance_reports:view would otherwise freeze no Money at all).
--
-- Reading the snapshot goes through get_event_report_data, under the same
-- per-section checks as the live rows, so the board role still sees Money and
-- no more. Outcomes (get_event_impact_derived_data) are not frozen here.
--
-- 1. `events.report_snapshot jsonb`, guarded by a trigger so only
--    submit_event_report and reopen_event_report change it -- the events
--    update policy would otherwise let any events:manage caller write one.
-- 2. `event_report_rows(event, money, goods, events)`: the section-building
--    body of get_event_report_data, moved out so submit can read every
--    section. Internal: not executable by any client role.
-- 3. `get_event_report_data` gains a `snapshot` key: the frozen sections,
--    each null under the same permission as its live one, plus
--    `captured_at`. Null when the report has no snapshot.
-- 4. `submit_event_report(id)`: the status change and the freeze, in one
--    statement. submitEventReportAction called a plain update before.
-- 5. `reopen_event_report` clears the snapshot. The body is otherwise
--    20260906090000's.
--
-- Reports submitted before this migration have no snapshot and keep showing
-- live figures. They are not backfilled: today's figures labelled "at
-- submission" would be wrong.

alter table public.events add column report_snapshot jsonb;

comment on column public.events.report_snapshot is
  'The event report''s raw rows (get_event_report_data''s sections) frozen when the report was submitted, plus captured_at (#1579). Written only by submit_event_report, cleared by reopen_event_report.';

create or replace function public.guard_event_report_snapshot()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.report_snapshot is distinct from
       (case when tg_op = 'UPDATE' then old.report_snapshot end)
     and coalesce(current_setting('app.event_report_snapshot_write', true), '') <> 'on'
  then
    raise exception 'The report snapshot is written only by submitting or reopening the report';
  end if;
  return new;
end;
$$;

revoke all on function public.guard_event_report_snapshot() from public, anon, authenticated;

create trigger events_guard_report_snapshot
  before insert or update of report_snapshot on public.events
  for each row execute function public.guard_event_report_snapshot();

create or replace function public.event_report_rows(
  p_event_id uuid,
  p_money boolean,
  p_goods boolean,
  p_events boolean
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_result jsonb;
begin
  select jsonb_build_object(
    'money', case when p_money then jsonb_build_object(
      'budget_amount', (select budget_amount from public.events where id = p_event_id),
      -- Completed sales only, net of tax: the finance rollup's definition.
      'sales', coalesce((
        select jsonb_agg(jsonb_build_object(
          'amount', sls.total - sls.tax_amount,
          'tax', sls.tax_amount
        ) order by sls.sold_at, sls.id)
        from public.sales sls
        where sls.event_id = p_event_id and sls.status = 'completed'
      ), '[]'::jsonb),
      'revenue', coalesce((
        select jsonb_agg(jsonb_build_object(
          'source', revs.source,
          'amount', revs.amount
        ) order by revs.received_date, revs.id)
        from public.event_revenue revs
        where revs.event_id = p_event_id
      ), '[]'::jsonb),
      'giveaway_ticket_sales', coalesce((
        select jsonb_agg(jsonb_build_object(
          'amount', gts.amount,
          'quantity', gts.quantity
        ) order by gts.sold_at, gts.id)
        from public.giveaway_ticket_sales gts
        join public.giveaways gvw on gvw.id = gts.giveaway_id
        where gvw.event_id = p_event_id
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
        where mds.event_id = p_event_id
      ), '[]'::jsonb),
      'expenses', coalesce((
        select jsonb_agg(jsonb_build_object(
          'status', exps.status,
          'amount', exps.amount
        ) order by exps.expense_date, exps.id)
        from public.event_expenses exps
        where exps.event_id = p_event_id
      ), '[]'::jsonb),
      'reimbursements', coalesce((
        select jsonb_agg(jsonb_build_object(
          'status', reims.status,
          'amount', reims.amount
        ) order by reims.created_at, reims.id)
        from public.reimbursements reims
        where reims.event_id = p_event_id
      ), '[]'::jsonb)
    ) else null::jsonb end,
    'goods', case when p_goods then jsonb_build_object(
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
        where dons.event_id = p_event_id
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
        where mov.event_id = p_event_id
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
        where gvw.event_id = p_event_id
      ), '[]'::jsonb)
    ) else null::jsonb end,
    'sponsors', case when p_events then coalesce((
      select jsonb_agg(jsonb_build_object(
        'support_type', spn.support_type,
        'contribution_value', spn.contribution_value,
        'follow_up_status', spn.follow_up_status
      ) order by spn.created_at, spn.id)
      from public.event_sponsors spn
      where spn.event_id = p_event_id
    ), '[]'::jsonb) else null::jsonb end,
    'team', case when p_events then jsonb_build_object(
      'volunteers', coalesce((
        select jsonb_agg(jsonb_build_object(
          'person_id', vol.person_id,
          'shift_id', vol.shift_id
        ) order by vol.created_at, vol.id)
        from public.event_volunteers vol
        where vol.event_id = p_event_id
      ), '[]'::jsonb),
      'shifts', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', sft.id,
          'target_headcount', sft.target_headcount
        ) order by sft.starts_at, sft.id)
        from public.event_shifts sft
        where sft.event_id = p_event_id
      ), '[]'::jsonb),
      'volunteer_hours', coalesce((
        select jsonb_agg(jsonb_build_object(
          'person_id', vh.person_id,
          'hours', vh.hours
        ) order by vh.logged_date, vh.id)
        from public.volunteer_hours vh
        where vh.event_id = p_event_id
      ), '[]'::jsonb),
      'staff', coalesce((
        select jsonb_agg(jsonb_build_object('person_id', stf.person_id)
          order by stf.created_at, stf.id)
        from public.event_staff stf
        where stf.event_id = p_event_id
      ), '[]'::jsonb)
    ) else null::jsonb end,
    'operations', case when p_events then jsonb_build_object(
      'incidents', coalesce((
        select jsonb_agg(jsonb_build_object('severity', inc.severity)
          order by inc.occurred_at, inc.id)
        from public.event_incidents inc
        where inc.event_id = p_event_id
      ), '[]'::jsonb)
    ) else null::jsonb end
  ) into v_result;

  return v_result;
end;
$$;

revoke all on function public.event_report_rows(uuid, boolean, boolean, boolean)
  from public, anon, authenticated;

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
  v_snapshot jsonb;
begin
  v_can_goods := public.has_permission('finance', 'view')
    or v_can_money
    or public.has_permission('inventory', 'manage')
    or public.has_permission('inventory_reports', 'view');

  if not (v_can_events or v_can_money
          or public.has_permission('event_impact', 'view')) then
    raise exception 'Not authorized to view event report figures';
  end if;

  select id, report_snapshot into v_event_id, v_snapshot
    from public.events
   where id = p_event_id
     and tenant_id = (select public.current_tenant_id());

  return jsonb_build_object('event_id', p_event_id)
    || public.event_report_rows(v_event_id, v_can_money, v_can_goods, v_can_events)
    || jsonb_build_object('snapshot', case when v_snapshot is null then null::jsonb
      else jsonb_build_object(
        'captured_at', v_snapshot -> 'captured_at',
        'money', case when v_can_money then v_snapshot -> 'money' end,
        'goods', case when v_can_goods then v_snapshot -> 'goods' end,
        'sponsors', case when v_can_events then v_snapshot -> 'sponsors' end,
        'team', case when v_can_events then v_snapshot -> 'team' end,
        'operations', case when v_can_events then v_snapshot -> 'operations' end
      ) end);
end;
$$;

revoke all on function public.get_event_report_data(uuid) from public;
grant execute on function public.get_event_report_data(uuid) to authenticated;

create or replace function public.submit_event_report(p_id uuid)
returns public.events
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event public.events;
begin
  if not public.has_permission('events', 'manage') then
    raise exception 'Not authorized to submit this report';
  end if;

  select * into v_event from public.events
   where id = p_id and tenant_id = (select public.current_tenant_id()) for update;
  if v_event.id is null then
    raise exception 'Event not found';
  end if;
  if v_event.report_status = 'submitted' then
    raise exception 'This report has already been submitted';
  end if;

  perform set_config('app.event_report_snapshot_write', 'on', true);
  update public.events
    set report_status = 'submitted',
        report_submitted_at = now(),
        report_submitted_by = auth.uid(),
        report_snapshot = public.event_report_rows(p_id, true, true, true)
          || jsonb_build_object('captured_at', now())
    where id = p_id
    returning * into v_event;
  perform set_config('app.event_report_snapshot_write', '', true);
  return v_event;
end;
$$;

revoke all on function public.submit_event_report(uuid) from public, anon;
grant execute on function public.submit_event_report(uuid) to authenticated;

create or replace function public.reopen_event_report(p_id uuid, p_reason text)
returns public.events
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event public.events;
begin
  if p_reason is null or btrim(p_reason) = '' then
    raise exception 'A reason is required to reopen this report';
  end if;

  if not public.is_admin() then
    raise exception 'Not authorized to reopen this report';
  end if;

  select * into v_event from public.events
   where id = p_id and tenant_id = (select public.current_tenant_id()) for update;
  if v_event.id is null then
    raise exception 'Event not found';
  end if;
  if v_event.report_status <> 'submitted' then
    raise exception 'Only a submitted report can be reopened';
  end if;

  perform set_config('app.event_report_snapshot_write', 'on', true);
  update public.events
    set report_status = 'in_progress',
        report_reopened_at = now(),
        report_reopened_by = auth.uid(),
        report_reopen_reason = btrim(p_reason),
        report_snapshot = null
    where id = p_id
    returning * into v_event;
  perform set_config('app.event_report_snapshot_write', '', true);
  return v_event;
end;
$$;
