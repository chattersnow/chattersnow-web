-- With the triggers from 20260903010000 in place, p_role_flag is redundant:
-- both callers that pass one insert the record that derives it immediately
-- afterwards. create_donation_with_items passes 'is_donor' and then inserts
-- into donations; submit_volunteer_application passes 'is_volunteer' and then
-- inserts into volunteer_applications. In both cases the trigger sets the
-- flag a moment later, from the record rather than from the caller's memory.
--
-- Worse, keeping it would preserve the second half of the bug: a flag written
-- straight onto the column is one the recompute has no record of, so deleting
-- the donation would leave the person a Donor forever.
--
-- The parameter stays in the signature -- five security-definer RPCs call
-- this positionally and rewriting them all is churn this ticket does not need
-- -- but it no longer writes anything. #624, which replaces the columns with
-- a view, is the natural point to drop the argument itself.
create or replace function public.resolve_or_create_person_by_email(
  p_name text,
  p_email text,
  p_phone text default null,
  p_notes text default null,
  p_source_type text default 'other',
  p_role_flag text default null, -- accepted and ignored; see above
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
    return v_person_id;
  end if;

  insert into public.people
    (name, is_anonymous, source_type, email, phone, notes, created_by, instagram_handle)
  values (
    p_name, false, p_source_type, p_email, p_phone, p_notes, auth.uid(), p_instagram_handle
  )
  returning id into v_person_id;

  return v_person_id;
end;
$$;

-- The person form's role checkboxes are manual assertions, so they write tags
-- rather than the columns -- a column write would be erased by the next
-- recompute. Replaces the whole set in one statement so unchecking a box
-- removes the tag; the trigger on person_role_tags then recomputes the flags.
--
-- security definer for the people_intake case: a volunteer creating an inline
-- contact from an event or donation form may assert a role without holding
-- people:manage, which is exactly what the people insert policy already
-- allows for the person row itself.
create function public.set_person_role_tags(
  p_person_id uuid,
  p_roles text[]
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not (public.has_permission('people', 'manage')
          or public.has_permission('people_intake', 'manage')) then
    raise exception 'Not authorized';
  end if;

  if not exists (select 1 from public.people where id = p_person_id) then
    raise exception 'No such person';
  end if;

  if exists (
    select 1 from unnest(coalesce(p_roles, '{}'::text[])) as role
     where role not in ('donor', 'sponsor', 'volunteer', 'attendee')
  ) then
    raise exception 'Unknown role';
  end if;

  delete from public.person_role_tags
   where person_id = p_person_id
     and role <> all (coalesce(p_roles, '{}'::text[]));

  insert into public.person_role_tags (person_id, role)
  select p_person_id, role from unnest(coalesce(p_roles, '{}'::text[])) as role
  on conflict (person_id, role) do nothing;

  -- The person_role_tags trigger covers the insert/delete cases; this also
  -- covers "no tags changed", so the caller always gets fresh flags back.
  perform public.sync_person_role_flags(p_person_id);
end;
$$;

grant execute on function public.set_person_role_tags(uuid, text[]) to authenticated;
