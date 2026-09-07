-- Issue #653: read the rider level recorded at check-in, not the live profile.
--
-- 20260904120000 added event_registrations.*_at_event, stamped by a trigger on
-- the checked_in_at transition. Both derivations now prefer that snapshot and
-- fall back to the live people row where there is none. That covers the two
-- cases at once: an event that has been checked in stops moving under a grant
-- report, while history predating the snapshot -- and any profile a staffer
-- enters after the fact -- still counts.
--
-- Both functions are recreated together and keep emitting identical key names
-- and row shapes, because that identity is the whole reason the Impact card and
-- the Program Impact Report can share src/lib/portal/impact-metrics.ts.
-- Everything else about them (the security definer posture, the permission
-- guards, the event RPC's null-slicing for callers without event_impact:view)
-- is carried forward from 20260904020000 / 20260904030000 unchanged.

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
    'events', coalesce((
      select jsonb_agg(jsonb_build_object(
        'event_id', id,
        'attendance_count', attendance_count
      ))
      from public.events
      where id = any(v_event_ids)
    ), '[]'::jsonb),
    -- Only what is still manually entered. Everything else on the Impact card is
    -- now derived from the tables below.
    'impact_notes', coalesce((
      select jsonb_agg(jsonb_build_object(
        'event_id', event_id,
        'rental_subsidies_count', rental_subsidies_count,
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
    -- Volunteers on site = signed up OR logged hours. event_volunteers alone
    -- misses the walk-up volunteer nobody pre-registered; volunteer_hours alone
    -- misses everyone who showed up on a day nobody logged hours.
    'event_volunteers', coalesce((
      select jsonb_agg(jsonb_build_object('event_id', event_id, 'person_id', person_id))
      from public.event_volunteers
      where event_id = any(v_event_ids) and person_id is not null
    ), '[]'::jsonb),
    'volunteer_hour_people', coalesce((
      select jsonb_agg(jsonb_build_object('event_id', event_id, 'person_id', person_id))
      from (
        select distinct event_id, person_id
        from public.volunteer_hours
        where event_id = any(v_event_ids)
      ) vh
    ), '[]'::jsonb),
    -- Beginner participants, scoped to checked-in registrants so the figure is
    -- comparable with first-time participants. profiled_attendees is the honest
    -- denominator: the rider profile is opt-in, so wherever coverage is short of
    -- the checked-in headcount this reads low and the surfaces say so.
    'beginner_attendees', coalesce((
      select jsonb_agg(jsonb_build_object('event_id', event_id, 'person_id', person_id))
      from (
        select distinct r.event_id, r.person_id
        from public.event_registrations r
        join public.people p on p.id = r.person_id
        -- The snapshot is taken as a whole or not at all: mixing a frozen
        -- snowboard level with a live ski level would let the figure drift
        -- through the half that was never recorded.
        cross join lateral (
          select case when r.riding_discipline_at_event is not null
                      then r.ski_experience_level_at_event
                      else p.ski_experience_level end as ski_level,
                 case when r.riding_discipline_at_event is not null
                      then r.snowboard_experience_level_at_event
                      else p.snowboard_experience_level end as snowboard_level
        ) lvl
        where r.event_id = any(v_event_ids)
          and r.checked_in_at is not null
          and (lvl.ski_level = 'beginner' or lvl.snowboard_level = 'beginner')
      ) beginners
    ), '[]'::jsonb),
    'profiled_attendees', coalesce((
      select jsonb_agg(jsonb_build_object('event_id', event_id, 'person_id', person_id))
      from (
        select distinct r.event_id, r.person_id
        from public.event_registrations r
        join public.people p on p.id = r.person_id
        -- The snapshot is taken as a whole or not at all: mixing a frozen
        -- snowboard level with a live ski level would let the figure drift
        -- through the half that was never recorded.
        cross join lateral (
          select case when r.riding_discipline_at_event is not null
                      then r.ski_experience_level_at_event
                      else p.ski_experience_level end as ski_level,
                 case when r.riding_discipline_at_event is not null
                      then r.snowboard_experience_level_at_event
                      else p.snowboard_experience_level end as snowboard_level
        ) lvl
        where r.event_id = any(v_event_ids)
          and r.checked_in_at is not null
          and (lvl.ski_level is not null or lvl.snowboard_level is not null)
      ) profiled
    ), '[]'::jsonb),
    'registrations', coalesce((
      select jsonb_agg(jsonb_build_object(
        'person_id', person_id,
        'event_id', event_id,
        'checked_in_at', checked_in_at
      ))
      from public.event_registrations
      where event_id = any(v_event_ids)
    ), '[]'::jsonb),
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
            where event_id = any(v_event_ids)
              and checked_in_at is not null
              and person_id is not null
          )
        group by person_id
      ) per_person
    ), '[]'::jsonb),
    'discount_codes', coalesce((
      select jsonb_agg(jsonb_build_object(
        'event_id', event_id,
        'registration_id', registration_id
      ))
      from public.discount_codes
      where event_id = any(v_event_ids) and registration_id is not null
    ), '[]'::jsonb)
  ) into v_result;

  return v_result;
end;
$$;

grant execute on function public.get_program_impact_rollup_data(uuid) to authenticated;

create or replace function public.get_event_impact_derived_data(p_event_id uuid)
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
        -- The snapshot is taken as a whole or not at all: mixing a frozen
        -- snowboard level with a live ski level would let the figure drift
        -- through the half that was never recorded.
        cross join lateral (
          select case when r.riding_discipline_at_event is not null
                      then r.ski_experience_level_at_event
                      else p.ski_experience_level end as ski_level,
                 case when r.riding_discipline_at_event is not null
                      then r.snowboard_experience_level_at_event
                      else p.snowboard_experience_level end as snowboard_level
        ) lvl
        where r.event_id = p_event_id
          and r.checked_in_at is not null
          and (lvl.ski_level = 'beginner' or lvl.snowboard_level = 'beginner')
      ) beginners
    ), '[]'::jsonb) else null::jsonb end,
    'profiled_attendees', case when v_can_view_impact then coalesce((
      select jsonb_agg(jsonb_build_object('event_id', event_id, 'person_id', person_id))
      from (
        select distinct r.event_id, r.person_id
        from public.event_registrations r
        join public.people p on p.id = r.person_id
        -- The snapshot is taken as a whole or not at all: mixing a frozen
        -- snowboard level with a live ski level would let the figure drift
        -- through the half that was never recorded.
        cross join lateral (
          select case when r.riding_discipline_at_event is not null
                      then r.ski_experience_level_at_event
                      else p.ski_experience_level end as ski_level,
                 case when r.riding_discipline_at_event is not null
                      then r.snowboard_experience_level_at_event
                      else p.snowboard_experience_level end as snowboard_level
        ) lvl
        where r.event_id = p_event_id
          and r.checked_in_at is not null
          and (lvl.ski_level is not null or lvl.snowboard_level is not null)
      ) profiled
    ), '[]'::jsonb) else null::jsonb end
  ) into v_result;

  return v_result;
end;
$$;

revoke all on function public.get_event_impact_derived_data(uuid) from public;
grant execute on function public.get_event_impact_derived_data(uuid) to authenticated;
