-- Finance > Financial Reports rollup (issue #353): period summary of income,
-- spend, and donations behind the finance_reports resource, which until now
-- had only a "Coming soon" placeholder page.
--
-- security definer, for the same reason as
-- 20260825020000_add_programs_reports_resource.sql: this report reads across
-- event_revenue, event_expenses, reimbursements, donations, and
-- inventory_items, whose SELECT policies are each scoped to a *different*
-- resource than finance_reports. Board holds finance_reports:view and
-- nothing else in Finance or Events (20260822090000), so a security invoker
-- read would hand this report's main oversight audience -- the one the spec
-- (§4, board "view-only on Finance reports ... for oversight") names -- a
-- silently zeroed page. A single finance_reports:view check is the only
-- gate, and rows come back raw so the aggregation stays in unit-tested
-- TypeScript with no SQL views, matching every other report here.
--
-- Date semantics, one column per table, all inclusive of both bounds:
--   event_revenue    received_date   -- when the money came in
--   event_expenses   expense_date    -- when the cost was incurred
--   reimbursements   created_at      -- no expense-date column exists
--                                       (20260826000000); when the request
--                                       was recorded is the closest thing
--   donations        donated_at      -- in-kind intake date
--
-- Monetary donations have no table yet (public.donations is in-kind intake:
-- a donor plus inventory_items), so the "donations" figure here is the face
-- value of items donated in the period. The page labels it as in-kind and
-- keeps it out of the cash net, since face value is not cash received.
--
-- reimbursements.created_at is timestamptz and donations.donated_at is
-- timestamptz, so both are compared in the caller's session time zone via a
-- plain ::date cast -- the app always sends dates the user picked, and the
-- portal's server client runs in UTC.

create or replace function public.get_finance_report_data(p_from date, p_to date)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_result jsonb;
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
      ))
      from public.event_revenue revs
      left join public.events evt on evt.id = revs.event_id
      where revs.received_date between p_from and p_to
    ), '[]'::jsonb),
    'expenses', coalesce((
      select jsonb_agg(jsonb_build_object(
        'status', exps.status,
        'amount', exps.amount,
        'event_id', exps.event_id,
        'event_name', evt.name
      ))
      from public.event_expenses exps
      left join public.events evt on evt.id = exps.event_id
      where exps.expense_date between p_from and p_to
    ), '[]'::jsonb),
    'reimbursements', coalesce((
      select jsonb_agg(jsonb_build_object(
        'status', reims.status,
        'amount', reims.amount,
        'event_id', reims.event_id,
        'event_name', evt.name
      ))
      from public.reimbursements reims
      left join public.events evt on evt.id = reims.event_id
      where reims.created_at::date between p_from and p_to
    ), '[]'::jsonb),
    'in_kind_items', coalesce((
      select jsonb_agg(jsonb_build_object('face_value', items.face_value))
      from public.inventory_items items
      join public.donations dons on dons.id = items.donation_id
      where dons.donated_at::date between p_from and p_to
    ), '[]'::jsonb)
  ) into v_result;

  return v_result;
end;
$$;

grant execute on function public.get_finance_report_data(date, date) to authenticated;
