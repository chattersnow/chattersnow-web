-- Make `sales` the system of record for merchandise revenue (#909).
--
-- Two halves, deliberately in one migration because neither is safe alone:
--
-- 1. get_finance_report_data gains a sixth key, `sales`, so the Finance
--    Reports page and the dashboard's cash figures derive merchandise income
--    from the register rather than from a hand-typed event_revenue row. Body
--    is otherwise unchanged from 20260907140000, including the single
--    finance_reports:view gate -- board sees sales totals in the rollup
--    without holding `sales:view`, exactly as it already sees revenue without
--    `event_revenue:view`.
--
-- 2. A trigger retires the manual `merchandise` source on event_revenue for
--    new rows, so the same money cannot be entered twice. Legacy merchandise
--    rows are left alone and still count once: they come back under
--    `revenue`, the register's sales come back under `sales`, and the
--    TypeScript rollup folds the two into one "Merchandise" line.
--
-- A trigger rather than a `not valid` check constraint: a check would also
-- refuse an update that only touches a legacy row's notes or date, and those
-- rows have to stay correctable.
--
-- Date semantics (20260828010000's list, plus the new row), all inclusive of
-- both bounds:
--   event_revenue        received_date
--   event_expenses       expense_date
--   reimbursements       created_at
--   donations            donated_at
--   monetary_donations   received_date
--   sales                sold_at        -- timestamptz, cast ::date like the
--                                          two above it
create or replace function public.get_finance_report_data(p_from date, p_to date)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_result jsonb;
  v_tenant_id uuid := public.current_tenant_id();
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
        and reims.created_at::date between p_from and p_to
    ), '[]'::jsonb),
    'in_kind_items', coalesce((
      select jsonb_agg(jsonb_build_object('face_value', items.face_value)
        order by dons.donated_at, items.id)
      from public.inventory_items items
      join public.donations dons on dons.id = items.donation_id
      where items.tenant_id = v_tenant_id
        and dons.donated_at::date between p_from and p_to
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
    'sales', coalesce((
      select jsonb_agg(jsonb_build_object(
        'amount', sls.total,
        'sold_at', sls.sold_at,
        'event_id', sls.event_id,
        'event_name', evt.name
      ) order by sls.sold_at, sls.id)
      from public.sales sls
      left join public.events evt on evt.id = sls.event_id
      where sls.tenant_id = v_tenant_id
        and sls.status = 'completed'
        and sls.sold_at::date between p_from and p_to
    ), '[]'::jsonb)
  ) into v_result;

  return v_result;
end;
$$;

-- Merchandise is recorded at the register from #908 onward, so a new
-- event_revenue row can no longer claim that source -- otherwise the same
-- takings land in both `revenue` and `sales` above and are counted twice.
--
-- service_role is exempt so tests and trusted server paths can still create a
-- legacy-shaped fixture; nothing a signed-in user does reaches this branch.
create or replace function public.event_revenue_reject_merchandise()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if coalesce(
       current_setting('request.jwt.claims', true)::jsonb ->> 'role',
       ''
     ) = 'service_role'
  then
    return new;
  end if;

  -- An update that leaves an existing merchandise row on merchandise is
  -- fine: those rows predate the register and stay editable.
  if new.source = 'merchandise'
     and (tg_op = 'INSERT' or old.source is distinct from 'merchandise')
  then
    raise exception 'MERCHANDISE_SOURCE_RETIRED'
      using hint = 'Record merchandise under Finance > Sales';
  end if;

  return new;
end;
$$;

drop trigger if exists event_revenue_reject_merchandise on public.event_revenue;
create trigger event_revenue_reject_merchandise
  before insert or update on public.event_revenue
  for each row execute function public.event_revenue_reject_merchandise();
