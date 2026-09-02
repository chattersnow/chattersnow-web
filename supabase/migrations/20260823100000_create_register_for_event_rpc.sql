-- Anonymous registrants can insert into event_registrations but (correctly)
-- cannot select from it — reading it back to count existing party size for
-- the capacity check would require a select grant that leaks other
-- registrants' contact info. This security-definer RPC does the
-- window/capacity validation and the insert atomically, bypassing RLS
-- safely since it only ever returns a new registration id or an error code,
-- never other registrants' rows.

create or replace function public.register_for_event(
  p_event_id uuid,
  p_name text,
  p_email text,
  p_phone text,
  p_party_size integer,
  p_notes text
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event record;
  v_existing_party_size integer;
  v_registration_id uuid;
begin
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

  insert into public.event_registrations (event_id, name, email, phone, party_size, notes)
  values (p_event_id, p_name, p_email, p_phone, p_party_size, p_notes)
  returning id into v_registration_id;

  return v_registration_id;
exception
  when unique_violation then
    raise exception 'ALREADY_REGISTERED';
end;
$$;

grant execute on function public.register_for_event to anon, authenticated;
