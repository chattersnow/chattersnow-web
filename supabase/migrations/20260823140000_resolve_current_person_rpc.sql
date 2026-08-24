-- Resolves the signed-in user to a people row, auto-linking by email on
-- first use. people select/update RLS requires people:view/people:manage,
-- which a plain volunteer doesn't have, so this must be security definer
-- (same pattern as create_donation_with_items/record_event_distribution)
-- and read auth.users directly rather than relying on the auth.email()
-- helper, which nothing else in this codebase uses.

create function public.resolve_current_person_id()
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_person_id uuid;
  v_email text;
begin
  if auth.uid() is null then
    return null;
  end if;

  select id into v_person_id from public.people where auth_user_id = auth.uid();
  if v_person_id is not null then
    return v_person_id;
  end if;

  select email into v_email from auth.users where id = auth.uid();
  if v_email is null then
    return null;
  end if;

  select id into v_person_id
  from public.people
  where auth_user_id is null and lower(email) = lower(v_email)
  order by created_at asc
  limit 1;

  if v_person_id is not null then
    update public.people set auth_user_id = auth.uid() where id = v_person_id;
  end if;

  return v_person_id;
end;
$$;

grant execute on function public.resolve_current_person_id to authenticated;
