-- #997: sales tax on the point-of-sale register (§5.22) -- part 3 of 3, the
-- rollup.
--
-- `get_finance_report_data`'s `sales` key emitted `sls.total`, which from
-- 20260913010000 includes tax. Collected tax is not income -- it is held for
-- remittance -- so the key now emits `total - tax_amount` as `amount` and the
-- tax as its own `tax` field. That one change is what keeps the Merchandise
-- line (and the dashboard's Revenue tile, which reads the same summary) net;
-- nothing else in the RPC moves. Body is otherwise 20260911060000's, gate and
-- date semantics included.

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
        and sls.sold_at::date between p_from and p_to
    ), '[]'::jsonb)
  ) into v_result;

  return v_result;
end;
$$;
