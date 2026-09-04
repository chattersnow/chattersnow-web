-- Issue #653: let the door capture a rider profile that was never collected.
--
-- The public prompt (20260901060000_create_save_registrant_rider_profile_rpc)
-- only covers people who registered after it shipped, and there is no
-- transactional email in this project to chase everyone else. The remaining
-- moment when somebody is actually in front of us is check-in, so the
-- Registrants tab needs to write a profile -- but the "people update" policy
-- (20260822100000) requires people:manage, and an event_coordinator holds only
-- people:view plus the insert-only people_intake carve-out. Same shape of
-- problem, and same answer, as get_event_impact_derived_data's board role: a
-- security definer function with its own narrower guard.
--
-- Narrower than a people update in three ways: it touches only the four rider
-- columns, only for a person who has a registration for a real event, and only
-- for a caller holding events:manage.

create function public.set_registrant_rider_profile(
  p_registration_id uuid,
  p_riding_discipline text,
  p_ski_experience_level text default null,
  p_snowboard_experience_level text default null,
  p_preferred_mountain text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_person_id uuid;
  v_checked_in timestamptz;
  v_ski text;
  v_snowboard text;
begin
  if not public.has_permission('events', 'manage') then
    raise exception 'Not authorized to edit registrant rider profiles';
  end if;

  if p_riding_discipline not in ('ski', 'snowboard', 'both') then
    raise exception 'INVALID_RIDER_PROFILE';
  end if;

  -- Same rule the public RPC applies: a level may only exist for a discipline
  -- the person actually rides, which is also what the people CHECK constraints
  -- (20260901050000) enforce.
  v_ski := case when p_riding_discipline in ('ski', 'both') then p_ski_experience_level end;
  v_snowboard := case when p_riding_discipline in ('snowboard', 'both') then p_snowboard_experience_level end;

  if p_riding_discipline in ('ski', 'both')
     and (v_ski is null or v_ski not in ('beginner', 'intermediate', 'advanced')) then
    raise exception 'INVALID_RIDER_PROFILE';
  end if;
  if p_riding_discipline in ('snowboard', 'both')
     and (v_snowboard is null or v_snowboard not in ('beginner', 'intermediate', 'advanced')) then
    raise exception 'INVALID_RIDER_PROFILE';
  end if;

  select person_id, checked_in_at into v_person_id, v_checked_in
  from public.event_registrations
  where id = p_registration_id;

  if v_person_id is null then
    raise exception 'REGISTRANT_NOT_FOUND';
  end if;

  update public.people
  set riding_discipline = p_riding_discipline,
      ski_experience_level = v_ski,
      snowboard_experience_level = v_snowboard,
      preferred_mountain = nullif(btrim(coalesce(p_preferred_mountain, '')), '')
  where id = v_person_id;

  -- Already at the door: this answer is the level at the event, so keep the
  -- snapshot in step rather than waiting for a check-in that already happened.
  if v_checked_in is not null then
    update public.event_registrations
    set riding_discipline_at_event = p_riding_discipline,
        ski_experience_level_at_event = v_ski,
        snowboard_experience_level_at_event = v_snowboard
    where id = p_registration_id;
  end if;
end;
$$;

revoke all on function public.set_registrant_rider_profile(uuid, text, text, text, text) from public;
grant execute on function public.set_registrant_rider_profile(uuid, text, text, text, text) to authenticated;
