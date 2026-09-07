-- people.auth_user_id (20260823130000) is only ever written by
-- resolve_current_person_id()/ensure_current_person(), i.e. by the account
-- itself at sign-in. An account invited via pending_role_grants that has
-- never signed in, or one whose Google email differs from the address on the
-- directory record, therefore stays unlinked with no way to fix it from the
-- portal.
--
-- This lets an admin make that link explicitly from the person detail page.
-- security definer for the same reason set_preferred_name_for_user
-- (20260902040000) is: the function has to read auth.users, which the
-- authenticated role cannot select from directly.

create function public.link_person_to_auth_user(
  p_person_id uuid,
  p_user_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_existing_person_id uuid;
  v_linked_user_id uuid;
begin
  if not public.is_admin() then
    raise exception 'Not authorized';
  end if;

  if not exists (select 1 from auth.users where id = p_user_id) then
    raise exception 'No such portal account';
  end if;

  select auth_user_id into v_linked_user_id
    from public.people where id = p_person_id;

  if not found then
    raise exception 'No such person';
  end if;

  -- Linking a person who already points at a different account would silently
  -- move the link; make it an error so the admin re-checks which record is
  -- the duplicate rather than losing the old association.
  if v_linked_user_id is not null and v_linked_user_id <> p_user_id then
    raise exception 'This person is already linked to a different portal account';
  end if;

  -- people_auth_user_id_key would reject this anyway; raise the readable
  -- error instead of surfacing a unique-violation to the UI.
  select id into v_existing_person_id
    from public.people
   where auth_user_id = p_user_id and id <> p_person_id;

  if v_existing_person_id is not null then
    raise exception 'That portal account is already linked to another person';
  end if;

  update public.people set auth_user_id = p_user_id where id = p_person_id;
end;
$$;

grant execute on function public.link_person_to_auth_user(uuid, uuid) to authenticated;
