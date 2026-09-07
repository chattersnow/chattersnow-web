-- Ask for pronouns on the two public intake forms, store them on the intake
-- row, and carry them onto the person record.
--
-- Each of the three functions gains one trailing parameter, which changes its
-- signature, so each must be dropped before it is recreated (see 20260826190000's
-- note: `create or replace` with a different parameter list creates a distinct
-- overload instead of replacing the existing function). Existing callers that
-- pass the old argument count keep working -- the new parameter defaults to
-- null.

-- resolve_or_create_person_by_email: body from 20260904190000, plus
-- p_pronouns.
--
-- This one deviates from how p_instagram_handle is treated (20260830080000,
-- "only applied when a brand-new person row is created, never backfilled onto
-- an existing matched person"), and deliberately. A returning registrant
-- typing their pronouns into a form is the most authoritative source there is
-- for them, and leaving the person record blank because they attended
-- something last season would defeat the point of collecting the field. The
-- update is still guarded to fill a blank only: a value already on the record
-- was either set by the person at /portal/account or corrected by an admin,
-- and a stale browser autofill must never overwrite that.
drop function public.resolve_or_create_person_by_email(text, text, text, text, text, text, text);

create function public.resolve_or_create_person_by_email(
  p_name text,
  p_email text,
  p_phone text default null,
  p_notes text default null,
  p_source_type text default 'other',
  p_role_flag text default null, -- accepted and ignored; see 20260903020000
  p_instagram_handle text default null,
  p_pronouns text default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_person_id uuid;
  v_pronouns text := nullif(btrim(p_pronouns), '');
begin
  if p_email is not null and p_email <> '' then
    select id into v_person_id
    from public.people
    where lower(email) = lower(p_email)
      and not is_anonymous
    order by created_at asc
    limit 1;
  end if;

  if v_person_id is not null then
    if v_pronouns is not null then
      update public.people
         set pronouns = v_pronouns
       where id = v_person_id
         and pronouns is null;
    end if;
    return v_person_id;
  end if;

  begin
    insert into public.people
      (name, is_anonymous, source_type, email, phone, notes, created_by, instagram_handle, pronouns)
    values (
      p_name, false, p_source_type, p_email, p_phone, p_notes, auth.uid(), p_instagram_handle, v_pronouns
    )
    returning id into v_person_id;
  exception when unique_violation then
    select id into v_person_id
      from public.people
     where lower(email) = lower(p_email)
       and not is_anonymous
     order by created_at asc
     limit 1;
  end;

  return v_person_id;
end;
$$;

-- register_for_event: body from 20260830090000, plus p_pronouns.
drop function public.register_for_event(uuid, text, text, text, integer, text, text, inet, text);

create function public.register_for_event(
  p_event_id uuid,
  p_name text,
  p_email text,
  p_phone text,
  p_party_size integer,
  p_notes text,
  p_honeypot text default null,
  p_ip_address inet default null,
  p_instagram_handle text default null,
  p_pronouns text default null
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
  v_pronouns text := nullif(btrim(p_pronouns), '');
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

  -- Named error rather than letting the column's check constraint surface as
  -- an unmapped Postgres message to a visitor mid-registration.
  if char_length(v_pronouns) > 40 then
    raise exception 'PRONOUNS_TOO_LONG';
  end if;

  if v_event.capacity is not null then
    select coalesce(sum(party_size), 0) into v_existing_party_size
    from public.event_registrations
    where event_id = p_event_id;

    if v_existing_party_size + p_party_size > v_event.capacity then
      raise exception 'EVENT_AT_CAPACITY';
    end if;
  end if;

  v_person_id := public.resolve_or_create_person_by_email(
    p_name, p_email, p_phone, null, 'other', null, p_instagram_handle, v_pronouns
  );

  insert into public.event_registrations
    (event_id, name, email, phone, party_size, notes, person_id, instagram_handle, pronouns)
  values
    (p_event_id, p_name, p_email, p_phone, p_party_size, p_notes, v_person_id, p_instagram_handle, v_pronouns)
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

-- submit_volunteer_application: body from 20260827010000, plus p_pronouns.
drop function public.submit_volunteer_application(text, text, text, text, text, text, inet);

create function public.submit_volunteer_application(
  p_name text,
  p_email text,
  p_phone text,
  p_role_interest text,
  p_availability text,
  p_honeypot text default null,
  p_ip_address inet default null,
  p_pronouns text default null
) returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_person_id uuid;
  v_reference_code text;
  v_recent_count integer;
  v_pronouns text := nullif(btrim(p_pronouns), '');
begin
  -- Rate limit before the honeypot check so flood attempts don't get a free
  -- pass just because they also tripped the honeypot.
  if not public.check_rate_limit('submit_volunteer_application', p_ip_address, 5, interval '15 minutes') then
    raise exception 'RATE_LIMITED';
  end if;

  -- Honeypot: a field real users never see or fill; bots that autofill
  -- every input trip it. Report a fake success so probing bots learn
  -- nothing was rejected.
  if p_honeypot is not null and p_honeypot <> '' then
    return public.generate_volunteer_reference_code();
  end if;

  if p_name is null or btrim(p_name) = '' then
    raise exception 'NAME_REQUIRED';
  end if;
  if p_email is null or p_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'INVALID_EMAIL';
  end if;
  if char_length(v_pronouns) > 40 then
    raise exception 'PRONOUNS_TOO_LONG';
  end if;

  select count(*) into v_recent_count
  from public.volunteer_applications
  where lower(email) = lower(p_email) and created_at > now() - interval '1 day';

  if v_recent_count > 0 then
    raise exception 'ALREADY_SUBMITTED';
  end if;

  v_person_id := public.resolve_or_create_person_by_email(
    p_name, p_email, p_phone, null, 'other', 'is_volunteer', null, v_pronouns
  );

  v_reference_code := public.generate_volunteer_reference_code();

  insert into public.volunteer_applications
    (person_id, name, email, phone, role_interest, availability, reference_code, pronouns)
  values
    (v_person_id, p_name, p_email, p_phone, p_role_interest, p_availability, v_reference_code, v_pronouns);

  return v_reference_code;
end;
$$;

grant execute on function public.submit_volunteer_application to anon, authenticated;
