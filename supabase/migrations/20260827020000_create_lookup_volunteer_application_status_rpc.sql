-- Issue #338: lets applicants check their status without an account, using
-- the email + reference code shown once on the submission confirmation
-- screen (20260827010000). Same restricted-exposure reasoning as
-- public_volunteer_role_types -- callers only ever get the one column
-- (status) for the one row matching both email and code, never the table.
create function public.lookup_volunteer_application_status(
  p_email text,
  p_reference_code text,
  p_ip_address inet default null
) returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text;
begin
  -- Same per-IP throttle style as submit_volunteer_application, so guessing
  -- reference codes for a known email can't be brute-forced.
  if not public.check_rate_limit('lookup_volunteer_application_status', p_ip_address, 10, interval '15 minutes') then
    raise exception 'RATE_LIMITED';
  end if;

  if p_email is not null and p_reference_code is not null then
    select status into v_status
    from public.volunteer_applications
    where lower(email) = lower(p_email)
      and reference_code = upper(btrim(p_reference_code));
  end if;

  -- No exception on a miss: an unhandled exception aborts and rolls back
  -- the whole call, which would also undo the rate_limit_hits row the
  -- check above just committed toward -- silently letting every wrong
  -- guess (the exact enumeration attempt this throttle exists to catch)
  -- go uncounted. Returning null instead lets the transaction commit; the
  -- caller treats a null result as "not found".
  return v_status;
end;
$$;

grant execute on function public.lookup_volunteer_application_status to anon, authenticated;
