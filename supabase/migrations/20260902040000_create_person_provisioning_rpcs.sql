-- Every owner/assignee column in the portal now resolves to a people row, so
-- a portal user who has no people row simply cannot be assigned anything.
-- Nothing creates one today: there is no trigger on auth.users anywhere in
-- this schema, and resolve_current_person_id() (20260823140000) only *links*
-- an existing unlinked row by email -- it never inserts.
--
-- These three functions close that gap and give preferred_name two writers.
-- All are security definer for the same reason resolve_current_person_id
-- documents: people select/update RLS requires people:view / people:manage,
-- and board + volunteer hold people:none
-- (20260822090000_create_resources_and_role_permissions.sql) -- yet both
-- roles have portal accounts that must be nameable and assignable.

-- Resolve the signed-in user to a people row, creating one from their auth
-- metadata if neither the auth_user_id link nor the email fallback finds one.
create function public.ensure_current_person()
returns table (
  person_id uuid,
  name text,
  preferred_name text,
  email text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_person_id uuid;
begin
  if auth.uid() is null then
    return;
  end if;

  -- Reuse the existing resolver: it already handles both the linked case and
  -- the link-an-unlinked-row-by-email backfill.
  v_person_id := public.resolve_current_person_id();

  if v_person_id is null then
    begin
      insert into public.people (name, is_anonymous, source_type, email, auth_user_id, created_by)
      select
        coalesce(u.raw_user_meta_data ->> 'full_name', u.raw_user_meta_data ->> 'name', u.email),
        false,
        'other',
        u.email,
        u.id,
        u.id
      from auth.users u
      where u.id = auth.uid()
      returning id into v_person_id;
    exception when unique_violation then
      -- people_auth_user_id_key (20260823130000) is the race guard: a
      -- concurrent login inserted the row between the resolve and the insert.
      select pp.id into v_person_id
        from public.people pp
       where pp.auth_user_id = auth.uid();
    end;
  end if;

  return query
    select pp.id, pp.name, pp.preferred_name, pp.email
      from public.people pp
     where pp.id = v_person_id;
end;
$$;

grant execute on function public.ensure_current_person() to authenticated;

-- Self-serve: /portal/account. Any signed-in user may set their own
-- preferred name regardless of their people: permission level.
create function public.set_my_preferred_name(p_preferred_name text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_person_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Not signed in';
  end if;

  select ecp.person_id into v_person_id from public.ensure_current_person() ecp;

  if v_person_id is null then
    raise exception 'No person record for the current user';
  end if;

  update public.people
     set preferred_name = nullif(trim(p_preferred_name), '')
   where id = v_person_id;
end;
$$;

grant execute on function public.set_my_preferred_name(text) to authenticated;

-- Admin: Administration -> Users. Creates the people row when the target has
-- none, which is the normal case for an account that was invited via a
-- pending_role_grants link but has never signed in.
create function public.set_preferred_name_for_user(p_user_id uuid, p_preferred_name text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_person_id uuid;
begin
  if not public.is_admin() then
    raise exception 'Not authorized';
  end if;

  select id into v_person_id from public.people where auth_user_id = p_user_id;

  if v_person_id is null then
    -- Same email fallback as resolve_current_person_id, then create.
    select p.id into v_person_id
      from public.people p
      join auth.users u on lower(u.email) = lower(p.email)
     where p.auth_user_id is null
       and u.id = p_user_id
     order by p.created_at asc
     limit 1;

    if v_person_id is not null then
      update public.people set auth_user_id = p_user_id where id = v_person_id;
    else
      insert into public.people (name, is_anonymous, source_type, email, auth_user_id, created_by)
      select
        coalesce(u.raw_user_meta_data ->> 'full_name', u.raw_user_meta_data ->> 'name', u.email),
        false,
        'other',
        u.email,
        u.id,
        auth.uid()
      from auth.users u
      where u.id = p_user_id
      returning id into v_person_id;
    end if;
  end if;

  if v_person_id is null then
    raise exception 'No such user';
  end if;

  update public.people
     set preferred_name = nullif(trim(p_preferred_name), '')
   where id = v_person_id;
end;
$$;

grant execute on function public.set_preferred_name_for_user(uuid, text) to authenticated;
