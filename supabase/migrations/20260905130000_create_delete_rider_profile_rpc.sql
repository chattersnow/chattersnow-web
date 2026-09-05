-- Issue #602, part 5 of 6: honouring a deletion request.
--
-- /privacy says a rider profile is kept "until you ask us to delete your
-- profile, or after 2 years of inactivity". The scheduled purge covers the
-- second half; this is the first. A lead who takes that request needs a way to
-- action it and a record that it was actioned.
--
-- Gate mirrors set_registrant_rider_profile (20260904130000), which solved the
-- same problem in the other direction: a lead working the door holds
-- events:manage but not necessarily people:view, and a request to delete a
-- rider profile reaches whoever is running the event as often as it reaches the
-- people directory.
--
-- The record goes in retention_runs rather than audit_log because `people` is
-- not in the audited set -- the reason person_merges exists at all
-- (20260904180000). Putting it here means scheduled and on-request deletions
-- answer a subject-access request from one table.
create function public.delete_rider_profile(
  p_person_id uuid,
  p_reason text default null
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_run_id uuid;
begin
  if not (public.has_permission('events', 'manage')
          or public.has_permission('people', 'manage')) then
    raise exception 'Not authorized';
  end if;

  if not exists (select 1 from public.people where id = p_person_id) then
    raise exception 'No such person';
  end if;

  -- Same ordering constraint as the scheduled rule: stamp the snapshot before
  -- clearing the live columns, or every past event this rider was checked in to
  -- silently loses its recorded level (20260904120000/20260904140000).
  update public.event_registrations r
     set riding_discipline_at_event = p.riding_discipline,
         ski_experience_level_at_event = p.ski_experience_level,
         snowboard_experience_level_at_event = p.snowboard_experience_level
    from public.people p
   where p.id = r.person_id
     and p.id = p_person_id
     and r.checked_in_at is not null
     and r.riding_discipline_at_event is null
     and p.riding_discipline is not null;

  -- All four together: the discipline/level check constraints fire otherwise.
  update public.people
     set riding_discipline = null,
         ski_experience_level = null,
         snowboard_experience_level = null,
         preferred_mountain = null
   where id = p_person_id;

  insert into public.retention_runs
    (as_of, dry_run, trigger, triggered_by, reason, status, finished_at)
  values (now(), false, 'request', auth.uid(), p_reason, 'succeeded', now())
  returning id into v_run_id;

  perform public.retention_log(
    v_run_id, 'rider_profiles', 'people', 'cleared',
    array[p_person_id], p_person_id
  );
end;
$$;

grant execute on function public.delete_rider_profile to authenticated;
