-- Finish the derivation work #571/#572 started at the program-rollup level, but
-- left undone on the per-event Impact card.
--
-- #572 taught the Program Impact Report to compute participants, first-time
-- participants and subsidized tickets from system data, but the per-event Impact
-- card kept asking staff to type all seventeen figures by hand -- including the
-- three the report had just stopped reading. Staff were re-entering, at report
-- time, numbers the system already held one card away: the attendance headcount
-- (Attendance card), the first-time/recurring split (already rendered on the
-- Registrants card), assigned discount codes (Discount codes card), and the
-- volunteer roster (Volunteers card).
--
-- What changes here:
--
--   * events.attendance_count stays the authoritative participant number. It is
--     NOT superseded by check-ins; check-in figures are shown alongside it as
--     reference. event_impact_notes.total_participants was a second copy of the
--     same fact that could only ever disagree, so it is backfilled into
--     events.attendance_count where that column is empty, then dropped.
--
--   * first_time_participants, beginner_participants, volunteer_participants and
--     subsidized_tickets_count become derived (see get_event_impact_derived_data
--     in 20260904030000, and the rollup below). beginner_participants is
--     derivable now that people.ski_experience_level /
--     snowboard_experience_level exist (20260901050000) -- the note in
--     20260901040000 calling this "blocked on #563/#564" is stale, both landed.
--
--   * equipment_loans_count is retired. This schema has no loan concept at all:
--     inventory_movements.movement_type has no 'loaned'/'returned' member and
--     record_event_distribution (20260823150000) sets status='distributed'
--     terminally, with no return path. The gear program is a give-away, not a
--     lending library, so on the report this figure sat beside "Equipment
--     distributed" double-counting the same handouts.
--
--   * The six survey_* columns are retired. No survey table exists, and neither
--     version of get_program_impact_rollup_data ever selected them -- they were
--     entered by staff and read by nothing.
--
-- Staff typed these numbers and some may already sit in filed grant reports, so
-- every dropped value is archived into legacy_manual_values first. No app code
-- reads that column; it exists so this migration is not a data-loss event.
--
-- Note for future readers: 20260825020000 still contains the ORIGINAL body of
-- get_program_impact_rollup_data, which also names the columns dropped below.
-- That is harmless -- plpgsql bodies are not validated against the catalog at
-- CREATE time, and 20260901040000 replaces it long before this migration runs.
-- Do not "fix" it.

-- 1. Archive every value about to be dropped.
alter table public.event_impact_notes add column legacy_manual_values jsonb;

comment on column public.event_impact_notes.legacy_manual_values is
  'Read by no application code. Archive of the manually-entered figures dropped in 20260904020000 when they became derived or retired, kept in case they were used in filed reports.';

update public.event_impact_notes
set legacy_manual_values = jsonb_strip_nulls(jsonb_build_object(
  'total_participants', total_participants,
  'first_time_participants', first_time_participants,
  'beginner_participants', beginner_participants,
  'volunteer_participants', volunteer_participants,
  'subsidized_tickets_count', subsidized_tickets_count,
  'equipment_loans_count', equipment_loans_count,
  'survey_respondents_count', survey_respondents_count,
  'survey_easier_to_participate_yes_count', survey_easier_to_participate_yes_count,
  'survey_would_not_have_participated_without_assistance_yes_count', survey_would_not_have_participated_without_assistance_yes_count,
  'survey_first_time_skiing_yes_count', survey_first_time_skiing_yes_count,
  'survey_felt_welcomed_yes_count', survey_felt_welcomed_yes_count,
  'survey_would_attend_again_yes_count', survey_would_attend_again_yes_count
))
where total_participants is not null
   or first_time_participants is not null
   or beginner_participants is not null
   or volunteer_participants is not null
   or subsidized_tickets_count is not null
   or equipment_loans_count is not null
   or survey_respondents_count is not null
   or survey_easier_to_participate_yes_count is not null
   or survey_would_not_have_participated_without_assistance_yes_count is not null
   or survey_first_time_skiing_yes_count is not null
   or survey_felt_welcomed_yes_count is not null
   or survey_would_attend_again_yes_count is not null;

-- 2. Promote the typed headcount into the authoritative column, but never over
-- an existing value -- events stays the source of truth.
update public.events e
set attendance_count = n.total_participants
from public.event_impact_notes n
where n.event_id = e.id
  and e.attendance_count is null
  and n.total_participants is not null;

-- 3. Drop the derived and retired columns (their check constraints go with them).
alter table public.event_impact_notes
  drop column total_participants,
  drop column first_time_participants,
  drop column beginner_participants,
  drop column volunteer_participants,
  drop column subsidized_tickets_count,
  drop column equipment_loans_count,
  drop column survey_respondents_count,
  drop column survey_easier_to_participate_yes_count,
  drop column survey_would_not_have_participated_without_assistance_yes_count,
  drop column survey_first_time_skiing_yes_count,
  drop column survey_felt_welcomed_yes_count,
  drop column survey_would_attend_again_yes_count;

-- 4. Replace the rollup in the same migration as the drops. Its body names the
-- dropped columns and plpgsql resolves them at execution time, so splitting
-- these into two migrations would leave a window where /portal/programs/reports
-- throws.
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
    -- denominator: the rider profile (20260901050000) is opt-in and was never
    -- backfilled, so without it this reads "0 beginners" on every historical
    -- event and staff rightly stop trusting the card.
    'beginner_attendees', coalesce((
      select jsonb_agg(jsonb_build_object('event_id', event_id, 'person_id', person_id))
      from (
        select distinct r.event_id, r.person_id
        from public.event_registrations r
        join public.people p on p.id = r.person_id
        where r.event_id = any(v_event_ids)
          and r.checked_in_at is not null
          and (p.ski_experience_level = 'beginner' or p.snowboard_experience_level = 'beginner')
      ) beginners
    ), '[]'::jsonb),
    'profiled_attendees', coalesce((
      select jsonb_agg(jsonb_build_object('event_id', event_id, 'person_id', person_id))
      from (
        select distinct r.event_id, r.person_id
        from public.event_registrations r
        join public.people p on p.id = r.person_id
        where r.event_id = any(v_event_ids)
          and r.checked_in_at is not null
          and (p.ski_experience_level is not null or p.snowboard_experience_level is not null)
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
