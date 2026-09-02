-- Issue #564: after a successful public event registration we prompt the
-- registrant for their rider profile (#563). That write has to happen from an
-- anonymous browser, and `anon` has no policy or grant on `people` at all --
-- deliberately, since direct table access would let anyone rewrite any
-- person's row. So this follows register_for_event (20260823100000): a
-- security-definer RPC that validates and writes, granted to anon.
--
-- Authorization is the registration id itself. register_for_event already
-- returns the new event_registrations.id (a random uuid, unguessable), so a
-- caller holding one has demonstrably just completed that registration. It's
-- scoped to a day so a leaked id can't be replayed indefinitely; after that
-- the profile is staff-editable in the portal instead.
--
-- Returns void: the caller has nothing to read back, and the honeypot path
-- needs a return value that reveals nothing either way.

create function public.save_registrant_rider_profile(
  p_registration_id uuid,
  p_riding_discipline text,
  p_ski_experience_level text default null,
  p_snowboard_experience_level text default null,
  p_preferred_mountain text default null,
  p_honeypot text default null,
  p_ip_address inet default null
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_person_id uuid;
begin
  -- Rate limit before the honeypot check so flood attempts don't get a free
  -- pass just because they also tripped the honeypot (same ordering and
  -- shared helper as register_for_event, 20260826190000/20260826170000).
  if not public.check_rate_limit('save_registrant_rider_profile', p_ip_address, 8, interval '15 minutes') then
    raise exception 'RATE_LIMITED';
  end if;

  -- Honeypot: a field real users never see or fill. Return silently so
  -- probing bots learn nothing was rejected.
  if p_honeypot is not null and p_honeypot <> '' then
    return;
  end if;

  -- Validate explicitly rather than letting the column CHECK constraints
  -- surface a raw Postgres error the server action can't map to a message.
  if p_riding_discipline is null or p_riding_discipline not in ('ski', 'snowboard', 'both') then
    raise exception 'INVALID_RIDER_PROFILE';
  end if;

  if p_riding_discipline in ('ski', 'both')
    and (p_ski_experience_level is null
      or p_ski_experience_level not in ('beginner', 'intermediate', 'advanced')) then
    raise exception 'INVALID_RIDER_PROFILE';
  end if;

  if p_riding_discipline in ('snowboard', 'both')
    and (p_snowboard_experience_level is null
      or p_snowboard_experience_level not in ('beginner', 'intermediate', 'advanced')) then
    raise exception 'INVALID_RIDER_PROFILE';
  end if;

  -- An id that matches nothing also covers register_for_event's honeypot
  -- path, which hands back a fabricated gen_random_uuid().
  select person_id into v_person_id
  from public.event_registrations
  where id = p_registration_id
    and person_id is not null
    and created_at > now() - interval '1 day';

  if v_person_id is null then
    raise exception 'RIDER_PROFILE_UNAVAILABLE';
  end if;

  update public.people
  set riding_discipline = p_riding_discipline,
      ski_experience_level = case
        when p_riding_discipline in ('ski', 'both') then p_ski_experience_level
      end,
      snowboard_experience_level = case
        when p_riding_discipline in ('snowboard', 'both') then p_snowboard_experience_level
      end,
      preferred_mountain = nullif(btrim(coalesce(p_preferred_mountain, '')), '')
  where id = v_person_id;
end;
$$;

grant execute on function public.save_registrant_rider_profile to anon, authenticated;
