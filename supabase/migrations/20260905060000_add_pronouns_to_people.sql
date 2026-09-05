-- Issue: record a person's pronouns.
--
-- The code of conduct (src/app/(public)/code-of-conduct/page.tsx) asks
-- everyone to "use the pronouns someone gives you", but until now there was
-- nowhere to give them: no column on people, no field on either public intake
-- form. Staff at the door and volunteer coordinators had memory and nothing
-- else.
--
-- Free text rather than an enum or a lookup table: any fixed list excludes
-- somebody, and a list this project would have to extend by migration is
-- worse than one the person can type. The forms offer the common sets as
-- datalist suggestions (src/lib/pronouns.ts) and accept anything. 40
-- characters holds "she/her", "they/them", "she/they" or a self-described set
-- while keeping the column from turning into a second notes field.
--
-- No index: this is a display field, never a filter or a search predicate.
-- It is also display-only by policy -- nothing may branch on it.

-- people_with_roles selects p.*, expanded at creation time, so a new people
-- column has to go through a drop and recreate -- flagged in 20260903030000 as
-- the cost of that shape, and done the same way in 20260903040000. The
-- computed relationship takes the view's composite type as its argument, so it
-- goes first and comes back after.
drop function public.primary_contact(public.people_with_roles);
drop view public.people_with_roles;

alter table public.people
  add column pronouns text check (char_length(pronouns) <= 40);

comment on column public.people.pronouns is
  'Optional, self-reported pronouns (e.g. "she/her", "they/them"). Written by the person themselves at /portal/account or on a public event-registration / volunteer-application form, or by an admin in People. Display only.';

create view public.people_with_roles
with (security_invoker = true) as
select
  p.*,
  f.is_donor,
  f.is_sponsor,
  f.is_volunteer,
  f.is_attendee,
  f.is_staff,
  f.is_partner
from public.people p
cross join lateral public.person_role_flags(p.id) f;

grant select on public.people_with_roles to authenticated;

create function public.primary_contact(public.people_with_roles)
returns setof public.people
rows 1
language sql
stable
as $$
  select * from public.people where id = $1.primary_contact_person_id;
$$;

grant execute on function public.primary_contact(public.people_with_roles) to authenticated;

-- Both intake tables keep their own copy, for the same reason they already
-- snapshot name/email/phone rather than reading them off the person: the row
-- is the record of what the applicant told us on that day. Pronouns can change
-- between a registration and the event, and the person record following that
-- change must not silently rewrite history on a past registration.
alter table public.event_registrations
  add column pronouns text check (char_length(pronouns) <= 40);

comment on column public.event_registrations.pronouns is
  'Pronouns as given on this registration. A snapshot, like name/email/phone here -- the person''s current pronouns live on people.pronouns.';

alter table public.volunteer_applications
  add column pronouns text check (char_length(pronouns) <= 40);

comment on column public.volunteer_applications.pronouns is
  'Pronouns as given on this application. A snapshot, like name/email/phone here -- the person''s current pronouns live on people.pronouns.';

-- Self-serve: /portal/account. Modelled on set_my_preferred_name
-- (20260902040000) and security definer for the same reason it documents --
-- people update RLS requires people:manage, which board and volunteer accounts
-- do not hold, yet every signed-in user must be able to state their own
-- pronouns.
create function public.set_my_pronouns(p_pronouns text)
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
     set pronouns = nullif(btrim(p_pronouns), '')
   where id = v_person_id;
end;
$$;

grant execute on function public.set_my_pronouns(text) to authenticated;

-- /portal/account renders the field it edits, so the resolver that page uses
-- has to return it. Adding an OUT column is a return-type change rather than a
-- replaceable body, so this drops first. Body is 20260904190000's verbatim
-- apart from the extra column in the return type and the final select.
drop function public.ensure_current_person();

create function public.ensure_current_person()
returns table (
  person_id uuid,
  name text,
  preferred_name text,
  pronouns text,
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
    select pp.id, pp.name, pp.preferred_name, pp.pronouns, pp.email
      from public.people pp
     where pp.id = v_person_id;
end;
$$;

grant execute on function public.ensure_current_person() to authenticated;
