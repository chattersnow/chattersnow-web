-- Thread an optional Instagram handle through to new people rows created by
-- resolve_or_create_person_by_email(), same as p_phone/p_notes: only applied
-- when a brand-new person row is created, never backfilled onto an existing
-- matched person.
--
-- Adding a trailing parameter changes the signature, so this must drop
-- before recreating (see 20260826190000's note: `create or replace` with a
-- different parameter list creates a distinct overload instead of replacing
-- the existing function).
drop function public.resolve_or_create_person_by_email(text, text, text, text, text, text);

create function public.resolve_or_create_person_by_email(
  p_name text,
  p_email text,
  p_phone text default null,
  p_notes text default null,
  p_source_type text default 'other',
  p_role_flag text default null, -- 'is_donor' | 'is_sponsor' | 'is_volunteer' | null
  p_instagram_handle text default null
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
    (name, is_anonymous, source_type, email, phone, notes, is_donor, is_sponsor, is_volunteer, created_by, instagram_handle)
  values (
    p_name, false, p_source_type, p_email, p_phone, p_notes,
    coalesce(p_role_flag = 'is_donor', false),
    coalesce(p_role_flag = 'is_sponsor', false),
    coalesce(p_role_flag = 'is_volunteer', false),
    auth.uid(),
    p_instagram_handle
  )
  returning id into v_person_id;

  return v_person_id;
end;
$$;

-- No grant to anon/authenticated: only called from inside other
-- security-definer RPCs, which already enforce their own authorization.
