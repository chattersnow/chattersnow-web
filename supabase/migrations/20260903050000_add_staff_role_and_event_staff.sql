-- #626. The fifth person type from technical-spec 5.9, which has been specced
-- as "not yet implemented" since the people directory was written.
--
-- Staff are people who work events in a paid or formally-scheduled capacity,
-- as distinct from volunteers -- and the same person can be both. They are
-- drawn from the same directory and assigned to individual events exactly the
-- way sponsors and volunteers are, so event_staff mirrors event_volunteers
-- (20260822030000) down to the unique constraint and the events-gated RLS.
--
-- Deliberately not an is_staff column. The spec described one, but #624
-- replaced every role column with a derivation, so staff arrives as one more
-- exists() in person_role_flags: an event_staff row makes someone staff, and
-- a person_role_tags row covers the person hired before any assignment exists.

create table public.event_staff (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  person_id uuid not null references public.people(id),
  role text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid not null default auth.uid() references auth.users(id),
  updated_by uuid references auth.users(id),
  constraint event_staff_unique_person unique (event_id, person_id)
);

create trigger set_updated_at before update on public.event_staff
  for each row execute function public.set_updated_at();

-- Same gate as event_volunteers and the rest of the event cluster
-- (20260822100000): view with events:view, write with events:manage.
alter table public.event_staff enable row level security;

create policy "event_staff select" on public.event_staff for select to authenticated
  using (public.has_permission('events', 'view'));
create policy "event_staff insert" on public.event_staff for insert to authenticated
  with check (public.has_permission('events', 'manage'));
create policy "event_staff update" on public.event_staff for update to authenticated
  using (public.has_permission('events', 'manage')) with check (public.has_permission('events', 'manage'));
create policy "event_staff delete" on public.event_staff for delete to authenticated
  using (public.has_permission('events', 'manage'));

grant select, insert, update, delete on public.event_staff to authenticated;

-- The derivation probes this column per row of the directory, same as the
-- eight indexed in 20260903030000.
create index event_staff_person_id_idx on public.event_staff (person_id);

-- 'staff' joins the manual assertions: someone hired for the season before
-- their first assignment exists is staff, and nothing derives that yet.
alter table public.person_role_tags
  drop constraint person_role_tags_role_check;
alter table public.person_role_tags
  add constraint person_role_tags_role_check
  check (role in ('donor', 'sponsor', 'volunteer', 'attendee', 'staff'));

-- person_role_flags gains an OUT column, which is a return-type change rather
-- than a replaceable body, so the function and everything built on it come
-- down and go back up together.
drop function public.primary_contact(public.people_with_roles);
drop view public.people_with_roles;
drop function public.person_role_flags(uuid);

create function public.person_role_flags(p_person_id uuid)
returns table (
  is_donor boolean,
  is_sponsor boolean,
  is_volunteer boolean,
  is_attendee boolean,
  is_staff boolean
)
language sql
stable
parallel safe
security definer
set search_path = public
as $$
  select
    exists (select 1 from public.donations where donor_id = p_person_id)
      or exists (select 1 from public.monetary_donations where donor_id = p_person_id)
      or exists (select 1 from public.giveaway_prizes where donor_person_id = p_person_id)
      or exists (select 1 from public.person_role_tags
                  where person_id = p_person_id and role = 'donor'),

    exists (select 1 from public.event_sponsors where person_id = p_person_id)
      or exists (select 1 from public.person_role_tags
                  where person_id = p_person_id and role = 'sponsor'),

    -- An application counts, carried over from 20260903010000:
    -- submit_volunteer_application has always flagged the applicant at
    -- submission time, before any signup or logged hour exists.
    exists (select 1 from public.event_volunteers where person_id = p_person_id)
      or exists (select 1 from public.volunteer_hours where person_id = p_person_id)
      or exists (select 1 from public.volunteer_applications where person_id = p_person_id)
      or exists (select 1 from public.person_role_tags
                  where person_id = p_person_id and role = 'volunteer'),

    exists (select 1 from public.event_registrations where person_id = p_person_id)
      or exists (select 1 from public.person_role_tags
                  where person_id = p_person_id and role = 'attendee'),

    exists (select 1 from public.event_staff where person_id = p_person_id)
      or exists (select 1 from public.person_role_tags
                  where person_id = p_person_id and role = 'staff');
$$;

grant execute on function public.person_role_flags(uuid) to authenticated;

create view public.people_with_roles
with (security_invoker = true) as
select
  p.*,
  f.is_donor,
  f.is_sponsor,
  f.is_volunteer,
  f.is_attendee,
  f.is_staff
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

-- The person form's role checkboxes write through this, so it has to accept
-- the new value or Staff would be uncheckable from the directory.
create or replace function public.set_person_role_tags(
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
     where role not in ('donor', 'sponsor', 'volunteer', 'attendee', 'staff')
  ) then
    raise exception 'Unknown role';
  end if;

  delete from public.person_role_tags
   where person_id = p_person_id
     and role <> all (coalesce(p_roles, '{}'::text[]));

  insert into public.person_role_tags (person_id, role)
  select p_person_id, role from unnest(coalesce(p_roles, '{}'::text[])) as role
  on conflict (person_id, role) do nothing;
end;
$$;
