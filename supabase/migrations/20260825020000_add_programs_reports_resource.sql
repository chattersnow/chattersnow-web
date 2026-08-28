-- Programs > Impact Report resource (issue #48): season/program rollup of
-- events, participation, financial assistance, equipment, and volunteer
-- hours, computed live from event_impact_notes/inventory_movements/
-- volunteer_hours/event_registrations, scoped by program_id (no date range —
-- each season is its own programs row). Kept as its own resource, distinct
-- from the base `programs` CRUD resource, same split already used for
-- inventory_reports/finance_reports.
--
-- Access mirrors event_impact (this report's main data source) rather than
-- programs' own admin/event_coordinator/finance/board/volunteer-view split,
-- since the report surfaces per-event financial-assistance figures that
-- volunteer cannot otherwise see.
insert into public.resources (key, section, label, description, sort_order) values
  ('programs_reports', 'Events', 'Program impact reports', 'Season/program impact rollup: events, participation, assistance, equipment, and volunteer hours', 46);

insert into public.role_permissions (role_id, resource_id, level)
select r.id, res.id, v.level
from (values
  ('admin', 'manage'),
  ('event_coordinator', 'manage'),
  ('finance', 'view'),
  ('board', 'view'),
  ('volunteer', 'none')
) as v(role_name, level)
join public.roles r on r.name = v.role_name
join public.resources res on res.key = 'programs_reports';

-- The rollup reads across event_impact_notes, inventory_movements,
-- volunteer_hours, and event_registrations. Those tables' own SELECT
-- policies are each scoped to a *different* resource (event_impact,
-- inventory manage/inventory_reports, volunteers, events) than
-- programs_reports, so a straight `security invoker` read from the report
-- page would silently return an empty/zeroed rollup for any role that
-- doesn't separately hold every one of those permissions — including
-- event_coordinator, this report's primary manage-level user, who has no
-- inventory/inventory_reports grant. Use `security definer` (same pattern as
-- 20260821110000_secure_donation_and_distribution_rpcs.sql) so a single
-- programs_reports check is the only gate, and bundle everything into one
-- jsonb payload so the app-level aggregation (TypeScript, unit-tested, no
-- SQL views — matching every other report in this codebase) has exactly the
-- rows it needs.
create or replace function public.get_program_impact_rollup_data(p_program_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event_ids uuid[];
  v_result jsonb;
begin
  if not public.has_permission('programs_reports', 'view') then
    raise exception 'Not authorized to view program impact reports';
  end if;

  select coalesce(array_agg(id), '{}') into v_event_ids
  from public.events
  where program_id = p_program_id;

  select jsonb_build_object(
    'event_ids', to_jsonb(v_event_ids),
    'impact_notes', coalesce((
      select jsonb_agg(jsonb_build_object(
        'event_id', event_id,
        'total_participants', total_participants,
        'first_time_participants', first_time_participants,
        'beginner_participants', beginner_participants,
        'subsidized_tickets_count', subsidized_tickets_count,
        'rental_subsidies_count', rental_subsidies_count,
        'equipment_loans_count', equipment_loans_count,
        'assistance_total', assistance_total
      ))
      from public.event_impact_notes
      where event_id = any(v_event_ids)
    ), '[]'::jsonb),
    'distributed_movements', coalesce((
      select jsonb_agg(jsonb_build_object('quantity', quantity, 'event_id', event_id))
      from public.inventory_movements
      where event_id = any(v_event_ids) and movement_type = 'distributed'
    ), '[]'::jsonb),
    'volunteer_hours', coalesce((
      select jsonb_agg(jsonb_build_object('event_id', event_id, 'hours', hours))
      from public.volunteer_hours
      where event_id = any(v_event_ids)
    ), '[]'::jsonb),
    'registrations', coalesce((
      select jsonb_agg(jsonb_build_object('person_id', person_id, 'event_id', event_id))
      from public.event_registrations
      where event_id = any(v_event_ids)
    ), '[]'::jsonb)
  ) into v_result;

  return v_result;
end;
$$;

grant execute on function public.get_program_impact_rollup_data(uuid) to authenticated;
