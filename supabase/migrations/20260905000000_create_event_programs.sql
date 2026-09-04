-- An event can count toward more than one program's impact report -- a single
-- access day can serve both the mountain-access program and the gear program,
-- and both grant reports need it. `events.program_id` (20260822110000) could
-- only ever attribute it to one, so the second program under-counted.
--
-- Replaced with a join table shaped exactly like `calendar_item_programs`
-- (20260824000000), which is the same relationship against the same `programs`
-- table. No primary/secondary distinction: every linked program counts the
-- event equally, which is the whole point.
create table public.event_programs (
  event_id uuid not null references public.events(id) on delete cascade,
  program_id uuid not null references public.programs(id) on delete cascade,
  primary key (event_id, program_id)
);

-- The primary key already indexes (event_id, program_id); this covers the
-- other direction, which is what the rollup below and listProgramEventsAction
-- filter on.
create index event_programs_program_id_idx on public.event_programs (program_id);

alter table public.event_programs enable row level security;

-- Gated on the existing `events` resource rather than a new one: these rows are
-- part of an event's record, and anyone who can edit the event can say which
-- programs it counts toward.
create policy "event_programs select" on public.event_programs for select to authenticated
  using (public.has_permission('events', 'view'));
create policy "event_programs insert" on public.event_programs for insert to authenticated
  with check (public.has_permission('events', 'manage'));
create policy "event_programs update" on public.event_programs for update to authenticated
  using (public.has_permission('events', 'manage')) with check (public.has_permission('events', 'manage'));
create policy "event_programs delete" on public.event_programs for delete to authenticated
  using (public.has_permission('events', 'manage'));

-- auto_expose_new_tables is off in this project's config, so the grant is
-- required alongside the policies.
grant select, insert, update, delete on public.event_programs to authenticated;

insert into public.event_programs (event_id, program_id)
select id, program_id from public.events where program_id is not null;

alter table public.events drop column program_id;

-- The rollup gathered its event ids from `events.program_id`; it now reads the
-- join table, so an event linked to two programs lands in both reports. The
-- body is carried forward verbatim from 20260904140000 -- everything after the
-- gather already works off v_event_ids and is unchanged.
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

  select coalesce(array_agg(event_id), '{}') into v_event_ids
  from public.event_programs
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
