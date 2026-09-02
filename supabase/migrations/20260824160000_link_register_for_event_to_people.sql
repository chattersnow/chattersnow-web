-- Issue #135: link a public event registration to a people record instead
-- of leaving it as raw text, resolving-or-creating by email server-side
-- (there's no signed-in user to drive a PersonPicker for an anon caller).
-- Signature is unchanged, so no client change is needed.

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
  v_person_id uuid;
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
