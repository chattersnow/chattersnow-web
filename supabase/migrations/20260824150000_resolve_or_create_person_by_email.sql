-- Shared by register_for_event() and create_donation_with_items(): looks up
-- an existing people row by normalized email, creating one only if no match
-- exists. Unlike resolve_current_person_id() (20260823140000), this never
-- reads auth.users/auth.uid() to find the match - callers may be anonymous
-- - and always returns a person_id (creating one) rather than returning null.
--
-- people.created_by was `not null default auth.uid()`, which is fine for
-- every existing insert path (all staff-authenticated) but breaks here:
-- register_for_event is callable by anon, and auth.uid() resolves to null
-- for a true anonymous request, so a new people row created from a public
-- registration would violate that not-null constraint. Relaxing it to
-- nullable is the same call already made for event_registrations itself
-- (20260823090000, which has no created_by at all for this exact reason).
alter table public.people alter column created_by drop not null;

create function public.resolve_or_create_person_by_email(
  p_name text,
  p_email text,
  p_phone text default null,
  p_notes text default null,
  p_source_type text default 'other',
  p_role_flag text default null -- 'is_donor' | 'is_sponsor' | 'is_volunteer' | null
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_person_id uuid;
begin
  if p_email is not null and p_email <> '' then
    select id into v_person_id
    from public.people
    where lower(email) = lower(p_email)
    order by created_at asc
    limit 1;
  end if;

  if v_person_id is not null then
    if p_role_flag = 'is_donor' then
      update public.people set is_donor = true where id = v_person_id and not is_donor;
    elsif p_role_flag = 'is_sponsor' then
      update public.people set is_sponsor = true where id = v_person_id and not is_sponsor;
    elsif p_role_flag = 'is_volunteer' then
      update public.people set is_volunteer = true where id = v_person_id and not is_volunteer;
    end if;
    return v_person_id;
  end if;

  insert into public.people
    (name, is_anonymous, source_type, email, phone, notes, is_donor, is_sponsor, is_volunteer, created_by)
  values (
    p_name, false, p_source_type, p_email, p_phone, p_notes,
    coalesce(p_role_flag = 'is_donor', false),
    coalesce(p_role_flag = 'is_sponsor', false),
    coalesce(p_role_flag = 'is_volunteer', false),
    auth.uid()
  )
  returning id into v_person_id;

  return v_person_id;
end;
$$;

-- No grant to anon/authenticated: only called from inside other
-- security-definer RPCs, which already enforce their own authorization.
