-- Issue #172: event registration had zero abuse protection -- no honeypot
-- (unlike volunteer_applications) and no throttle beyond the
-- (event_id, lower(email)) uniqueness constraint, so an attacker could flood
-- any published event with unlimited fake registrations using distinct
-- emails. Adds a honeypot (same pattern as submit_volunteer_application) and
-- a per-IP rate limit via the shared check_rate_limit() from
-- 20260826170000.
--
-- Must drop before recreating: adding trailing parameters via
-- `create or replace` creates a distinct overload rather than replacing the
-- existing signature (Postgres identifies functions by name AND parameter
-- types), which would leave two ambiguous overloads callable by name. This
-- differs from 20260824160000, which safely used `create or replace` because
-- its signature was unchanged.
drop function public.register_for_event(uuid, text, text, text, integer, text);

create function public.register_for_event(
  p_event_id uuid,
  p_name text,
  p_email text,
  p_phone text,
  p_party_size integer,
  p_notes text,
  p_honeypot text default null,
  p_ip_address inet default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event record;
  v_existing_party_size integer;
  v_registration_id uuid;
  v_person_id uuid;
begin
  -- Rate limit before the honeypot check so flood attempts don't get a free
  -- pass just because they also tripped the honeypot.
  if not public.check_rate_limit('register_for_event', p_ip_address, 8, interval '15 minutes') then
    raise exception 'RATE_LIMITED';
  end if;

  -- Honeypot: a field real users never see or fill; bots that autofill
  -- every input trip it. Report a fake success so probing bots learn
  -- nothing was rejected.
  if p_honeypot is not null and p_honeypot <> '' then
    return gen_random_uuid();
  end if;

  select capacity, registration_enabled, registration_deadline
  into v_event
  from public.events
  where id = p_event_id and visibility = 'public' and status = 'published';

  if not found then
    raise exception 'EVENT_NOT_FOUND';
  end if;

  if not v_event.registration_enabled then
    raise exception 'REGISTRATION_CLOSED';
  end if;

  if v_event.registration_deadline is not null and v_event.registration_deadline < now() then
    raise exception 'REGISTRATION_DEADLINE_PASSED';
  end if;

  if p_party_size is null or p_party_size < 1 then
    raise exception 'INVALID_PARTY_SIZE';
  end if;

  if v_event.capacity is not null then
    select coalesce(sum(party_size), 0) into v_existing_party_size
    from public.event_registrations
    where event_id = p_event_id;

    if v_existing_party_size + p_party_size > v_event.capacity then
      raise exception 'EVENT_AT_CAPACITY';
    end if;
  end if;

  v_person_id := public.resolve_or_create_person_by_email(p_name, p_email, p_phone, null, 'other', null);

  insert into public.event_registrations (event_id, name, email, phone, party_size, notes, person_id)
  values (p_event_id, p_name, p_email, p_phone, p_party_size, p_notes, v_person_id)
  returning id into v_registration_id;

  return v_registration_id;
exception
  when unique_violation then
    raise exception 'ALREADY_REGISTERED';
end;
$$;

grant execute on function public.register_for_event to anon, authenticated;
