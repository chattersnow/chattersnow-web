-- Issue #571: derive every Program Impact Report metric from system data
-- where a system source actually exists, instead of exclusively summing
-- manually-entered event_impact_notes fields.
--
-- Participants: prefer events.attendance_count (20260821000000) per event;
-- fall back to counting that event's checked-in registrations
-- (event_registrations.checked_in_at, 20260824180000) when no headcount was
-- recorded.
--
-- First-time participants: counted system-wide, matching the definition
-- already used on the Attendees page (registrants-actions.ts,
-- getEventAttendanceBreakdownAction) -- a person is first-time if this is
-- the only event they've ever checked into, anywhere, not just within this
-- program. `checkin_counts` below computes each relevant person's lifetime
-- checked-in event count (system-wide, not scoped to v_event_ids) so the TS
-- layer can apply that rule.
--
-- Subsidized tickets: partial proxy via discount_codes (issue #73) --
-- partner/vendor codes actually assigned to a registrant. This
-- undercounts vs. internally-granted scholarships/fee waivers, which
-- aren't tracked anywhere in the schema; accepted as a known limitation
-- (see issue #571 discussion) rather than leaving this fully manual.
--
-- Beginner participants, rental subsidies, equipment loans, and total
-- assistance dollars have NO system source anywhere in the schema (no
-- experience-level field on people -- blocked on open issues #563/#564;
-- no rental/loan-vs-permanent-distribution tracking; no dollar-assistance
-- table) and are intentionally left untouched, still sourced from
-- event_impact_notes.
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
