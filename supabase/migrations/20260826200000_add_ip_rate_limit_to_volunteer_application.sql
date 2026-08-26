-- Issue #172: submit_volunteer_application's throttle was email-only (24h
-- per email), so an attacker rotating email addresses was unthrottled. Adds
-- a per-IP rate limit via the shared check_rate_limit() from
-- 20260826170000, on top of the existing per-email throttle.
--
-- Must drop before recreating: adding a trailing parameter via
-- `create or replace` creates a distinct overload rather than replacing the
-- existing signature (Postgres identifies functions by name AND parameter
-- types) -- see 20260826190000 for the same reasoning applied to
-- register_for_event.
drop function public.submit_volunteer_application(text, text, text, text, text, text);

create function public.submit_volunteer_application(
  p_name text,
  p_email text,
  p_phone text,
  p_role_interest text,
  p_availability text,
  p_honeypot text default null,
  p_ip_address inet default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_person_id uuid;
  v_application_id uuid;
  v_recent_count integer;
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
    return gen_random_uuid();
  end if;

  if p_name is null or btrim(p_name) = '' then
    raise exception 'NAME_REQUIRED';
  end if;
  if p_email is null or p_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'INVALID_EMAIL';
  end if;

  select count(*) into v_recent_count
  from public.volunteer_applications
  where lower(email) = lower(p_email) and created_at > now() - interval '1 day';

  if v_recent_count > 0 then
    raise exception 'ALREADY_SUBMITTED';
  end if;

  v_person_id := public.resolve_or_create_person_by_email(
    p_name, p_email, p_phone, null, 'other', 'is_volunteer'
  );

  insert into public.volunteer_applications (person_id, name, email, phone, role_interest, availability)
  values (v_person_id, p_name, p_email, p_phone, p_role_interest, p_availability)
  returning id into v_application_id;

  return v_application_id;
end;
$$;

grant execute on function public.submit_volunteer_application to anon, authenticated;
