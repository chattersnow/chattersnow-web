-- Issue #74: when an event has auto_assign_discount_codes on, reserve the
-- next unused code from its uploaded batch for each new registrant, inside
-- the same transaction as the registration insert. `for update skip locked`
-- makes the claim safe under concurrency: two registrations arriving at the
-- same time lock different unused rows rather than one blocking on the
-- other's lock (which could otherwise let both see the same "next" row),
-- so no code is ever reserved twice. Codes auto-assign until the batch is
-- exhausted; the update's subquery then returns no row and the registration
-- simply proceeds without a code (no error, per the ticket).
--
-- Signature is unchanged from 20260826190000, so `create or replace` is
-- safe here (see that migration's note on why a signature change needs a
-- `drop` first).
create or replace function public.register_for_event(
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
  if not public.check_rate_limit('register_for_event', p_ip_address, 8, interval '15 minutes') then
    raise exception 'RATE_LIMITED';
  end if;

  if p_honeypot is not null and p_honeypot <> '' then
    return gen_random_uuid();
  end if;

  select capacity, registration_enabled, registration_deadline, auto_assign_discount_codes
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

  if v_event.auto_assign_discount_codes then
    update public.discount_codes
    set registration_id = v_registration_id,
        assigned_at = now()
    where id = (
      select id
      from public.discount_codes
      where event_id = p_event_id
        and registration_id is null
      order by created_at asc
      for update skip locked
      limit 1
    );
  end if;

  return v_registration_id;
exception
  when unique_violation then
    raise exception 'ALREADY_REGISTERED';
end;
$$;

grant execute on function public.register_for_event to anon, authenticated;
