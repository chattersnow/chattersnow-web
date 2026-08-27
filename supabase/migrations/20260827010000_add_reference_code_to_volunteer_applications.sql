-- Issue #338: applicants need a way to check their status later without an
-- account. Adds a reference code, shown once on the submission confirmation
-- screen, that pairs with the applicant's email to look up status via
-- lookup_volunteer_application_status (20260827020000). Not emailed -- the
-- app has no outbound email infra yet (see #338's "out of scope").

alter table public.volunteer_applications add column reference_code text;

-- Confusable characters (0/O, 1/I/L) excluded so a misread/mistyped
-- character can't silently resolve to a different valid code.
create function public.generate_volunteer_reference_code()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_chars text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  v_code text;
begin
  loop
    select string_agg(substr(v_chars, (ceil(random() * length(v_chars)))::int, 1), '')
    into v_code
    from generate_series(1, 8);

    exit when not exists (
      select 1 from public.volunteer_applications where reference_code = v_code
    );
  end loop;
  return v_code;
end;
$$;
-- Not granted to anon/authenticated: only called from within
-- submit_volunteer_application, which runs as the function owner.

update public.volunteer_applications
set reference_code = public.generate_volunteer_reference_code()
where reference_code is null;

alter table public.volunteer_applications
  alter column reference_code set not null,
  add constraint volunteer_applications_reference_code_key unique (reference_code);

-- Return type is changing (uuid -> text), so create or replace won't work
-- even with the parameter list unchanged -- Postgres requires a drop first.
drop function public.submit_volunteer_application(text, text, text, text, text, text, inet);

create function public.submit_volunteer_application(
  p_name text,
  p_email text,
  p_phone text,
  p_role_interest text,
  p_availability text,
  p_honeypot text default null,
  p_ip_address inet default null
) returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_person_id uuid;
  v_reference_code text;
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
    return public.generate_volunteer_reference_code();
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

  v_reference_code := public.generate_volunteer_reference_code();

  insert into public.volunteer_applications
    (person_id, name, email, phone, role_interest, availability, reference_code)
  values
    (v_person_id, p_name, p_email, p_phone, p_role_interest, p_availability, v_reference_code);

  return v_reference_code;
end;
$$;

grant execute on function public.submit_volunteer_application to anon, authenticated;
