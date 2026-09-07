-- Per-event counterpart to get_program_impact_rollup_data (20260904020000).
--
-- Feeds the Impact card's derived figures and the Attendance card's check-in
-- reference figures. Emits exactly the same jsonb key names and row shapes as
-- the program rollup, scoped to one event, so both surfaces run the SAME
-- TypeScript compute functions (src/lib/portal/impact-metrics.ts) rather than
-- two implementations that agree only by comment.
--
-- Why security definer, and not a plain RLS-scoped query in a server action:
-- the board role holds event_impact:view but events:none and people:none
-- (20260822090000, 20260823110000). event_registrations select requires
-- events:view and people select requires people:view, so an RLS-scoped
-- derivation would silently return zeros for precisely the role that opens this
-- card in order to report. A card that quietly reads "0 participants" for the
-- board is worse than the manual field it replaces.
--
-- The guard therefore accepts either resource, and the two roles get different
-- slices:
--   * event_impact:view  -> everything, including rider-profile and discount data
--   * events:view only   -> attendance/check-in reference figures only, so a
--                           volunteer does not gain rider-profile or discount
--                           visibility they have no people/event_impact grant for
create function public.get_event_impact_derived_data(p_event_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_can_view_impact boolean;
  v_result jsonb;
begin
  v_can_view_impact := public.has_permission('event_impact', 'view');

  if not (v_can_view_impact or public.has_permission('events', 'view')) then
    raise exception 'Not authorized to view event impact figures';
  end if;

  select jsonb_build_object(
    'event_id', p_event_id,
    'auto_assign_discount_codes', coalesce((
      select auto_assign_discount_codes from public.events where id = p_event_id
    ), false),
    'events', coalesce((
      select jsonb_agg(jsonb_build_object(
        'event_id', id,
        'attendance_count', attendance_count
      ))
      from public.events
      where id = p_event_id
    ), '[]'::jsonb),
    'registrations', coalesce((
      select jsonb_agg(jsonb_build_object(
        'person_id', person_id,
        'event_id', event_id,
        'checked_in_at', checked_in_at
      ))
      from public.event_registrations
      where event_id = p_event_id
    ), '[]'::jsonb),
    -- Lifetime checked-in event count per person, matching the system-wide
    -- first-time definition the rollup and the Attendees page already use.
    'checkin_counts', coalesce((
      select jsonb_agg(jsonb_build_object(
        'person_id', person_id,
        'checked_in_event_count', checked_in_event_count
      ))
      from (
        select person_id, count(*) as checked_in_event_count
        from public.event_registrations
        where checked_in_at is not null
          and person_id = any(
            select distinct person_id
            from public.event_registrations
            where event_id = p_event_id
              and checked_in_at is not null
              and person_id is not null
          )
        group by person_id
      ) per_person
    ), '[]'::jsonb),
    'event_volunteers', coalesce((
      select jsonb_agg(jsonb_build_object('event_id', event_id, 'person_id', person_id))
      from public.event_volunteers
      where event_id = p_event_id and person_id is not null
    ), '[]'::jsonb),
    'volunteer_hour_people', coalesce((
      select jsonb_agg(jsonb_build_object('event_id', event_id, 'person_id', person_id))
      from (
        select distinct event_id, person_id
        from public.volunteer_hours
        where event_id = p_event_id
      ) vh
    ), '[]'::jsonb),
    'discount_codes', case when v_can_view_impact then coalesce((
      select jsonb_agg(jsonb_build_object(
        'event_id', event_id,
        'registration_id', registration_id
      ))
      from public.discount_codes
      where event_id = p_event_id and registration_id is not null
    ), '[]'::jsonb) else null::jsonb end,
    'beginner_attendees', case when v_can_view_impact then coalesce((
      select jsonb_agg(jsonb_build_object('event_id', event_id, 'person_id', person_id))
      from (
        select distinct r.event_id, r.person_id
        from public.event_registrations r
        join public.people p on p.id = r.person_id
        where r.event_id = p_event_id
          and r.checked_in_at is not null
          and (p.ski_experience_level = 'beginner' or p.snowboard_experience_level = 'beginner')
      ) beginners
    ), '[]'::jsonb) else null::jsonb end,
    'profiled_attendees', case when v_can_view_impact then coalesce((
      select jsonb_agg(jsonb_build_object('event_id', event_id, 'person_id', person_id))
      from (
        select distinct r.event_id, r.person_id
        from public.event_registrations r
        join public.people p on p.id = r.person_id
        where r.event_id = p_event_id
          and r.checked_in_at is not null
          and (p.ski_experience_level is not null or p.snowboard_experience_level is not null)
      ) profiled
    ), '[]'::jsonb) else null::jsonb end
  ) into v_result;

  return v_result;
end;
$$;

revoke all on function public.get_event_impact_derived_data(uuid) from public;
grant execute on function public.get_event_impact_derived_data(uuid) to authenticated;
