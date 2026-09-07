-- Partner becomes the sixth derived person role.
--
-- Partnerships have pointed at a people row since 20260830110000
-- (partnership_opportunities.organization_person_id), but "partner" was not a
-- role: partnerships-card.tsx said so explicitly, and both partnership
-- dialogs create their organization with is_sponsor -- so a partner who never
-- sponsored an event read as a sponsor, and showed up in /portal/sponsors.
-- This makes the relationship a role of its own, through the same seam Staff
-- used in 20260903050000.
--
-- Only 'closed_won' counts. The 20260830030000 header already draws that line
-- -- "no sponsor relationship exists until the partnership closes" -- and an
-- opportunity still being negotiated is a prospect, not a partner. A
-- person_role_tags row covers the partner recorded before an opportunity
-- exists, or one that never went through the pipeline at all.

-- The derivation probes this column once per row of the directory and filters
-- on stage, so the plain FK index from 20260830110000 is not the right shape.
create index if not exists partnership_opportunities_won_organization_idx
  on public.partnership_opportunities (organization_person_id)
  where stage = 'closed_won';

alter table public.person_role_tags
  drop constraint person_role_tags_role_check;
alter table public.person_role_tags
  add constraint person_role_tags_role_check
  check (role in ('donor', 'sponsor', 'volunteer', 'attendee', 'staff', 'partner'));

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
  is_staff boolean,
  is_partner boolean
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
                  where person_id = p_person_id and role = 'staff'),

    -- Only a won partnership. owner_person_id is deliberately not consulted:
    -- owning an opportunity is an internal staff duty, not partnership.
    exists (select 1 from public.partnership_opportunities
             where organization_person_id = p_person_id
               and stage = 'closed_won')
      or exists (select 1 from public.person_role_tags
                  where person_id = p_person_id and role = 'partner');
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

-- The person form's role checkboxes write through this, so it has to accept
-- the new value or Partner would be uncheckable from the directory.
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
     where role not in ('donor', 'sponsor', 'volunteer', 'attendee', 'staff', 'partner')
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
