-- Content Calendar > Annual Review report (issue #111): the first of
-- planning_ideas/content_community_calendar.md §12's success measures for a
-- full planning cycle -- Tier 1 decision coverage, on-time completion,
-- overdue work, brief-creation speed, public-connection coverage, and
-- recorded publication permissions -- computed for a selected calendar year.
--
-- Kept as its own resource, distinct from the base `content_calendar` CRUD
-- resource, same split already used for programs_reports/inventory_reports/
-- finance_reports. Unlike programs_reports (which needed security definer to
-- paper over an access-level gap across several other resources), every
-- table this report reads is already gated by content_calendar itself, so
-- content_calendar_reports gets the identical role split as content_calendar.
insert into public.resources (key, section, label, description, sort_order) values
  ('content_calendar_reports', 'Content Calendar', 'Annual planning review report', 'Year-scoped rollup of Tier 1 decision coverage, on-time completion, overdue work, and editorial-guardrail recordkeeping', 61);

insert into public.role_permissions (role_id, resource_id, level)
select r.id, res.id, v.level
from (values
  ('admin', 'manage'),
  ('event_coordinator', 'manage'),
  ('finance', 'view'),
  ('board', 'view'),
  ('volunteer', 'view')
) as v(role_name, level)
join public.roles r on r.name = v.role_name
join public.resources res on res.key = 'content_calendar_reports';

-- security definer, single content_calendar_reports check, one jsonb payload
-- bundling everything the report needs -- same shape as
-- get_program_impact_rollup_data (20260825020000): app-level aggregation
-- (TypeScript, unit-tested, no SQL views) does the actual math.
create or replace function public.get_calendar_annual_review_data(p_year int)
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

  select coalesce(array_agg(id), '{}') into v_item_ids
  from public.calendar_items
  where starts_at >= make_timestamptz(p_year, 1, 1, 0, 0, 0, 'UTC')
    and starts_at < make_timestamptz(p_year + 1, 1, 1, 0, 0, 0, 'UTC');

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

grant execute on function public.get_calendar_annual_review_data(int) to authenticated;
