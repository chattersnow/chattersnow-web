-- Second half of making people.email unique; see
-- 20260904170000_normalize_person_email.sql for why, and
-- 20260904180000_create_person_merge_rpcs.sql for the tooling that gets a
-- database ready for this one.
--
-- This migration will FAIL, deliberately and with instructions, against a
-- database that still holds duplicate addresses. That is the whole point: no
-- data is merged without a human choosing which record survives. `supabase db
-- push` applies migrations one at a time, so a failure here leaves the two
-- migrations above applied and recorded -- deploy, work the People >
-- Duplicates queue until it is empty, then push again.

do $$
declare
  v_n bigint;
begin
  select count(*) into v_n from (
    select lower(email)
      from public.people
     where email is not null
       and not is_anonymous
     group by 1
    having count(*) > 1
  ) d;

  if v_n > 0 then
    raise exception
      '% duplicate email address(es) remain in people. Merge them at /portal/people/duplicates, then re-run this migration.', v_n;
  end if;
end
$$;

-- Plain create, not concurrently: the Supabase CLI runs each migration file in
-- a transaction, and people is small enough that the ACCESS EXCLUSIVE window is
-- not worth splitting the migration to avoid.
--
-- Predicate matches 20260904170000's non-unique index exactly, and for the same
-- reason: `email <> ''` would not be provable from `lower(email) = lower($1)`
-- and would cost the index its main caller. Anonymous rows stay out because
-- create_donation_with_items (20260824170000) deliberately inserts a fresh row
-- per anonymous donation -- matching an anonymous donor by email is meaningless
-- -- and resolve_or_create_person_by_email now filters them out to match.
drop index public.people_email_idx;

create unique index people_email_key
  on public.people (lower(email))
  where email is not null and not is_anonymous;

-- The three functions whose insert paths can now raise 23505 where they never
-- could before. Each is a create-or-replace of the body cited, changing only
-- the error handling.

-- ensure_current_person (20260902040000) recovers from unique_violation by
-- re-reading people.auth_user_id, because people_auth_user_id_key was the only
-- unique index it could hit. It can now hit people_email_key instead -- an
-- unlinked directory row already holding this account's address, or one linked
-- to a different account, which resolve_current_person_id will not claim. The
-- old handler finds nothing, v_person_id stays null, and the function returns
-- an EMPTY ROWSET: every caller reports "no person record for the current user"
-- with nothing to act on. Fall back to the email, and say so plainly when the
-- row belongs to somebody else.
create or replace function public.ensure_current_person()
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
  v_email text;
begin
  if auth.uid() is null then
    return;
  end if;

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
      -- people_auth_user_id_key: a concurrent login won the race.
      select pp.id into v_person_id
        from public.people pp
       where pp.auth_user_id = auth.uid();

      if v_person_id is null then
        -- people_email_key: a directory record already holds this address.
        select u.email into v_email from auth.users u where u.id = auth.uid();

        select pp.id into v_person_id
          from public.people pp
         where lower(pp.email) = lower(v_email)
           and not pp.is_anonymous
           and pp.auth_user_id is null
         order by pp.created_at asc
         limit 1;

        if v_person_id is not null then
          update public.people set auth_user_id = auth.uid() where id = v_person_id;
        else
          raise exception 'A directory record already uses this email address and is linked to a different portal account. An admin can merge the two records at People > Duplicates.';
        end if;
      end if;
    end;
  end if;

  return query
    select pp.id, pp.name, pp.preferred_name, pp.email
      from public.people pp
     where pp.id = v_person_id;
end;
$$;

-- set_preferred_name_for_user (20260902040000) has no handler at all on its
-- insert, so the same collision would reach an admin as a raw constraint error.
create or replace function public.set_preferred_name_for_user(p_user_id uuid, p_preferred_name text)
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
    select p.id into v_person_id
      from public.people p
      join auth.users u on lower(u.email) = lower(p.email)
     where p.auth_user_id is null
       and not p.is_anonymous
       and u.id = p_user_id
     order by p.created_at asc
     limit 1;

    if v_person_id is not null then
      update public.people set auth_user_id = p_user_id where id = v_person_id;
    else
      begin
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
      exception when unique_violation then
        raise exception 'A directory record already uses this account''s email address and is linked to someone else. Merge the two records at People > Duplicates first.';
      end;
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

-- resolve_or_create_person_by_email's select-then-insert is now a real race:
-- two concurrent public registrations for a new address both miss the select,
-- and the loser would surface a raw constraint error to a visitor. Recover by
-- re-reading, the standard upsert-race handling. Written as an exception block
-- rather than `on conflict`, which would have to restate this index's partial
-- predicate and silently stop matching the next time it changes.
--
-- With this, register_for_event, submit_volunteer_application and
-- request_gear_items are immune to the new constraint: there is no new
-- user-facing error for them to report.
create or replace function public.resolve_or_create_person_by_email(
  p_name text,
  p_email text,
  p_phone text default null,
  p_notes text default null,
  p_source_type text default 'other',
  p_role_flag text default null, -- accepted and ignored; see 20260903020000
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
      and not is_anonymous
    order by created_at asc
    limit 1;
  end if;

  if v_person_id is not null then
    return v_person_id;
  end if;

  begin
    insert into public.people
      (name, is_anonymous, source_type, email, phone, notes, created_by, instagram_handle)
    values (
      p_name, false, p_source_type, p_email, p_phone, p_notes, auth.uid(), p_instagram_handle
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
