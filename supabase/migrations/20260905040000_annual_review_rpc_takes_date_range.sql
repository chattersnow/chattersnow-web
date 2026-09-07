-- The annual review RPC (20260826260000) hardcoded a Jan-1-to-Jan-1 UTC window
-- around its p_year argument, so the report could only ever be a calendar year.
-- Now that the fiscal year is a setting (20260905030000_define_fiscal_year.sql),
-- the review has to follow it.
--
-- Rather than teach this function to read app_settings, it takes an explicit
-- date range -- the same period-agnostic shape as get_finance_report_data
-- (20260828010000). That keeps the fiscal-year math in exactly one place
-- (src/lib/fiscal-year.ts, unit-tested) instead of splitting it between
-- TypeScript and SQL, and leaves the RPC usable for any window a future report
-- wants. The body is otherwise unchanged from 20260826260000.
--
-- The argument list changes, so this is a drop-and-create rather than a
-- create-or-replace. Nothing else calls the int version.
drop function if exists public.get_calendar_annual_review_data(int);

create function public.get_calendar_annual_review_data(p_from date, p_to date)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item_ids uuid[];
  v_result jsonb;
begin
  if not public.has_permission('content_calendar_reports', 'view') then
    raise exception 'Not authorized to view the annual calendar review report';
  end if;

  if p_from > p_to then
    raise exception 'The start of the range must not be after its end';
  end if;

  -- p_to is inclusive, matching get_finance_report_data: the caller passes the
  -- last day of the period, so the window runs to the start of the day after.
  select coalesce(array_agg(id), '{}') into v_item_ids
  from public.calendar_items
  where starts_at >= (p_from::timestamp at time zone 'UTC')
    and starts_at < ((p_to + 1)::timestamp at time zone 'UTC');

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
        'chatter_connection', chatter_connection,
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

grant execute on function public.get_calendar_annual_review_data(date, date) to authenticated;

-- The resource description said "Year-scoped"; the period is now whatever the
-- org's fiscal year is.
update public.resources
set description = 'Fiscal-year rollup of Tier 1 decision coverage, on-time completion, overdue work, and editorial-guardrail recordkeeping'
where key = 'content_calendar_reports';
